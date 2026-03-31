#!/usr/bin/env python3
import os
import re
import json
import argparse

# --- CONFIGURATION ---
DEFAULT_XML = "inputs/1728236638.rec.xml"
DEFAULT_TIME = "timestamp-output/1728236638.time.txt"

CHUNK_RE = re.compile(r"<(user_input|system_output)\b[^>]*?(?:/>|>.*?</\1>)", flags=re.DOTALL)
TIME_RE = re.compile(r'timestamp="([\d\.]+)"')

# def get_instruction(start_ts):
#     """Generates the specialized instruction for a specific starting timestamp."""
#     return f"""You are a strict data extraction algorithm. Your only purpose is to output a single numerical timestamp from the provided XML log.
# ### DEFINITION OF A BOUNDARY:
# A boundary is the **very first** `<system_output>` tag that contains a shell prompt (e.g., `demo@faiserver:~$` or `root@box:~#`).

# ### YOUR ALGORITHM:
# 1. **IDENTIFY START:** Acknowledge the known starting timestamp of the current chunk: {start_ts}.
# 2. **SCAN FORWARD:** Read the XML sequentially, starting FROM the tag containing {start_ts}.
# 3. **LOCATE PROMPT:** Find the first `<system_output>` tag that contains a shell prompt.
# 4. **EXTRACT:** Copy the exact numerical value from the `timestamp="..."` attribute of that specific tag.

# ### CRITICAL GUARDRAILS (ZERO TOLERANCE):
# - **NO REPEATING:** You are strictly forbidden from outputting {start_ts}. If your answer is {start_ts}, you have failed.
# - **NO LISTS:** You must stop searching immediately after finding the first boundary. Never output more than one number.
# - **NO HALLUCINATION:** The number you output must exist character-for-character in the input XML. Do not round or invent numbers.
# - **NO CHATTER:** Output nothing but the digits. No markdown, no "Analysis", no quotes.

# ### EXAMPLES:

# [Input]
#   <user_input timestamp="49.618611">\\n</user_input>
#   <system_output timestamp="50.17642">Removing libgail-common...</system_output>
#   <system_output timestamp="50.707172">demo@faiserver:~$ </system_output>
#   <user_input timestamp="53.176514">s</user_input>
# [Output]
# 50.707172

# ### FINAL COMMAND:
# The known start is {start_ts}. Find the first shell prompt occurring after this point. Output ONLY its exact timestamp."""
def get_instruction(start_ts: float) -> str:
    """Generates the specialized instruction for a specific starting timestamp."""
    return f"""You are a strict data extraction algorithm. Your purpose is to output ONLY the numerical timestamp of the next command event in the XML log.

### DEFINITION OF A BOUNDARY:
A boundary is the **first `<user_input>` tag following any system-provided state where the terminal is awaiting input.**
An input state includes:
1. **Shell Prompts:** Lines containing `$` or `#` (e.g., `user@host:~$`).
2. **Authentication:** Prompts asking for secrets (e.g., `password for`, `[sudo]`).
3. **Interactive Pagers:** Terminal states indicating a pause or waiting for user interaction (e.g., `(END)`, `[7m`, or prompts lacking a trailing newline).

### YOUR ALGORITHM:
1. **START POINT:** The current cursor is at timestamp: {start_ts}.
2. **SCAN:** Begin reading the log sequentially, looking only at `<system_output>` tags that occur AFTER {start_ts}.
3. **IDENTIFY STATE:** Determine if the system is waiting for input based on the definitions above.
4. **EXTRACT:** Identify the very next `<user_input>` tag following that state. 
5. **OUTPUT:** Extract the `timestamp` value from that `<user_input>` tag.

### CRITICAL GUARDRAILS (ZERO TOLERANCE):
- **STRICT ADVANCEMENT:** The output timestamp must be strictly greater than {start_ts}.
- **NO CHATTER:** Output ONLY the digits. No headers, no markdown, no quotes.
- **NO LISTS:** Return only one single timestamp per execution.
- **NO HALLUCINATION:** The value must exist exactly as written in the source XML.

### FINAL COMMAND:
Find the first instance of a shell prompt, password request, or pager waiting state occurring after timestamp {start_ts}, and return the timestamp of the immediate next `<user_input>` tag. Output ONLY that number."""
def get_timestamp(chunk_text: str) -> float:
    match = TIME_RE.search(chunk_text)
    return float(match.group(1)) if match else -1.0

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", default=DEFAULT_XML)
    parser.add_argument("--time", default=DEFAULT_TIME)
    parser.add_argument("--out", default="timestamp_dataset.jsonl")
    args = parser.parse_args()

    # 1. Load ground truth boundaries
    if not os.path.exists(args.time):
        print(f"Error: {args.time} not found.")
        return
        
    with open(args.time, 'r') as f:
        boundaries = [line.strip() for line in f if line.strip()]
        b_floats = [float(b) for b in boundaries]

    print(f"DEBUG: Loaded {len(b_floats)} timestamps from {args.time}")
    
    if len(b_floats) < 2:
        print("DEBUG: ❌ Need at least 2 timestamps to create a window.")
        return

    # 2. Parse raw XML into chunks
    with open(args.xml, 'r') as f:
        xml_content = f.read()
    
    all_chunks = []
    for match in CHUNK_RE.finditer(xml_content):
        raw = match.group(0)
        ts = get_timestamp(raw)
        if ts >= 0:
            all_chunks.append({"ts": ts, "text": raw})
            
    print(f"DEBUG: Extracted {len(all_chunks)} XML chunks.")

    # 3. Slice into windows
    dataset = []
    
    for i in range(len(b_floats) - 1):
        start_ts_str = boundaries[i]
        start_ts_float = b_floats[i]
        target_ts_str = boundaries[i+1]
        
        if i + 2 < len(b_floats):
            end_ts_float = b_floats[i+2]
        else:
            end_ts_float = float('inf')
        
        # CHANGED: start_ts_float <= c["ts"] ensures the starting tag is included in the 'input'
        window = [c["text"] for c in all_chunks if start_ts_float <= c["ts"] <= end_ts_float]
        
        if not window:
            print(f"DEBUG: ⚠️ Window {i+1} is EMPTY between {start_ts_float} and {end_ts_float}")
        else:
            print(f"DEBUG: ✅ Window {i+1} found {len(window)} chunks. Target: {target_ts_str}")
            dataset.append({
                "instruction": get_instruction(start_ts_str),
                "input": "\n".join(window),
                "output": target_ts_str
            })

    # 4. Save to JSONL
    with open(args.out, 'w') as f:
        for row in dataset:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            
    print(f"\nDone! Created {len(dataset)} examples in {args.out}")

if __name__ == "__main__":
    main()