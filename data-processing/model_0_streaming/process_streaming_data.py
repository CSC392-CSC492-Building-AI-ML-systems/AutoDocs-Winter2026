#!/usr/bin/env python3
"""
Streaming-Based Terminal Log Boundary Generator (Batch Processor)

This script processes multiple raw XML terminal logs and their corresponding 
timestamp files. It converts them into a sliding-window training dataset 
formatted for Large Language Model (LLM) fine-tuning.

Key Features:
1. Batch Processing: Automatically pairs .xml and .time.txt files from directories.
2. Sliding Window: Feeds the model N previous events to predict the current event.
3. Class Balancing: Globally balances "Old" (non-boundary) vs "New" (boundary) 
   events to a specific ratio to prevent the model from guessing the majority class.
4. Hard Negative Mining: Prioritizes tricky events (like the user hitting Enter) 
   to make the model smarter.
5. Two-Phase Truncation: Compresses massive terminal outputs (like `apt-get` logs) 
   to save memory, while strictly preserving XML tags and timestamps to maintain 
   the timeline.
"""

import os
import re
import json
import random
import argparse

# ==========================================
# CONFIGURATION & HYPERPARAMETERS
# ==========================================
DEFAULT_XML_DIR = "inputs"
DEFAULT_TIME_DIR = "timestamp-output"

WINDOW_SIZE = 15        # Number of XML chunks to show the model as historical context
NEGATIVE_RATIO = 2      # Ratio of 'old events' to keep per 'new event' (e.g., 2 = 2:1 ratio)
TRUNCATE_MAX_LINES = 15 # Max lines allowed inside a single <system_output> block

# Regex to extract valid XML nodes (handles self-closing and standard tags)
CHUNK_RE = re.compile(r"<(user_input|system_output)\b[^>]*?(?:/>|>.*?</\1>)", flags=re.DOTALL)
# Regex to extract the exact timestamp float string
TIME_RE = re.compile(r'timestamp="([\d\.]+)"')

# The exact prompt used during both training and inference
SYSTEM_PROMPT = """Your task is to analyze terminal XML logs and determine whether the timestamp in the TARGET LINE belongs to a "new event" or an "old event".

### DEFINITION OF A NEW EVENT:
1. **Explicit Prompts:** The very first `<user_input>` that immediately follows a shell prompt (e.g., `demo@faiserver:~$`).
2. **Phase Transitions:** In automated logs, moving from one major build stage to another (e.g., from 'fai-mirror finished' to 'Copying the nfsroot').
3. **Internal Logic:** Shifts from downloading to processing.

### WHAT IS *NOT* A NEW EVENT (OLD EVENT):
- **User Input / Keystrokes:** A user typing a command, including pressing the Enter key (a newline `\\n`), is just the completion of the input phase.
- **Incomplete Tasks:** Continuous system output without a clear phase shift.

CRITICAL INSTRUCTION: You must classify ONLY the timestamp found in the "### TARGET LINE" section. Do NOT extract timestamps from the "### CONTEXT" section. Output only the timestamp and the classification. Do NOT use brackets, periods, explanations, or markdown formatting.

Output Format Example 1: 39.229814, old event
Output Format Example 2: 111.602501, new event"""


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_timestamp(chunk_text: str) -> str:
    """Extracts the timestamp as a string from an XML chunk to avoid float precision issues."""
    match = TIME_RE.search(chunk_text)
    return match.group(1) if match else ""

def is_hard_negative(chunk_text: str) -> bool:
    """
    Identifies if a chunk is a 'Hard Negative'. 
    A hard negative is a common false-positive trigger, such as a user pressing 
    the Enter key (a newline inside a user_input tag). We prioritize training on these.
    """
    if "<user_input>" in chunk_text and "\n" in chunk_text:
        return True
    return False

