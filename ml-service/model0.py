"""Model 0: sliding-window boundary detection.

Direct port of the inference loop in model0/EndToEndProcessWhole_file.ipynb
(cells 2-3), with the in-notebook `model.generate(...)` call replaced by an
HTTP call to a local Ollama (or llama.cpp server) endpoint serving the
merged+quantized model0 GGUF. All prompt text, regexes, and truncation
constants are copied verbatim from the notebook -- do not "clean up" the
formatting, it must match what the LoRA was trained/evaluated against.
"""
import os
import re
from dataclasses import dataclass
from typing import Awaitable, Callable, List, Optional

import httpx

SYSTEM_PROMPT = """Your task is to analyze terminal XML logs and determine whether the timestamp in the TARGET LINE belongs to a "new event" or an "old event".

### DEFINITION OF A NEW EVENT:
1. **Explicit Prompts:** The very first `<user_input>` that immediately follows a shell prompt (e.g., `demo@faiserver:~$`).
2. **Phase Transitions:** In automated logs, moving from one major build stage to another (e.g., from 'fai-mirror finished' to 'Copying the nfsroot').
3. **Internal Logic:** Shifts from downloading to processing.

### WHAT IS *NOT* A NEW EVENT (OLD EVENT):
- **User Input / Keystrokes:** A user typing a command, including pressing the Enter key (a newline `\\n`), is just the completion of the input phase.
- **Incomplete Tasks:** Continuous system output without a clear phase shift.

CRITICAL INSTRUCTION: You must classify ONLY the timestamp found in the "### TARGET LINE" section. Do NOT extract timestamps from the "### CONTEXT" section. Output only the timestamp and the classification. Do NOT use brackets, periods, explanations, or markdown formatting."""

CHUNK_RE = re.compile(r"<(user_input|system_output)\b[^>]*?(?:/>|>.*?</\1>)", flags=re.DOTALL)
TIME_RE = re.compile(r'timestamp="([\d\.]+)"')

WINDOW_SIZE = 15
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL0_NAME = os.getenv("MODEL0_NAME", "model0")
# Ollama's default n_threads is 1 unless told otherwise -- verified via
# `journalctl -u ollama` showing "n_threads = 1 ... / 32" on this VM's 32
# vCPUs, which made a single classify_chunk() call take minutes instead of
# seconds. Must be passed per-request; there is no global env var for it.
NUM_THREAD = int(os.getenv("OLLAMA_NUM_THREAD", str(os.cpu_count() or 1)))


@dataclass
class Chunk:
    ts: str
    text: str


def get_timestamp(chunk_text: str) -> str:
    match = TIME_RE.search(chunk_text)
    return match.group(1) if match else ""


def truncate_single_chunk(raw_text: str, tag_type: str, max_lines: int = 15) -> str:
    if tag_type != "system_output" or raw_text.endswith("/>"):
        return raw_text
    first_close = raw_text.find(">")
    last_open = raw_text.rfind("</")
    if first_close == -1 or last_open == -1:
        return raw_text

    opening_tag = raw_text[: first_close + 1]
    closing_tag = raw_text[last_open:]
    inner_text = raw_text[first_close + 1 : last_open]

    lines = inner_text.split("\n")
    if len(lines) > max_lines:
        head = "\n".join(lines[:5])
        tail = "\n".join(lines[-5:])
        removed = len(lines) - 10
        return f"{opening_tag}{head}\n\n... [TRUNCATED {removed} LINES] ...\n\n{tail}{closing_tag}"
    return raw_text


def compress_context_window(chunks: List[Chunk], max_total_lines: int = 25) -> str:
    total_lines = sum(len(c.text.split("\n")) for c in chunks)
    if total_lines <= max_total_lines:
        return "\n".join(c.text for c in chunks)

    result = []
    for idx, c in enumerate(chunks):
        raw_text = c.text
        if idx < 5 or idx >= len(chunks) - 5:
            result.append(raw_text)
        elif "<system_output" in raw_text and not raw_text.endswith("/>"):
            first_close = raw_text.find(">")
            last_open = raw_text.rfind("</")
            if first_close != -1 and last_open != -1:
                opening_tag = raw_text[: first_close + 1]
                closing_tag = raw_text[last_open:]
                result.append(f"{opening_tag}... [TRUNCATED TO SAVE SPACE] ...{closing_tag}")
            else:
                result.append(raw_text)
        else:
            result.append(raw_text)
    return "\n".join(result)


