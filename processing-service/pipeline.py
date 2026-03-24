from __future__ import annotations

import io
import json
import math
import os
import re
import xml.dom.minidom
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Optional


CHUNK_RE = re.compile(
    r"<(user_input|system_output)\b[^>]*?(?:/>|>.*?</\1>)",
    flags=re.DOTALL,
)
TIME_RE = re.compile(r'timestamp="([\d\.]+)"')

MODEL0_SYSTEM_PROMPT = """Your task is to analyze terminal XML logs and determine whether the timestamp in the TARGET LINE belongs to a "new event" or an "old event".

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

MODEL1_FEWSHOTS_BLOCK = """
EXAMPLES (for reference only)

EXAMPLE A - Starting a backup subtask (depth=-1)
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

EXAMPLE B - Continuing backup subtask (depth=0)
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

EXAMPLE C - Finishing backup subtask (depth=+1)
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

EXAMPLE D - Starting test/debug subtask (depth=-1)
currDepth: 0
input xml:
<event>
  <user_input>p</user_input><user_input>y</user_input><user_input>t</user_input><user_input>e</user_input><user_input>s</user_input><user_input>t</user_input>
  <system_output>===== test session starts =====</system_output>
</event>
output:
{"annotation": "Start pytest test run for project", "depth": -1}

EXAMPLE E - Nested editor within environment setup (depth=-1)
currDepth: -1
input xml:
<event>
  <user_input>v</user_input><user_input>i</user_input><user_input>m</user_input>
  <system_output>Opening vim...</system_output>
</event>
output:
{"annotation": "Open config file in vim during environment setup", "depth": -1}

EXAMPLE F - Exit editor, stay in parent task (depth=+1)
currDepth: -2
input xml:
<event>
  <user_input>:</user_input><user_input>w</user_input><user_input>q</user_input>
  <system_output>(venv) $</system_output>
