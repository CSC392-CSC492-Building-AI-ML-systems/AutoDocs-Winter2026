import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

import dotenv
from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_PATH = (SCRIPT_DIR / "../../.env").resolve()
dotenv.load_dotenv(ENV_PATH)

api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
if not api_key:
    raise RuntimeError(
        f"Missing DEEPSEEK_API_KEY. Add it to {ENV_PATH} or set it in your environment before running."
    )

client = OpenAI(
    api_key=api_key,
    base_url="https://api.deepseek.com",
)

JUDGE_PROMPT = """You are an evaluator for a streaming boundary-classification model.

You are given:
1) INPUT: the source terminal/session text.
2) TARGET OUTPUT: the expected output.
3) GENERATED THINKING: model reasoning tokens.
4) GENERATED OUTPUT: the model final answer after removing thinking tokens.

Evaluate two things separately:
- Target alignment: does GENERATED OUTPUT exactly match TARGET OUTPUT?
- Thinking quality: does GENERATED THINKING logically justify TARGET OUTPUT using the INPUT?

Label target_alignment as 1 if GENERATED OUTPUT exactly matches TARGET OUTPUT, otherwise 0.

Score thinking_quality_score from 1 to 5:
- 1 = incorrect, unrelated, or unusable
- 3 = partly correct with major omissions/errors
- 5 = accurate, coherent, and well-grounded

Return STRICT JSON only:
{{
  "target_alignment": <int 1/0>,
  "thinking_quality_score": <int 1-5>
}}

INPUT:
{input_text}

TARGET OUTPUT:
{target_text}

GENERATED THINKING:
{thinking_text}

GENERATED OUTPUT:
{generated_output}
"""


def extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {"parse_error": "No JSON object found", "raw_response": text}

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"parse_error": "Invalid JSON object", "raw_response": text}


def evaluate_sample(
    *,
    input_text: str,
    target_text: str,
    thinking_text: str,
    generated_output: str,
    model: str,
) -> dict[str, Any]:
    prompt = JUDGE_PROMPT.format(
        input_text=input_text,
        target_text=target_text,
        thinking_text=thinking_text,
        generated_output=generated_output,
    )
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
    )
    content = (response.choices[0].message.content or "").strip()
    parsed = extract_json_object(content)
    parsed.setdefault("raw_response", content)
    return parsed


