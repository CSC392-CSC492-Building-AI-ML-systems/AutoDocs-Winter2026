import argparse
import concurrent.futures
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import dotenv
from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_PATH = (SCRIPT_DIR / "../../.env").resolve()
dotenv.load_dotenv(ENV_PATH)

DEFAULT_ENDPOINT = os.getenv("AZURE_PHI_ENDPOINT", "").strip()
DEFAULT_MODEL = os.getenv("AZURE_PHI_MODEL", "phi-4-reasoning-plus").strip()
DEFAULT_API_VERSION = os.getenv("AZURE_PHI_API_VERSION", "2024-05-01-preview").strip()
DEFAULT_CONCURRENCY = 4

THINK_RE = re.compile(r"<think>\s*(.*?)\s*</think>", flags=re.DOTALL | re.IGNORECASE)


def normalize_base_url(endpoint: str) -> str:
    endpoint = endpoint.strip().rstrip("/")
    if endpoint.endswith("/openai/v1"):
        return endpoint + "/"
    return endpoint + "/openai/v1/"


def make_client(endpoint: str, api_version: str) -> OpenAI:
    api_key = os.getenv("AZURE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            f"Missing AZURE_API_KEY. Add it to {ENV_PATH} or set it in your environment before running."
        )
    return OpenAI(
        base_url=normalize_base_url(endpoint),
        api_key=api_key,
        timeout=None,
    )


def load_dataset(dataset_path: Path) -> list[dict[str, Any]]:
    if not dataset_path.exists():
        raise RuntimeError(f"Dataset not found: {dataset_path}")

    samples: list[dict[str, Any]] = []
    with dataset_path.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            sample_id = f"sample_{index:05d}"
            record["_sample_id"] = sample_id
            record["_dataset_index"] = index
            samples.append(record)
    return samples


def load_jsonl_by_sample_id(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    rows: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            sample_id = record.get("sample_id")
            if sample_id:
                rows[sample_id] = record
    return rows


def load_accepted_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    accepted_ids: set[str] = set()
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            sample_id = record.get("sample_id")
            if sample_id:
                accepted_ids.add(sample_id)
    return accepted_ids


def append_accepted_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def parse_model_response(raw_content: str, reasoning_content: Any, target_output: str) -> tuple[str, str, bool]:
    raw_content = (raw_content or "").strip()
    extracted_thinking = ""
    normalized_output = raw_content

    match = THINK_RE.search(raw_content)
    if match:
        extracted_thinking = match.group(1).strip()
        normalized_output = THINK_RE.sub("", raw_content).strip()
    elif reasoning_content:
        if isinstance(reasoning_content, list):
            extracted_thinking = "\n".join(str(item).strip() for item in reasoning_content if str(item).strip())
        else:
            extracted_thinking = str(reasoning_content).strip()

    exact_match = normalized_output == target_output.strip()
    return extracted_thinking, normalized_output, exact_match


def build_model0_prompt(instruction: str, input_text: str) -> str:
    cleaned_input = input_text.strip()
    if len(cleaned_input) > 3000:
        cleaned_input = cleaned_input[:1500] + "\n[TRUNCATED]\n" + cleaned_input[-1500:]
    return f"### Instruction:\n{instruction}\n\n### Input:\n{cleaned_input}\n\n### Response: "


def generate_reasoning_for_sample(
    client: OpenAI,
    *,
    model: str,
    sample_id: str,
    instruction: str,
    input_text: str,
    target_output: str,
    max_completion_tokens: int,
) -> dict[str, Any]:
    prompt = build_model0_prompt(instruction.strip(), input_text)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=max_completion_tokens,
    )
    message = response.choices[0].message
    raw_content = message.content or ""
    reasoning_content = getattr(message, "reasoning_content", None)
    extracted_thinking, normalized_output, exact_match = parse_model_response(
        raw_content,
        reasoning_content,
        target_output,
    )
    return {
        "sample_id": sample_id,
        "prompt": prompt,
        "raw_content": raw_content,
        "raw_reasoning_content": reasoning_content,
        "thinking": extracted_thinking,
        "normalized_output": normalized_output,
        "exact_match": exact_match,
        "usage": getattr(response, "usage", None),
    }