def extract_chunks(xml_content: str) -> List[Chunk]:
    """Regex-scan the flat XML into (timestamp, chunk-text) pairs, applying
    the same pre-truncation the notebook applies before windowing."""
    chunks: List[Chunk] = []
    for match in CHUNK_RE.finditer(xml_content):
        tag_type = match.group(1)
        raw_text = match.group(0)

        if len(raw_text) > 4000:
            raw_text = raw_text[:2000] + "\n...[MASSIVE LINE TRUNCATED]...\n" + raw_text[-2000:]

        processed_text = truncate_single_chunk(raw_text, tag_type, max_lines=15)
        ts_str = get_timestamp(processed_text)
        if ts_str:
            chunks.append(Chunk(ts=ts_str, text=processed_text))
    return chunks


def build_prompt(all_chunks: List[Chunk], i: int) -> str:
    """Build the exact training/eval prompt string for chunk index i."""
    start_idx = max(0, i - WINDOW_SIZE + 1)
    window_chunks = all_chunks[start_idx : i + 1]

    context_chunks = window_chunks[:-1]
    target_chunk = window_chunks[-1]

    if context_chunks:
        context_text = compress_context_window(context_chunks, max_total_lines=25)
    else:
        context_text = "No previous context available."

    target_text = target_chunk.text

    if len(context_text) > 8000:
        context_text = "... [EARLIER CONTEXT TRUNCATED] ...\n" + context_text[-8000:]
    if len(target_text) > 2000:
        target_text = target_text[:1000] + "\n... [TARGET MIDDLE TRUNCATED] ...\n" + target_text[-1000:]

    input_data = (
        f"### CONTEXT (Previous Events):\n{context_text}\n\n"
        f"### TARGET LINE (Extract and Classify THIS Timestamp):\n{target_text}"
    )
    combined_user_text = f"{SYSTEM_PROMPT}\n\n{input_data}"

    return f"<|im_start|>user<|im_sep|>{combined_user_text}<|im_end|><|im_start|>assistant<|im_sep|>"


def is_new_event(model_result: str) -> bool:
    return "new" in model_result.lower()


async def classify_chunk(client: httpx.AsyncClient, prompt: str) -> str:
    """Call the local model0 endpoint with the raw (untemplated) prompt.

    Uses Ollama's /api/generate with raw=True so the literal
    <|im_start|>/<|im_sep|>/<|im_end|> tokens from training are sent as-is,
    bypassing Ollama's own chat templating.
    """
    resp = await client.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": MODEL0_NAME,
            "prompt": prompt,
            "raw": True,
            "stream": False,
            "options": {
                # Greedy decoding to match the notebook's model.generate(...)
                # call, which never passes do_sample=True -- HF defaults to
                # greedy argmax there. Ollama's own defaults (temp=0.1,
                # top_k=40, top_p=0.9) sample instead, which was verified
                # (via journalctl) to be the live config and is a plausible
                # cause of exact-string-copy failures on target timestamps.
                "temperature": 0,
                "repeat_penalty": 1.0,
                "top_k": 1,
                "top_p": 1.0,
                "num_predict": 32,
                "num_thread": NUM_THREAD,
            },
        },
        timeout=300.0,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip().lower()


ProgressCallback = Callable[[int, int, int], Awaitable[None]]


async def find_new_event_timestamps(
    xml_content: str,
    client: httpx.AsyncClient,
    progress_callback: Optional[ProgressCallback] = None,
) -> List[str]:
    all_chunks = extract_chunks(xml_content)
    collected_new_events: List[str] = []

    for i in range(len(all_chunks)):
        prompt = build_prompt(all_chunks, i)
        model_result = await classify_chunk(client, prompt)
        if is_new_event(model_result):
            collected_new_events.append(all_chunks[i].ts)
        if progress_callback:
            await progress_callback(i + 1, len(all_chunks), len(collected_new_events))

    return collected_new_events