def load_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise RuntimeError(f"Manifest not found: {path}")
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def maybe_read_text(path_str: str | None) -> str:
    if not path_str:
        return ""
    path = Path(path_str)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def categorize_result(result: dict[str, Any], threshold: int) -> str:
    if result.get("error") or result.get("parse_error"):
        return "error"
    if result.get("target_alignment") != 1:
        return "misaligned_output"
    score = result.get("thinking_quality_score")
    if not isinstance(score, int):
        return "error"
    if score >= threshold:
        return "accepted"
    return "weak_reasoning"


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def evaluate_dataset(
    *,
    manifest_path: Path,
    result_dir: Path,
    model: str,
    min_thinking_score: int,
    limit: int | None,
    thinking_dir: Path | None,
    output_dir: Path | None,
) -> None:
    records = load_manifest(manifest_path)
    if limit is not None:
        records = records[:limit]

    result_dir.mkdir(parents=True, exist_ok=True)
    category_rows: dict[str, list[dict[str, Any]]] = {
        "accepted": [],
        "weak_reasoning": [],
        "misaligned_output": [],
        "error": [],
    }
    results: list[dict[str, Any]] = []

    for record in records:
        sample_id = record["sample_id"]
        print(f"Evaluating '{sample_id}'")
        thinking_text = record.get("thinking") or maybe_read_text(record.get("thinking_file"))
        generated_output = record.get("generated_output") or maybe_read_text(record.get("output_file"))

        if thinking_dir is not None:
            override_path = thinking_dir / f"{sample_id}.txt"
            if override_path.exists():
                thinking_text = override_path.read_text(encoding="utf-8", errors="ignore")

        if output_dir is not None:
            override_path = output_dir / f"{sample_id}.txt"
            if override_path.exists():
                generated_output = override_path.read_text(encoding="utf-8", errors="ignore")

        try:
            eval_result = evaluate_sample(
                input_text=record.get("input", ""),
                target_text=record.get("target_output", ""),
                thinking_text=thinking_text,
                generated_output=generated_output,
                model=model,
            )
        except Exception as exc:
            err = str(exc)
            if "401" in err or "Authentication" in err or "invalid api key" in err.lower():
                raise RuntimeError(
                    f"Authentication failed. Check DEEPSEEK_API_KEY in {ENV_PATH}. Details: {err}"
                ) from exc
            eval_result = {"error": err}

        eval_result["sample_id"] = sample_id
        eval_result["dataset_index"] = record.get("dataset_index")
        eval_result["thinking_file"] = record.get("thinking_file")
        eval_result["output_file"] = record.get("output_file")
        eval_result["manifest_path"] = str(manifest_path)
        eval_result["target_output"] = record.get("target_output", "")
        eval_result["generated_output"] = generated_output

        category = categorize_result(eval_result, min_thinking_score)
        eval_result["category"] = category
        results.append(eval_result)
        category_rows[category].append(eval_result)

        write_json(result_dir / f"{sample_id}.json", eval_result)

    alignment_values = [
        row["target_alignment"]
        for row in results
        if isinstance(row.get("target_alignment"), int)
    ]
    thinking_scores = [
        row["thinking_quality_score"]
        for row in results
        if isinstance(row.get("thinking_quality_score"), int)
    ]

    summary = {
        "num_evaluated": len(results),
        "avg_target_alignment": round(sum(alignment_values) / len(alignment_values), 4)
        if alignment_values
        else None,
        "avg_thinking_quality_score": round(sum(thinking_scores) / len(thinking_scores), 4)
        if thinking_scores
        else None,
        "category_counts": {name: len(rows) for name, rows in category_rows.items()},
        "min_thinking_score": min_thinking_score,
        "all_samples_accepted": len(category_rows["accepted"]) == len(results) and len(results) > 0,
        "missing_accepted_count": len(results) - len(category_rows["accepted"]),
        "results": results,
    }

    write_json(result_dir / "summary.json", summary)
    for category, rows in category_rows.items():
        write_jsonl(result_dir / f"{category}.jsonl", rows)

    print(f"Saved evaluation summary: {result_dir / 'summary.json'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate generated streaming model-0 reasoning and outputs with DeepSeek."
    )
    parser.add_argument(
        "--manifest-path",
        default=str((SCRIPT_DIR / "generated/manifest.jsonl").resolve()),
        help="Path to the generation manifest JSONL.",
    )
    parser.add_argument(
        "--result-dir",
        default=str((SCRIPT_DIR / "evaluation").resolve()),
        help="Directory for per-sample evaluation JSON and summary/category files.",
    )
    parser.add_argument("--model", default="deepseek-reasoner")
    parser.add_argument(
        "--thinking-dir",
        default=None,
        help="Optional directory of generated thinking files named <sample_id>.txt.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Optional directory of generated output files named <sample_id>.txt.",
    )
    parser.add_argument(
        "--min-thinking-score",
        type=int,
        default=4,
        help="Minimum thinking quality score required for the accepted category.",
    )
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    evaluate_dataset(
        manifest_path=Path(args.manifest_path).resolve(),
        result_dir=Path(args.result_dir).resolve(),
        model=args.model,
        min_thinking_score=args.min_thinking_score,
        limit=args.limit,
        thinking_dir=Path(args.thinking_dir).resolve() if args.thinking_dir else None,
        output_dir=Path(args.output_dir).resolve() if args.output_dir else None,
    )