def truncate_single_chunk(raw_text: str, tag_type: str, max_lines: int) -> str:
    """
    PHASE 1 TRUNCATION (Intra-Chunk):
    Evaluates a single XML block. If it contains too many lines of text, it slices 
    out the middle, leaving only the top and bottom lines.
    """
    # Only truncate system outputs. Never truncate user inputs or self-closing tags.
    if tag_type != "system_output" or raw_text.endswith("/>"):
        return raw_text
        
    first_close = raw_text.find(">")
    last_open = raw_text.rfind("</")
    
    if first_close == -1 or last_open == -1:
        return raw_text
        
    opening_tag = raw_text[:first_close+1]
    closing_tag = raw_text[last_open:]
    inner_text = raw_text[first_close+1:last_open]
    
    lines = inner_text.split('\n')
    
    if len(lines) > max_lines:
        head = '\n'.join(lines[:5])
        tail = '\n'.join(lines[-5:])
        removed = len(lines) - 10
        return f"{opening_tag}{head}\n\n... [TRUNCATED {removed} LINES] ...\n\n{tail}{closing_tag}"
        
    return raw_text

def compress_context_window(chunks, max_total_lines=25):
    """
    PHASE 2 TRUNCATION (Window-Level):
    Evaluates the entire historical context window. If the combined total length is 
    too massive, it strips the text from the middle chunks, leaving ONLY their 
    XML tags and timestamps intact to preserve the timeline sequence.
    """
    total_lines = sum(len(c["text"].split('\n')) for c in chunks)
    if total_lines <= max_total_lines:
        return "\n".join([c["text"] for c in chunks])
        
    result = []
    for idx, c in enumerate(chunks):
        raw_text = c["text"]
        
        # Keep the top 5 chunks (start of sequence) and bottom 5 (immediate history) intact
        if idx < 5 or idx >= len(chunks) - 5:
            result.append(raw_text)
        else:
            # Strip the middle chunks, preserving only the <tags>
            if "<system_output" in raw_text and not raw_text.endswith("/>"):
                first_close = raw_text.find(">")
                last_open = raw_text.rfind("</")
                if first_close != -1 and last_open != -1:
                    opening_tag = raw_text[:first_close+1]
                    closing_tag = raw_text[last_open:]
                    result.append(f"{opening_tag}... [TRUNCATED TO SAVE SPACE] ...{closing_tag}")
                else:
                    result.append(raw_text)
            else:
                result.append(raw_text)
                
    return "\n".join(result)


# ==========================================
# MAIN EXECUTION
# ==========================================

