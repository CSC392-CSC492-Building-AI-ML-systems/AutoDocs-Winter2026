"""
build_dataset.py
----------------
Pairs model1/inputs/*_parsed.xml with model1/model1_fixed_outputs/*_training.txt
and produces a JSONL fine-tuning dataset.

Each output line is:
  {"instruction": <static prompt>, "input": <curr_depth + neighbor_tail + event xml>, "output": "<annotation>\\n<depth>"}

Usage:
  python build_dataset.py [--output dataset.jsonl] [--n_neighbors 20]
"""

import argparse
import json
import os
import re
from lxml import etree

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUTS_DIR = os.path.join(SCRIPT_DIR, "inputs")
FIXED_OUTPUTS_DIR = os.path.join(SCRIPT_DIR, "model1_fixed_outputs")

# ---------------------------------------------------------------------------
# Static instruction (same system prompt used at inference time)
# ---------------------------------------------------------------------------
FEWSHOTS_BLOCK = """
EXAMPLES (for reference only)

EXAMPLE A — Starting a backup subtask (depth=-1)
neighbor_tail:
  - id=0 depth=0  summary="List project directory contents"
  - id=1 depth=0  summary="Inspect size of source and data folders"
currDepth: 0
input xml:
<event>
  <user_input>t</user_input><system_output>t</system_output>
  <user_input>a</user_input><system_output>a</system_output>
  <user_input>r</user_input><system_output>r</system_output>
  <user_input> </user_input><system_output> </system_output>
  <user_input>-</user_input><system_output>-</system_output>
  <user_input>c</user_input><system_output>c</system_output>
  <user_input>z</user_input><system_output>z</system_output>
  <user_input>f</user_input><system_output>f</system_output>
  <user_input> </user_input><system_output> </system_output>
  <user_input>b</user_input><system_output>b</system_output>
  <user_input>a</user_input><system_output>a</system_output>
  <user_input>c</user_input><system_output>c</system_output>
  <user_input>k</user_input><system_output>k</system_output>
  <user_input>u</user_input><system_output>u</system_output>
  <user_input>p</user_input><system_output>p</system_output>
  <user_input>.</user_input><system_output>.</system_output>
  <user_input>t</user_input><system_output>t</system_output>
  <user_input>a</user_input><system_output>a</system_output>
  <user_input>r</user_input><system_output>r</system_output>
  <user_input> </user_input><system_output> </system_output>
  <user_input>s</user_input><system_output>s</system_output>
  <user_input>r</user_input><system_output>r</system_output>
  <user_input>c</user_input><system_output>c</system_output>
  <system_output>Creating backup.tar...</system_output>
</event>
output:
{"annotation": "Create compressed backup archive of source data", "depth": -1}

═══════════════════════════════════════════════════════════════════════════════

EXAMPLE B — Continuing backup subtask (depth=0)
neighbor_tail:
  - id=2 depth=-1 summary="Create compressed backup archive of source data"
currDepth: -1
input xml:
<event>
  <user_input>l</user_input><system_output>l</system_output>
  <user_input>s</user_input><system_output>s</system_output>
  <user_input> </user_input><system_output> </system_output>
  <user_input>-</user_input><system_output>-</system_output>
  <user_input>l</user_input><system_output>l</system_output>
  <user_input>h</user_input><system_output>h</system_output>
  <user_input> </user_input><system_output> </system_output>
  <user_input>b</user_input><system_output>b</system_output>
  <user_input>a</user_input><system_output>a</system_output>
  <user_input>c</user_input><system_output>c</system_output>
  <user_input>k</user_input><system_output>k</system_output>
  <user_input>u</user_input><system_output>u</system_output>
  <user_input>p</user_input><system_output>p</system_output>
  <user_input>.</user_input><system_output>.</system_output>
  <user_input>t</user_input><system_output>t</system_output>
  <user_input>a</user_input><system_output>a</system_output>
  <user_input>r</user_input><system_output>r</system_output>
  <system_output>-rw-r--r-- 1 user staff 42M backup.tar</system_output>
</event>
output:
{"annotation": "Verify backup archive and check file size", "depth": 0}

═══════════════════════════════════════════════════════════════════════════════

EXAMPLE C — Finishing backup subtask (depth=+1)
neighbor_tail:
  - id=2 depth=-1 summary="Create compressed backup archive of source data"
  - id=3 depth=0  summary="Verify backup archive and check file size"
currDepth: -1
input xml:
<event>
  <user_input>m</user_input><user_input>v</user_input><user_input> </user_input>
  <user_input>b</user_input><user_input>a</user_input><user_input>c</user_input>
  <system_output>Moved to archive/</system_output>
</event>
output:
{"annotation": "Move backup to archive folder and complete backup task", "depth": 1}

═══════════════════════════════════════════════════════════════════════════════

EXAMPLE D — Starting test/debug subtask (depth=-1)
currDepth: 0
input xml:
<event>
  <user_input>p</user_input><user_input>y</user_input><user_input>t</user_input><user_input>e</user_input><user_input>s</user_input><user_input>t</user_input>
  <system_output>===== test session starts =====</system_output>
</event>
output:
{"annotation": "Start pytest test run for project", "depth": -1}

═══════════════════════════════════════════════════════════════════════════════

EXAMPLE E — Nested editor within environment setup (depth=-1)
currDepth: -1
input xml:
<event>
  <user_input>v</user_input><user_input>i</user_input><user_input>m</user_input>
  <system_output>Opening vim...</system_output>
</event>
output:
{"annotation": "Open config file in vim during environment setup", "depth": -1}

═══════════════════════════════════════════════════════════════════════════════

EXAMPLE F — Exit editor, stay in parent task (depth=+1)
currDepth: -2
input xml:
<event>
  <user_input>:</user_input><user_input>w</user_input><user_input>q</user_input>
  <system_output>(venv) $</system_output>
</event>
output:
{"annotation": "Save config changes and exit vim", "depth": 1}
"""

