"""Model 1: per-event annotation (summary + depth).

Direct port of the `annotator.py` written by
model0/EndToEndProcessWhole_file.ipynb (cell 7), the notebook's own
authoritative, self-contained Model 1 implementation. The in-process
`vllm.LLM` call is replaced by an HTTP call to a local Ollama endpoint
serving stock `gpt-oss:20b` (no fine-tuning, matches the notebook's
default MODEL_ID). Prompt text and few-shot block are copied verbatim.
"""
import json
import os
import re
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, List, Optional, Tuple

from lxml import etree
import httpx

SUMMARY_WORD_LIMIT = int(os.getenv("SUMMARY_WORD_LIMIT", "50"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL1_NAME = os.getenv("MODEL1_NAME", "gpt-oss:20b")
MODEL1_REASONING_EFFORT = os.getenv("MODEL1_REASONING_EFFORT", "low")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "2000"))
# See model0.py's NUM_THREAD comment -- Ollama defaults to n_threads=1
# unless told otherwise per-request.
NUM_THREAD = int(os.getenv("OLLAMA_NUM_THREAD", str(os.cpu_count() or 1)))

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


@dataclass
class Event:
    idx: int
    xml: str
    depth_xml: Optional[int] = None
    summary_xml: Optional[str] = None


def load_events(xml_path: str) -> List[Event]:
    tree = etree.parse(xml_path)
    root = tree.getroot()
    return [
        Event(idx=i, xml=etree.tostring(ev_el, encoding="unicode"))
        for i, ev_el in enumerate(root.xpath("//event"))
    ]


def compute_curr_depth_upto(events: List[Event], idx: int) -> int:
    curr = 0
    for i in range(idx):
        dep = events[i].depth_xml
        if dep is None:
            continue
        if dep == -1:
            curr -= 1
        elif dep > 0:
            curr += dep
    return curr


def make_flush_package(events: List[Event], upto_idx: int, K: int = 1, N: int = 10) -> Dict:
    target_idxs = list(range(max(0, upto_idx - K + 1), upto_idx + 1))
    start_neigh = max(0, target_idxs[0] - N)
    neighbor_idxs = list(range(start_neigh, target_idxs[0]))

    def get_sum(i):
        return events[i].summary_xml if (0 <= i < len(events) and events[i].summary_xml) else "???"

    def get_dep(i):
        return events[i].depth_xml if (0 <= i < len(events) and events[i].depth_xml is not None) else 999

    neighbor_info = [f"- id={i} depth={get_dep(i)}  summary={get_sum(i)}" for i in neighbor_idxs]
    target_events = [events[i].xml for i in target_idxs if 0 <= i < len(events)]

    return {
        "target_idxs": target_idxs,
        "neighbor_info": neighbor_info,
        "target_events": target_events,
        "currDepth": compute_curr_depth_upto(events, target_idxs[0]),
    }


