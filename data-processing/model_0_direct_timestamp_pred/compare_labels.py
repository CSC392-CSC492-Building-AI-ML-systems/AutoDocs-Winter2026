"""
compare_labels.py

For each session present in all three folders, prints a side-by-side comparison of:
  - Ground-truth boundaries: timestamps from timestamp-output/ mapped to line numbers
    in the corresponding inputs/ XML
  - Predicted chunk boundaries: first line number of each 0-delimited chunk in outputs/

Run from the model_0/ directory:
    python compare_labels.py
"""

import os
import re

INPUT_DIR    = "inputs"
LABEL_DIR    = "timestamp-output"
OUTPUT_DIR   = "outputs"


def get_base_names():
    """Return base names present in all three folders."""
    def bases_from(folder, strip_suffixes):
        result = set()
        for fname in os.listdir(folder):
            base = fname
            for suffix in strip_suffixes:
                if fname.endswith(suffix):
                    base = fname[:-len(suffix)]
                    break
            result.add(base)
        return result

    input_bases  = bases_from(INPUT_DIR,  [".rec.xml", ".asciinema.xml", ".cast.xml", ".xml"])
    label_bases  = bases_from(LABEL_DIR,  [".time.txt"])
    output_bases = bases_from(OUTPUT_DIR, [".xml.txt"])

    common = input_bases & label_bases & output_bases
    return sorted(common)


def find_input_xml(base):
    for suffix in (f"{base}.rec.xml", f"{base}.asciinema.xml", f"{base}.cast.xml", f"{base}.xml"):
        path = os.path.join(INPUT_DIR, suffix)
        if os.path.exists(path):
            return path
    return None


def read_timestamps(base):
    """Return list of timestamp strings from the .time.txt file."""
    path = os.path.join(LABEL_DIR, f"{base}.time.txt")
    timestamps = []
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line:
                timestamps.append(line)
    return timestamps


def find_timestamp_lines(xml_path, timestamps):
    """
    Scan the parsed XML line by line.
    For each timestamp string, record the first line number (1-indexed)
    where timestamp="<value>" appears.
    Returns dict: { timestamp_str -> line_number or None }
    """
    remaining = set(timestamps)
    result = {ts: None for ts in timestamps}

    with open(xml_path, encoding="utf-8", errors="ignore") as f:
        for lineno, line in enumerate(f, start=1):
            if not remaining:
                break
            for ts in list(remaining):
                if f'timestamp="{ts}"' in line:
                    result[ts] = lineno
                    remaining.discard(ts)

    return result


def read_chunk_first_lines(base):
    """
    Parse outputs/<base>.xml.txt.
    Each line is an integer; 0 separates chunks.
    Returns list of first-line-numbers, one per chunk.
    """
    path = os.path.join(OUTPUT_DIR, f"{base}.xml.txt")
    chunk_firsts = []
    in_chunk = False
    current_first = None

    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                val = int(line)
            except ValueError:
                continue

            if val == 0:
                if in_chunk:
                    chunk_firsts.append(current_first)
                    in_chunk = False
                    current_first = None
            else:
                if not in_chunk:
                    in_chunk = True
                    current_first = val

    # flush last chunk if file doesn't end with a 0
    if in_chunk and current_first is not None:
        chunk_firsts.append(current_first)

    return chunk_firsts


def compare_session(base):
    xml_path = find_input_xml(base)
    if xml_path is None:
        print(f"[WARN] No input XML found for '{base}', skipping.")
        return

    timestamps = read_timestamps(base)
    if not timestamps:
        print(f"[WARN] Empty timestamp file for '{base}', skipping.")
        return

    ts_lines = find_timestamp_lines(xml_path, timestamps)
    chunk_firsts = read_chunk_first_lines(base)

    print(f"\n{'='*60}")
    print(f"Session: {base}")
    print(f"{'='*60}")

    print("Ground-truth boundaries (timestamp-output -> input XML line):")
    for i, ts in enumerate(timestamps, start=1):
        lineno = ts_lines[ts]
        line_str = str(lineno) if lineno is not None else "NOT FOUND"
        print(f"  [{i:2d}] ts={ts:<18s} -> line {line_str}")

    print("\nChunk first lines (outputs):")
    if chunk_firsts:
        for i, first in enumerate(chunk_firsts, start=1):
            print(f"  chunk {i:2d}: first line = {first}")
    else:
        print("  (no chunks found)")

    n_gt     = len(timestamps)
    n_chunks = len(chunk_firsts)
    match    = "OK" if n_gt == n_chunks else "MISMATCH"
    print(f"\nCounts: {n_gt} gt timestamps, {n_chunks} chunks  [{match}]")


def main():
    bases = get_base_names()
    if not bases:
        print("No sessions found with matching files in all three folders.")
        return

    print(f"Found {len(bases)} session(s) with files in all three folders.")
    for base in bases:
        compare_session(base)

    print(f"\n{'='*60}")
    print("Done.")


if __name__ == "__main__":
    main()