SUMMARY_WORD_LIMIT = 50

INSTRUCTION = f"""You are an expert terminal session annotator. Identify goals/subgoals and generate concise action summaries.

DEPTH SEMANTICS:
- depth = -1: STARTING a new subtask (entering deeper level)
- depth = 0:  CONTINUING at same level (ongoing work)
- depth = +1: FINISHING a subtask (returning to parent level)

Rules:
- The user's keystrokes appear separately; combine them to form the full command before interpreting it
- depth is an integer (>= -1); -1 for subevent (new task started), 0 for same level, >0 to exit levels
- maintain stack invariant: currDepth <= 0; if depth == -1 then currDepth -= 1; if depth > 0 then currDepth += depth
- write action-oriented summaries (<=  {SUMMARY_WORD_LIMIT} words); avoid "user", "they", "typed", "inputs", "enters a command"
- depth is relative to the previous events only

Output format — output EXACTLY ONE valid JSON object:
{{"annotation": "<action summary <= {SUMMARY_WORD_LIMIT} words>", "depth": <integer >= -1>}}

Examples:
{FEWSHOTS_BLOCK}"""


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def load_events_xml(xml_path: str) -> list[str]:
    """Return list of serialized <event> XML strings."""
    parser = etree.XMLParser(recover=True)
    tree = etree.parse(xml_path, parser)
    root = tree.getroot()
    events = []
    for ev_el in root.xpath("//event"):
        # Skip empty events (no children and no text)
        if len(ev_el) == 0 and not (ev_el.text and ev_el.text.strip()):
            continue
        xml_str = etree.tostring(ev_el, encoding="unicode")
        events.append(xml_str)
    return events


def load_annotations(txt_path: str) -> list[tuple[str, int]]:
    """
    Parse training.txt into list of (annotation, depth) pairs.
    Format is alternating lines: annotation, depth, annotation, depth, ...
    Trailing blank lines are ignored.
    """
    with open(txt_path, encoding="utf-8") as f:
        lines = [l.rstrip("\n") for l in f.readlines()]

    # Strip trailing empty lines
    while lines and lines[-1].strip() == "":
        lines.pop()

    pairs = []
    i = 0
    while i + 1 < len(lines):
        annotation = lines[i].strip().strip('"')
        depth_str = lines[i + 1].strip()
        try:
            depth = int(depth_str)
        except ValueError:
            print(f"  WARNING: could not parse depth '{depth_str}' at line {i+2} in {txt_path}, skipping pair")
            i += 2
            continue
        pairs.append((annotation, depth))
        i += 2

    return pairs