def generate_reasoning_with_timeout(
    client: OpenAI,
    *,
    model: str,
    sample_id: str,
    instruction: str,
    input_text: str,
    target_output: str,
    max_completion_tokens: int,
    timeout_seconds: float | None,
) -> dict[str, Any]:
    if timeout_seconds is None or timeout_seconds <= 0:
        return generate_reasoning_for_sample(
            client,
            model=model,
            sample_id=sample_id,
            instruction=instruction,
            input_text=input_text,
            target_output=target_output,
            max_completion_tokens=max_completion_tokens,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            generate_reasoning_for_sample,
            client,
            model=model,
            sample_id=sample_id,
            instruction=instruction,
            input_text=input_text,
            target_output=target_output,
            max_completion_tokens=max_completion_tokens,
        )
        try:
            return future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError as exc:
            future.cancel()
            raise TimeoutError(
                f"Timed out after {timeout_seconds:.1f}s while waiting for Phi response."
            ) from exc


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool, list, dict)):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return str(value)


def build_manifest_record(
    sample: dict[str, Any],
    result: dict[str, Any] | None,
    error_message: str | None,
    thinking_dir: Path,
    outputs_dir: Path,
) -> dict[str, Any]:
    sample_id = sample["_sample_id"]
    instruction = sample.get("instruction", "")
    input_text = sample.get("input", "")
    target_output = sample.get("output", "").strip()

    thinking_text = result["thinking"] if result else ""
    normalized_output = result["normalized_output"] if result else ""
    exact_match = bool(result and result.get("exact_match"))
    discarded = not exact_match
    discard_reason = None if exact_match else "Generated output did not exactly match target output."
    thinking_file_text = thinking_text if exact_match else (f"#discarded\n{thinking_text}" if thinking_text else "#discarded")

    write_text(thinking_dir / f"{sample_id}.txt", thinking_file_text)
    write_text(outputs_dir / f"{sample_id}.txt", normalized_output)

    return {
        "sample_id": sample_id,
        "dataset_index": sample["_dataset_index"],
        "instruction": instruction,
        "input": input_text,
        "prompt_input": result["prompt"] if result else build_model0_prompt(instruction, input_text),
        "target_output": target_output,
        "thinking_file": str((thinking_dir / f"{sample_id}.txt").resolve()),
        "output_file": str((outputs_dir / f"{sample_id}.txt").resolve()),
        "thinking": thinking_text,
        "generated_output": normalized_output,
        "exact_match": exact_match,
        "discarded": discarded,
        "discard_reason": discard_reason,
        "raw_content": result["raw_content"] if result else "",
        "raw_reasoning_content": to_jsonable(result["raw_reasoning_content"]) if result else None,
        "usage": to_jsonable(result["usage"]) if result else None,
        "error": error_message,
    }


def build_placeholder_manifest_record(sample: dict[str, Any], thinking_dir: Path, outputs_dir: Path) -> dict[str, Any]:
    sample_id = sample["_sample_id"]
    return {
        "sample_id": sample_id,
        "dataset_index": sample["_dataset_index"],
        "instruction": sample.get("instruction", ""),
        "input": sample.get("input", ""),
        "prompt_input": build_model0_prompt(sample.get("instruction", ""), sample.get("input", "")),
        "target_output": sample.get("output", "").strip(),
        "thinking_file": str((thinking_dir / f"{sample_id}.txt").resolve()),
        "output_file": str((outputs_dir / f"{sample_id}.txt").resolve()),
        "thinking": "",
        "generated_output": "",
        "exact_match": False,
        "discarded": True,
        "discard_reason": "No generation record found for sample.",
        "raw_content": "",
        "raw_reasoning_content": None,
        "usage": None,
        "error": "No generation record found for sample.",
    }


def select_pending_samples(samples: list[dict[str, Any]], accepted_ids: set[str], limit: int | None) -> list[dict[str, Any]]:
    pending = [sample for sample in samples if sample["_sample_id"] not in accepted_ids]
    if limit is not None:
        pending = pending[:limit]

    unique_ids = {sample["_sample_id"] for sample in pending}
    if len(unique_ids) != len(pending):
        raise RuntimeError("Pending sample selection contains duplicate sample_ids.")

    return pending


def apply_skip_lines(samples: list[dict[str, Any]], skip_lines: int) -> list[dict[str, Any]]:
    if skip_lines <= 0:
        return samples
    return samples[skip_lines:]