def build_instruction(pkg: dict) -> str:
    MAX_CHARS = 3000
    truncated_targets = []

    for i, xml in zip(pkg["target_idxs"], pkg["target_events"]):
        if len(xml) > MAX_CHARS:
            snipped_xml = (
                xml[:1000]
                + f"\n\n... [ ✂️ SYSTEM OUTPUT TRUNCATED - HIDDEN {len(xml) - MAX_CHARS} CHARACTERS ] ...\n\n"
                + xml[-2000:]
            )
            truncated_targets.append(f'<target id="{i}">\n{snipped_xml}\n</target>')
        else:
            truncated_targets.append(f'<target id="{i}">\n{xml}\n</target>')

    targets_xml = "\n".join(truncated_targets)

    return f"""<task>
You are an expert terminal session annotator. Identify goals/subgoals and generate concise action summaries.
</task>

<think_first>
- Keep reasoning CONCISE and FOCUSED
- In <think>...</think>: analyze the command, check depth logic, then conclude
- Aim for 2-3 sentences of reasoning maximum
- Skip obvious observations
- Use neighbors ONLY for continuity; do not invent context.
</think_first>

<rules>
- the user's keystrokes appear separately; combine them to form the full command before interpreting it
- depth is an integer (≥ -1); -1 for subevent (new task started), 0 for same level (still doing the same task), >0 to exit levels (ended one or multiple tasks)
- maintain stack invariant: currDepth ≤ 0; if depth == -1 then currDepth -= 1; if depth > 0 then currDepth += depth
- write action-oriented summaries; avoid "user", "they", "typed", "inputs", "enters a command
- depth is relative to the previous events and nothing else"
</rules>

<output_format>
You MUST wrap your reasoning in <think>...</think> tags.
After the closing </think> tag, you MUST output EXACTLY ONE valid JSON object on a new line. Do not output anything after the JSON.
{{"annotation": "<action summary ≤{SUMMARY_WORD_LIMIT} words>", "depth": <integer ≥ -1>}}
</output_format>

DEPTH SEMANTICS:
- depth = -1: STARTING a new subtask (entering deeper level)
- depth = 0:  CONTINUING at same level (ongoing work)
- depth = +1: FINISHING a subtask (returning to parent level)

<examples>
{FEWSHOTS_BLOCK}
</examples>

<inputs>
  <curr_depth>{pkg.get("currDepth", 0)}</curr_depth>
  <target_events>\n{targets_xml}\n  </target_events>
</inputs>"""


def parse_depth_summary_pairs(text: str) -> List[Tuple[int, str]]:
    dec = json.JSONDecoder()
    out: List[Tuple[int, str]] = []

    if "</think>" in text:
        text = text.split("</think>")[-1].strip()

    i = 0
    while True:
        start = text.find("{", i)
        if start == -1:
            break
        try:
            obj, end = dec.raw_decode(text, start)
            if isinstance(obj, dict) and "depth" in obj and "annotation" in obj:
                out.append((int(obj["depth"]), str(obj["annotation"])))
            i = end
        except (json.JSONDecodeError, ValueError, TypeError):
            i = start + 1
    return out


async def generate(client: httpx.AsyncClient, instruction: str) -> str:
    resp = await client.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": MODEL1_NAME,
            "messages": [{"role": "user", "content": instruction}],
            "stream": False,
            "think": MODEL1_REASONING_EFFORT,
            "options": {
                "temperature": 0.0,
                "num_predict": MAX_NEW_TOKENS,
                "repeat_penalty": 1.2,
                "num_thread": NUM_THREAD,
            },
        },
        timeout=600.0,
    )
    resp.raise_for_status()
    data = resp.json()
    message = data.get("message", {})
    thinking = message.get("thinking", "")
    content = message.get("content", "")
    # Reassemble in the shape parse_depth_summary_pairs() expects: reasoning
    # followed by a closing </think> tag, then the JSON.
    return f"{thinking}</think>{content}" if thinking else content


ProgressCallback = Callable[[int, int, int], Awaitable[None]]


async def annotate_events(
    events: List[Event],
    client: httpx.AsyncClient,
    progress_callback: Optional[ProgressCallback] = None,
) -> Dict[int, Dict[str, object]]:
    pred: Dict[int, Dict[str, object]] = {}

    for upto in range(len(events)):
        success = False
        text = ""
        pkg: Dict = {}

        for attempt_N in [10, 5, 2, 0]:
            pkg = make_flush_package(events, upto, N=attempt_N)
            instr = build_instruction(pkg)
            try:
                text = await generate(client, instr)
                success = True
                break
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (400, 413) or "context" in e.response.text.lower():
                    continue
                raise

        if not success:
            text = '{"annotation": "Event payload too large for context window.", "depth": 0}'

        pairs = parse_depth_summary_pairs(text)
        if pairs:
            depth, ann = pairs[0]
            target_idx = pkg["target_idxs"][0]
            pred[target_idx] = {"depth": depth, "summary": ann}
            events[target_idx].depth_xml = depth
            events[target_idx].summary_xml = ann

        if progress_callback:
            await progress_callback(upto + 1, len(events), len(pred))

    return pred