def main():
    # Setup CLI Arguments
    parser = argparse.ArgumentParser(description="Generate a balanced LLM dataset from terminal XML logs.")
    parser.add_argument("--xml_dir", default=DEFAULT_XML_DIR, help="Directory containing raw XML logs.")
    parser.add_argument("--time_dir", default=DEFAULT_TIME_DIR, help="Directory containing ground truth txt files.")
    parser.add_argument("--out", default="streaming_dataset.jsonl", help="Output JSONL dataset path.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic sampling.")
    args = parser.parse_args()

    random.seed(args.seed)

    if not os.path.exists(args.xml_dir) or not os.path.exists(args.time_dir):
        print("Error: One or both of the specified directories do not exist.")
        return

    # Global lists to aggregate data across ALL processed files
    global_positives = []
    global_hard_negatives = []
    global_easy_negatives = []

    xml_files = [f for f in os.listdir(args.xml_dir) if f.endswith('.xml')]
    print(f"🔍 Found {len(xml_files)} XML files to check.")

    files_processed = 0

    # Step 1: Iterate through files and find matches
    for xml_filename in xml_files:
        base_id = xml_filename.split('.')[0]
        time_filename = f"{base_id}.time.txt"
        
        xml_path = os.path.join(args.xml_dir, xml_filename)
        time_path = os.path.join(args.time_dir, time_filename)

        if not os.path.exists(time_path):
            print(f"  [SKIPPING] {xml_filename} - No matching time file found.")
            continue

        print(f"  [PROCESSING] Matched {xml_filename} with {time_filename}")
        files_processed += 1

        # Load ground truth boundary timestamps into a fast-lookup Set
        with open(time_path, 'r') as f:
            boundaries_set = set(line.strip() for line in f if line.strip())

        # Step 2: Parse raw XML and apply Phase 1 truncation
        with open(xml_path, 'r') as f:
            xml_content = f.read()
        
        all_chunks = []
        for match in CHUNK_RE.finditer(xml_content):
            tag_type = match.group(1) 
            raw_text = match.group(0)
            
            processed_text = truncate_single_chunk(raw_text, tag_type, TRUNCATE_MAX_LINES)
            
            ts_str = get_timestamp(processed_text)
            if ts_str:
                all_chunks.append({"ts": ts_str, "text": processed_text})

        if len(all_chunks) < WINDOW_SIZE:
            print(f"    -> Warning: File too short to process (chunks < {WINDOW_SIZE}).")
            continue

        # Step 3: Build Sliding Windows and categorize events
        for i in range(WINDOW_SIZE, len(all_chunks) + 1):
            window_chunks = all_chunks[i - WINDOW_SIZE : i]
            
            context_chunks = window_chunks[:-1]
            target_chunk = window_chunks[-1]
            
            target_ts = target_chunk["ts"]
            is_boundary = target_ts in boundaries_set
            
            # Apply Phase 2 Window Compression
            context_text = compress_context_window(context_chunks, max_total_lines=25)
            target_text = target_chunk["text"]
            
            # Structure the final prompt with physical isolation barriers
            structured_input = f"### CONTEXT (Previous Events):\n{context_text}\n\n### TARGET LINE (Extract and Classify THIS Timestamp):\n{target_text}"
            
            data_point = {
                "file_id": base_id,
                "index": i, 
                "json_data": {
                    "instruction": SYSTEM_PROMPT,
                    "input": structured_input,
                    "output": f"{target_ts}, {'new' if is_boundary else 'old'} event"
                }
            }
            
            # Categorize the sample for later balancing
            if is_boundary:
                global_positives.append(data_point)
            else:
                if is_hard_negative(target_text):
                    global_hard_negatives.append(data_point)
                else:
                    global_easy_negatives.append(data_point)

    print(f"\n✅ Finished scanning. Processed {files_processed} matched files.")

    # Step 4: Enforce the Global Ratio (Negative Downsampling)
    num_positives = len(global_positives)
    target_negatives = num_positives * NEGATIVE_RATIO
    
    selected_negatives = []
    random.shuffle(global_hard_negatives)
    random.shuffle(global_easy_negatives)

    # Prioritize hard negatives to make the dataset challenging
    if len(global_hard_negatives) >= target_negatives:
        selected_negatives = global_hard_negatives[:target_negatives]
    else:
        selected_negatives = global_hard_negatives
        remaining_needed = target_negatives - len(selected_negatives)
        
        if len(global_easy_negatives) >= remaining_needed:
            selected_negatives += global_easy_negatives[:remaining_needed]
        else:
            selected_negatives += global_easy_negatives 

    # Step 5: Recombine, Sort Chronologically, and Save
    final_dataset = global_positives + selected_negatives
    # Sorting ensures events from the same file remain in chronological order
    final_dataset.sort(key=lambda x: (x["file_id"], x["index"]))

    with open(args.out, 'w') as f:
        for item in final_dataset:
            f.write(json.dumps(item["json_data"], ensure_ascii=False) + "\n")
            
    print(f"\n🎉 Done! Created {len(final_dataset)} total examples in '{args.out}'.")
    print(f"📊 Dataset Balance: {len(global_positives)} Positives (New) | {len(selected_negatives)} Negatives (Old)")

if __name__ == "__main__":
    main()