def process_dataset(
    *,
    dataset_path: Path,
    output_dir: Path,
    accepted_path: Path,
    specific_line: int | None,
    skip_lines: int,
    limit: int | None,
    retries: int,
    model: str,
    endpoint: str,
    api_version: str,
    sleep_seconds: float,
    timeout_seconds: float | None,
    max_completion_tokens: int,
    rerun_non_accepted_only: bool,
    concurrency: int,
) -> None:
    client = make_client(endpoint, api_version)
    samples = load_dataset(dataset_path)
    if specific_line is not None:
        if specific_line < 0 or specific_line >= len(samples):
            raise RuntimeError(
                f"--specific-line {specific_line} is out of range for dataset of size {len(samples)}."
            )
        visible_samples = [samples[specific_line]]
    else:
        visible_samples = apply_skip_lines(samples, skip_lines)

    thinking_dir = output_dir / "thinking"
    outputs_dir = output_dir / "outputs"
    manifest_path = output_dir / "manifest.jsonl"
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_manifest = load_jsonl_by_sample_id(manifest_path)
    accepted_ids = load_accepted_ids(accepted_path) if rerun_non_accepted_only else set()
    existing_accepted_ids = load_accepted_ids(accepted_path)

    total_samples = len(samples)
    visible_sample_count = len(visible_samples)
    raw_pending_count = visible_sample_count - len([s for s in visible_samples if s["_sample_id"] in accepted_ids])
    selected_pending = select_pending_samples(visible_samples, accepted_ids, limit) if rerun_non_accepted_only else (
        visible_samples[:limit] if limit is not None else visible_samples
    )

    selected_ids = [sample["_sample_id"] for sample in selected_pending]
    unique_selected_ids = set(selected_ids)
    if len(selected_ids) != len(unique_selected_ids):
        raise RuntimeError("Selected batch contains duplicate sample_ids.")

    print(f"Loaded {total_samples} total samples.")
    if specific_line is not None:
        print(f"Selected specific dataset row {specific_line} as {visible_samples[0]['_sample_id']}.")
    if skip_lines > 0:
        print(f"Skipped the first {skip_lines} dataset rows. Remaining visible samples: {visible_sample_count}")
    if rerun_non_accepted_only:
        print(f"Accepted cache contains {len(accepted_ids)} sample ids.")
        print(f"Pending after accepted filtering: {raw_pending_count}")
    else:
        print("Forced full regeneration. Accepted cache ignored.")
    print(f"Selected {len(selected_pending)} pending samples for this run.")
    print(f"Submitting {len(unique_selected_ids)} unique sample ids with concurrency={concurrency}.")

    success_count = 0
    discarded_count = 0
    appended_accepted_count = 0

    if not selected_pending:
        print("No pending samples selected. Nothing to do.")
    else:
        future_to_sample: dict[concurrent.futures.Future, dict[str, Any]] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            for sample in selected_pending:
                sample_id = sample["_sample_id"]
                future = executor.submit(
                    run_sample_with_retries,
                    client=client,
                    sample=sample,
                    retries=retries,
                    model=model,
                    sleep_seconds=sleep_seconds,
                    timeout_seconds=timeout_seconds,
                    max_completion_tokens=max_completion_tokens,
                )
                future_to_sample[future] = sample

            if len(future_to_sample) != len(unique_selected_ids):
                raise RuntimeError("Mismatch between submitted futures and unique sample IDs.")

            for future in concurrent.futures.as_completed(future_to_sample):
                sample = future_to_sample[future]
                sample_id = sample["_sample_id"]
                try:
                    result, error_message = future.result()
                except Exception as exc:
                    result = None
                    error_message = str(exc)

                manifest_record = build_manifest_record(
                    sample,
                    result,
                    error_message,
                    thinking_dir,
                    outputs_dir,
                )
                existing_manifest[sample_id] = manifest_record

                if manifest_record["exact_match"] and not manifest_record["discarded"]:
                    success_count += 1
                    if sample_id not in existing_accepted_ids:
                        append_accepted_jsonl(accepted_path, [{"sample_id": sample_id}])
                        existing_accepted_ids.add(sample_id)
                        appended_accepted_count += 1
                else:
                    discarded_count += 1

    with manifest_path.open("w", encoding="utf-8") as manifest_handle:
        for sample in samples:
            sample_id = sample["_sample_id"]
            manifest_record = existing_manifest.get(sample_id)
            if manifest_record is None:
                manifest_record = build_placeholder_manifest_record(sample, thinking_dir, outputs_dir)
            manifest_handle.write(json.dumps(manifest_record, ensure_ascii=False) + "\n")

    print(f"Saved generation manifest: {manifest_path}")
    print(
        f"Run summary: processed={len(selected_pending)} exact_match={success_count} "
        f"discarded={discarded_count} accepted_appended={appended_accepted_count}"
    )