</event>
output:
{"annotation": "Save config changes and exit vim", "depth": 1}
""".strip()


def remove_invalid_xml_chars(value: str) -> str:
    return re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", value)


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
        return (
            f"{opening_tag}{head}\n\n... [TRUNCATED {removed} LINES] ...\n\n"
            f"{tail}{closing_tag}"
        )

    return raw_text


def compress_context_window(chunks: list[dict[str, str]], max_total_lines: int = 25) -> str:
    total_lines = sum(len(chunk["text"].split("\n")) for chunk in chunks)
    if total_lines <= max_total_lines:
        return "\n".join(chunk["text"] for chunk in chunks)

    result: list[str] = []
    for index, chunk in enumerate(chunks):
        raw_text = chunk["text"]
        if index < 5 or index >= len(chunks) - 5:
            result.append(raw_text)
            continue

        if "<system_output" in raw_text and not raw_text.endswith("/>"):
            first_close = raw_text.find(">")
            last_open = raw_text.rfind("</")
            if first_close != -1 and last_open != -1:
                opening_tag = raw_text[: first_close + 1]
                closing_tag = raw_text[last_open:]
                result.append(
                    f"{opening_tag}... [TRUNCATED TO SAVE SPACE] ...{closing_tag}"
                )
                continue

        result.append(raw_text)

    return "\n".join(result)


def parse_recording_text_to_xml(recording_text: str) -> str:
    root: Optional[ET.Element] = None
    header_parsed = False

    for line in io.StringIO(recording_text):
        line = line.strip()
        if not line:
            continue

        if not header_parsed:
            header = json.loads(line)
            root = ET.Element("recording")
            for key in ["version", "width", "height", "timestamp"]:
                if key in header:
                    root.set(key, str(header[key]))
            header_parsed = True
            continue

        event = json.loads(line)
        if not isinstance(event, list) or len(event) < 3:
            continue

        timestamp, event_type, content = event[0], event[1], event[2]
        if event_type == "i":
            element = ET.SubElement(root, "user_input")
        elif event_type == "o":
            element = ET.SubElement(root, "system_output")
        else:
            continue

        element.set("timestamp", str(timestamp))
        cleaned_content = remove_invalid_xml_chars(content)
        if cleaned_content:
            element.text = cleaned_content

    if root is None:
        raise ValueError("The uploaded recording is empty or not valid asciinema JSON.")

    rough_string = ET.tostring(root, "utf-8")
    reparsed = xml.dom.minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")


def ensure_raw_xml(filename: str, payload: bytes) -> str:
    suffix = os.path.splitext(filename)[1].lower()
    text = payload.decode("utf-8", errors="replace")

    if suffix == ".xml":
        return text

    if suffix in {".cast", ".rec", ".asciinema"}:
        return parse_recording_text_to_xml(text)

    raise ValueError(
        f"Unsupported upload format '{suffix or '<none>'}'. Use .cast, .rec, .asciinema, or .xml."
    )


def estimate_duration_seconds(xml_content: str) -> int:
    timestamps = [float(match.group(1)) for match in TIME_RE.finditer(xml_content)]
    if not timestamps:
        return 0
    return max(0, math.ceil(max(timestamps)))


@dataclass
class PipelineResult:
    filename: str
    title: str
    duration_seconds: int
    raw_xml: str
    parsed_xml: str
    boundary_timestamps: list[str]
    annotations: list[dict[str, object]]

    @property
    def session_content(self) -> str:
        lines: list[str] = []
        for item in self.annotations:
            lines.append(str(item["summary"]))
            lines.append(str(item["depth"]))
        return "\n".join(lines)


class Model0Runner:
    def __init__(self) -> None:
        self._model = None
        self._tokenizer = None
        self._torch = None
        self._device = "cpu"
        self.max_seq_length = int(os.getenv("MODEL0_MAX_SEQ_LENGTH", "4096"))
        self.max_input_tokens = int(os.getenv("MODEL0_MAX_INPUT_TOKENS", "4000"))
        self.model_name = os.getenv(
            "MODEL0_REPO_ID",
            "Jaiccc/model_0_streaming_timestamp",
        )

    def load(self) -> None:
        if self._model is not None and self._tokenizer is not None:
            return

        import torch
        from unsloth import FastLanguageModel

        os.environ.setdefault("UNSLOTH_USE_MODELSCOPE", "1")
        hf_token = os.getenv("HF_TOKEN")

        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=self.model_name,
            max_seq_length=self.max_seq_length,
            load_in_4bit=os.getenv("MODEL0_LOAD_IN_4BIT", "true").lower() != "false",
            token=hf_token,
        )
        FastLanguageModel.for_inference(model)

        self._model = model
        self._tokenizer = tokenizer
        self._torch = torch
        self._device = "cuda" if torch.cuda.is_available() else "cpu"

    def classify_boundary(self, context_text: str, target_text: str) -> str:
        self.load()
        combined_user_text = (
            f"{MODEL0_SYSTEM_PROMPT}\n\n### CONTEXT:\n{context_text}\n\n"
            f"### TARGET LINE:\n{target_text}"
        )
        prompt = (
            f"<|im_start|>user<|im_sep|>{combined_user_text}"
            f"<|im_end|><|im_start|>assistant<|im_sep|>"
        )

        inputs = self._tokenizer(prompt, return_tensors="pt").to(self._device)
        if inputs.input_ids.shape[1] > self.max_input_tokens:
            inputs.input_ids = inputs.input_ids[:, -self.max_input_tokens :]
            inputs.attention_mask = inputs.attention_mask[:, -self.max_input_tokens :]

        outputs = self._model.generate(
            input_ids=inputs.input_ids,
            attention_mask=inputs.attention_mask,
            max_new_tokens=32,
            temperature=0.1,
            pad_token_id=self._tokenizer.eos_token_id,
        )
        raw_output = self._tokenizer.batch_decode(
            outputs,
            clean_up_tokenization_spaces=True,
        )[0]

        match = re.search(
            r"<\|im_start\|>assistant<\|im_sep\|>(.*?)<\|im_end\|>",
            raw_output,
            re.S,
        )
        return match.group(1).strip().lower() if match else raw_output.strip().lower()

    def run(self, xml_content: str) -> list[str]:
        all_chunks: list[dict[str, str]] = []
        for match in CHUNK_RE.finditer(xml_content):
            tag_type = match.group(1)
            raw_text = match.group(0)

            if len(raw_text) > 4000:
                raw_text = (
                    raw_text[:2000]
                    + "\n...[MASSIVE LINE TRUNCATED]...\n"
                    + raw_text[-2000:]
                )

            processed_text = truncate_single_chunk(raw_text, tag_type, max_lines=15)
            timestamp = get_timestamp(processed_text)
            if timestamp:
                all_chunks.append({"ts": timestamp, "text": processed_text})

        if not all_chunks:
            raise ValueError("No valid timestamped XML chunks were found in the recording.")

        collected_new_events: list[str] = []
        skip_counter = 0

        for index, target_chunk in enumerate(all_chunks):
            if skip_counter > 0:
                model_result = "old event (auto-skipped)"
                skip_counter -= 1
            else:
                start_index = max(0, index - 14)
                window_chunks = all_chunks[start_index : index + 1]
                context_chunks = window_chunks[:-1]

                if context_chunks:
                    context_text = compress_context_window(context_chunks, max_total_lines=25)
                else:
                    context_text = "No previous context available."

                target_text = target_chunk["text"]
                if len(context_text) > 8000:
                    context_text = context_text[-8000:]
                if len(target_text) > 2000:
                    target_text = f"{target_text[:1000]}...{target_text[-1000:]}"

                model_result = self.classify_boundary(context_text, target_text)

            if "new" in model_result and "auto-skipped" not in model_result:
                collected_new_events.append(target_chunk["ts"])
                skip_counter = 10

        return collected_new_events


def restructure_xml_to_events(input_xml_content: str, new_event_timestamps: list[str]) -> str:
    tree = ET.parse(io.StringIO(input_xml_content))
    root = tree.getroot()

    new_root = ET.Element(root.tag, root.attrib)
    trigger_timestamps = {str(item).strip() for item in new_event_timestamps}
    current_event: Optional[ET.Element] = None

    for child in root:
        timestamp = child.get("timestamp")
        if current_event is None or timestamp in trigger_timestamps:
            current_event = ET.SubElement(new_root, "event")
        current_event.append(child)

    new_tree = ET.ElementTree(new_root)
    if hasattr(ET, "indent"):
        ET.indent(new_tree, space="  ", level=0)

    output = io.BytesIO()
    new_tree.write(output, encoding="utf-8", xml_declaration=True)
    return output.getvalue().decode("utf-8")


@dataclass
class AnnotatedEvent:
    idx: int
    xml: str
    depth_xml: Optional[int] = None
    summary_xml: Optional[str] = None


class Model1Runner:
    def __init__(self) -> None:
        self._llm = None
        self._SamplingParams = None
        self._etree = None
        self.model_id = os.getenv("MODEL1_MODEL_ID", "openai/gpt-oss-20b")
        self.gpu_util = float(os.getenv("MODEL1_GPU_UTIL", "0.70"))
        self.max_model_len = int(os.getenv("MODEL1_MAX_MODEL_LEN", "16384"))
        self.dtype = os.getenv("MODEL1_DTYPE", "bfloat16")
        self.max_new_tokens = int(os.getenv("MODEL1_MAX_NEW_TOKENS", "2000"))
        self.summary_word_limit = int(os.getenv("SUMMARY_WORD_LIMIT", "50"))
        self.tensor_parallel_size = int(os.getenv("VLLM_TP", "1"))

    def load(self) -> None:
        if self._llm is not None:
            return

        from lxml import etree
        from vllm import LLM, SamplingParams

        self._llm = LLM(
            model=self.model_id,
            tensor_parallel_size=self.tensor_parallel_size,
            gpu_memory_utilization=self.gpu_util,
            max_model_len=self.max_model_len,
            trust_remote_code=True,
            dtype=self.dtype,
        )
        self._SamplingParams = SamplingParams
        self._etree = etree

    def load_events(self, xml_content: str) -> list[AnnotatedEvent]:
        self.load()
        root = self._etree.fromstring(xml_content.encode("utf-8"))
        events: list[AnnotatedEvent] = []
        for index, event_element in enumerate(root.xpath("//event")):
            xml_str = self._etree.tostring(event_element, encoding="unicode")
            events.append(AnnotatedEvent(idx=index, xml=xml_str))
        return events

    @staticmethod
    def compute_curr_depth_upto(events: list[AnnotatedEvent], idx: int) -> int:
        curr = 0
        for event_index in range(idx):
            depth = events[event_index].depth_xml
            if depth is None:
                continue
            if depth == -1:
                curr -= 1
            elif depth > 0:
                curr += depth
        return curr

    def make_flush_package(
        self,
        events: list[AnnotatedEvent],
        upto_idx: int,
        neighbors: int = 10,
    ) -> dict[str, object]:
        target_indexes = [upto_idx]
        start_neighbor = max(0, target_indexes[0] - neighbors)
        neighbor_indexes = list(range(start_neighbor, target_indexes[0]))

        def get_summary(index: int) -> str:
            if 0 <= index < len(events) and events[index].summary_xml:
                return str(events[index].summary_xml)
            return "???"

        def get_depth(index: int) -> int:
            if 0 <= index < len(events) and events[index].depth_xml is not None:
                return int(events[index].depth_xml)
            return 999

        neighbor_info = [
            f"- id={index} depth={get_depth(index)}  summary={get_summary(index)}"
            for index in neighbor_indexes
        ]
        target_events = [events[index].xml for index in target_indexes if 0 <= index < len(events)]

        return {
            "target_idxs": target_indexes,
            "neighbor_info": neighbor_info,
            "target_events": target_events,
            "currDepth": self.compute_curr_depth_upto(events, target_indexes[0]),
        }

    def build_instruction(self, package: dict[str, object]) -> str:
        max_chars = 3000
        truncated_targets: list[str] = []

        for index, xml in zip(
            package["target_idxs"],
            package["target_events"],
            strict=True,
        ):
            xml_string = str(xml)
            if len(xml_string) > max_chars:
                snipped_xml = (
                    xml_string[:1000]
                    + (
                        "\n\n... [ SYSTEM OUTPUT TRUNCATED - HIDDEN "
                        f"{len(xml_string) - max_chars} CHARACTERS ] ...\n\n"
                    )
                    + xml_string[-2000:]
                )
                truncated_targets.append(
                    f'<target id="{index}">\n{snipped_xml}\n</target>'
                )
            else:
                truncated_targets.append(f'<target id="{index}">\n{xml_string}\n</target>')

        targets_xml = "\n".join(truncated_targets)

        return f"""<task>