def compute_curr_depth(depths: list[int]) -> int:
    """Compute running depth stack value from a list of past depths."""
    curr = 0
    for d in depths:
        if d == -1:
            curr -= 1
        elif d > 0:
            curr += d
    return curr


def build_input(
    event_xml: str,
    event_idx: int,
    past_annotations: list[tuple[str, int]],
    n_neighbors: int,
    max_chars: int = 3000,
) -> str:
    """Build the dynamic input string for one event."""
    curr_depth = compute_curr_depth([d for _, d in past_annotations])

    neighbor_start = max(0, len(past_annotations) - n_neighbors)
    neighbor_lines = [
        f"  - id={neighbor_start + j} depth={d}  summary=\"{ann}\""
        for j, (ann, d) in enumerate(past_annotations[neighbor_start:])
    ]
    neighbor_block = "\n".join(neighbor_lines) if neighbor_lines else "  (none)"

    # Truncate very large event XML
    if len(event_xml) > max_chars:
        event_xml = (
            event_xml[:1000]
            + f"\n\n... [ SYSTEM OUTPUT TRUNCATED - HIDDEN {len(event_xml) - max_chars} CHARACTERS ] ...\n\n"
            + event_xml[-2000:]
        )

    return (
        f"neighbor_tail:\n{neighbor_block}\n"
        f"currDepth: {curr_depth}\n"
        f"input xml:\n"
        f'<target id="{event_idx}">\n{event_xml}\n</target>'
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def find_pairs() -> list[tuple[str, str]]:
    """Return list of (xml_path, txt_path) for matched files."""
    input_files = {
        re.sub(r"_parsed\.xml$", "", f): os.path.join(INPUTS_DIR, f)
        for f in os.listdir(INPUTS_DIR)
        if f.endswith("_parsed.xml")
    }
    output_files = {
        re.sub(r"_training\.txt$", "", f): os.path.join(FIXED_OUTPUTS_DIR, f)
        for f in os.listdir(FIXED_OUTPUTS_DIR)
        if f.endswith("_training.txt")
    }

    matched = sorted(set(input_files) & set(output_files))
    unmatched_in = set(input_files) - set(output_files)
    unmatched_out = set(output_files) - set(input_files)

    if unmatched_in:
        print(f"Inputs with no matching output (skipped): {sorted(unmatched_in)}")
    if unmatched_out:
        print(f"Outputs with no matching input (skipped): {sorted(unmatched_out)}")

    return [(input_files[k], output_files[k]) for k in matched]


def process_pair(xml_path: str, txt_path: str, n_neighbors: int) -> list[dict]:
    stem = os.path.basename(xml_path)
    events = load_events_xml(xml_path)
    annotations = load_annotations(txt_path)

    if len(events) != len(annotations):
        print(f"  WARNING: {stem} has {len(events)} events but {len(annotations)} annotations — skipping")
        return []

    records = []
    past: list[tuple[str, int]] = []

    for i, (event_xml, (ann, depth)) in enumerate(zip(events, annotations)):
        inp = build_input(event_xml, i, past, n_neighbors)
        output = json.dumps({"annotation": ann, "depth": depth})
        records.append({
            "instruction": INSTRUCTION,
            "input": inp,
            "output": output,
        })
        past.append((ann, depth))

    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="model1_dataset.jsonl")
    parser.add_argument("--n_neighbors", type=int, default=20)
    args = parser.parse_args()

    pairs = find_pairs()
    print(f"Found {len(pairs)} matched file pairs\n")

    total = 0
    output_path = os.path.join(SCRIPT_DIR, args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        for xml_path, txt_path in pairs:
            stem = os.path.basename(xml_path)
            try:
                records = process_pair(xml_path, txt_path, args.n_neighbors)
            except Exception as e:
                print(f"  ERROR processing {stem}: {e} — skipping")
                continue
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(f"  {stem}: {len(records)} samples")
            total += len(records)

    print(f"\nWrote {total} total samples to {output_path}")


if __name__ == "__main__":
    main()