def run_sample_with_retries(
    *,
    client: OpenAI,
    sample: dict[str, Any],
    retries: int,
    model: str,
    sleep_seconds: float,
    timeout_seconds: float | None,
    max_completion_tokens: int,
) -> tuple[dict[str, Any] | None, str | None]:
    sample_id = sample["_sample_id"]
    instruction = sample.get("instruction", "")
    input_text = sample.get("input", "")
    target_output = sample.get("output", "").strip()

    result: dict[str, Any] | None = None
    error_message = None

    for attempt in range(1, retries + 2):
        attempt_start = time.perf_counter()
        print(
            f"[{sample_id}] Attempt {attempt}/{retries + 1} started"
            + (
                f" (timeout: {timeout_seconds:.1f}s)"
                if timeout_seconds is not None and timeout_seconds > 0
                else ""
            )
        )
        try:
            result = generate_reasoning_with_timeout(
                client,
                model=model,
                sample_id=sample_id,
                instruction=instruction,
                input_text=input_text,
                target_output=target_output,
                max_completion_tokens=max_completion_tokens,
                timeout_seconds=timeout_seconds,
            )
            error_message = None
            elapsed = time.perf_counter() - attempt_start
            print(f"[{sample_id}] Completed in {elapsed:.1f}s")
            break
        except Exception as exc:
            error_message = str(exc)
            elapsed = time.perf_counter() - attempt_start
            print(f"[{sample_id}] Attempt {attempt} failed after {elapsed:.1f}s: {error_message}")
            if attempt > retries:
                break
            time.sleep(sleep_seconds)

    return result, error_message


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Phi reasoning traces for the streaming model-0 dataset."
    )
    parser.add_argument(
        "--dataset-path",
        default=str((SCRIPT_DIR / "../model_0_streaming/streaming_dataset.jsonl").resolve()),
        help="Path to the streaming JSONL dataset.",
    )
    parser.add_argument(
        "--output-dir",
        default=str((SCRIPT_DIR / "generated").resolve()),
        help="Directory for generated thinking, outputs, and manifest.jsonl.",
    )
    parser.add_argument(
        "--accepted-path",
        default=str((SCRIPT_DIR / "generated/accepted.jsonl").resolve()),
        help="Generator acceptance cache JSONL. Exact-match samples are written here and skipped on later runs.",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Azure Phi model deployment name.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="Azure endpoint URL.")
    parser.add_argument("--api-version", default=DEFAULT_API_VERSION, help="Azure API version.")
    parser.add_argument(
        "--skip-lines",
        type=int,
        default=0,
        help="Skip the first N dataset rows before accepted filtering, while preserving original sample IDs.",
    )
    parser.add_argument(
        "--specific-line",
        type=int,
        default=None,
        help="Run exactly one original dataset row by 0-based line index, preserving its sample ID.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Number of non-accepted samples to process this run.",
    )
    parser.add_argument("--retries", type=int, default=1, help="Retries per sample after the first attempt.")
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=1.0,
        help="Sleep duration between retries.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=0.0,
        help="Per-attempt timeout while waiting for a Phi response. Default disables local timeout.",
    )
    parser.add_argument(
        "--max-completion-tokens",
        type=int,
        default=512,
        help="Maximum completion tokens for the Phi response, including <think> and final answer.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help="Number of concurrent worker threads used for non-overlapping sample processing.",
    )
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="Ignore accepted.jsonl and regenerate every sample.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    process_dataset(
        dataset_path=Path(args.dataset_path).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        accepted_path=Path(args.accepted_path).resolve(),
        specific_line=args.specific_line,
        skip_lines=max(args.skip_lines, 0),
        limit=args.limit,
        retries=max(args.retries, 0),
        model=args.model,
        endpoint=args.endpoint,
        api_version=args.api_version,
        sleep_seconds=max(args.sleep_seconds, 0.0),
        timeout_seconds=args.timeout_seconds if args.timeout_seconds > 0 else None,
        max_completion_tokens=max(args.max_completion_tokens, 1),
        rerun_non_accepted_only=not args.force_all,
        concurrency=max(args.concurrency, 1),
    )