You are an expert terminal session annotator. Identify goals/subgoals and generate concise action summaries.
</task>

<think_first>
- Keep reasoning concise and focused
- In <think>...</think>: analyze the command, check depth logic, then conclude
- Aim for 2-3 sentences of reasoning maximum
- Use neighbors only for continuity; do not invent context.
</think_first>

<rules>
- the user's keystrokes appear separately; combine them to form the full command before interpreting it
- depth is an integer (>= -1); -1 for subevent (new task started), 0 for same level, >0 to exit levels
- maintain stack invariant: currDepth <= 0; if depth == -1 then currDepth -= 1; if depth > 0 then currDepth += depth
- write action-oriented summaries; avoid "user", "they", "typed", "inputs", or "enters"
</rules>

<output_format>
You MUST wrap your reasoning in <think>...</think> tags.
After the closing </think> tag, you MUST output EXACTLY ONE valid JSON object on a new line. Do not output anything after the JSON.
{{"annotation": "<action summary <={self.summary_word_limit} words>", "depth": <integer >= -1>}}
</output_format>

DEPTH SEMANTICS:
- depth = -1: STARTING a new subtask
- depth = 0:  CONTINUING at same level
- depth = +1: FINISHING a subtask

<examples>
{MODEL1_FEWSHOTS_BLOCK}
</examples>

<inputs>
  <curr_depth>{package.get("currDepth", 0)}</curr_depth>
  <neighbor_tail>
{os.linesep.join(str(item) for item in package.get("neighbor_info", []))}
  </neighbor_tail>
  <target_events>
{targets_xml}
  </target_events>
</inputs>"""

    def generate_with_thinking(self, messages: list[dict[str, str]]) -> str:
        self.load()
        tokenizer = self._llm.get_tokenizer()
        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        sampling_params = self._SamplingParams(
            temperature=0.0,
            max_tokens=self.max_new_tokens,
            repetition_penalty=1.2,
        )
        outputs = self._llm.generate([prompt], sampling_params)
        return outputs[0].outputs[0].text.strip()

    @staticmethod
    def parse_depth_summary_pairs(text: str) -> list[tuple[int, str]]:
        decoder = json.JSONDecoder()
        output: list[tuple[int, str]] = []

        if "</think>" in text:
            text = text.split("</think>")[-1].strip()

        cursor = 0
        while True:
            start = text.find("{", cursor)
            if start == -1:
                break
            try:
                parsed, end = decoder.raw_decode(text, start)
                if isinstance(parsed, dict) and "depth" in parsed and "annotation" in parsed:
                    output.append((int(parsed["depth"]), str(parsed["annotation"])))
                cursor = end
            except Exception:
                cursor = start + 1
        return output

    def run(self, parsed_xml_content: str) -> list[dict[str, object]]:
        events = self.load_events(parsed_xml_content)
        if not events:
            raise ValueError("Parser 1 produced no <event> nodes for model 1.")

        for upto in range(len(events)):
            success = False
            text = ""
            package: dict[str, object] = {}

            for attempt_neighbors in [10, 5, 2, 0]:
                package = self.make_flush_package(events, upto, neighbors=attempt_neighbors)
                instruction = self.build_instruction(package)
                try:
                    text = self.generate_with_thinking(
                        [{"role": "user", "content": instruction}]
                    )
                    success = True
                    break
                except Exception as exc:
                    lowered = str(exc).lower()
                    if "context length" in lowered or "vllmvalidationerror" in lowered:
                        continue
                    raise

            if not success:
                text = '{"annotation": "Event payload too large for context window.", "depth": 0}'

            pairs = self.parse_depth_summary_pairs(text)
            target_index = int(package["target_idxs"][0])
            if pairs:
                depth, annotation = pairs[0]
                events[target_index].depth_xml = depth
                events[target_index].summary_xml = annotation
            else:
                events[target_index].depth_xml = 0
                events[target_index].summary_xml = "Could not parse model output."

        return [
            {
                "idx": event.idx,
                "depth": int(event.depth_xml if event.depth_xml is not None else 0),
                "summary": str(event.summary_xml or ""),
            }
            for event in events
        ]


class RecordingPipelineService:
    def __init__(self) -> None:
        self.model0 = Model0Runner()
        self.model1 = Model1Runner()

    def process_upload(
        self,
        filename: str,
        payload: bytes,
        title_override: Optional[str] = None,
    ) -> PipelineResult:
        raw_xml = ensure_raw_xml(filename, payload)
        title = (title_override or os.path.splitext(filename)[0]).strip() or "Terminal Session"
        duration_seconds = estimate_duration_seconds(raw_xml)

        boundary_timestamps = self.model0.run(raw_xml)
        parsed_xml = restructure_xml_to_events(raw_xml, boundary_timestamps)
        annotations = self.model1.run(parsed_xml)

        return PipelineResult(
            filename=filename,
            title=title,
            duration_seconds=duration_seconds,
            raw_xml=raw_xml,
            parsed_xml=parsed_xml,
            boundary_timestamps=boundary_timestamps,
            annotations=annotations,
        )
