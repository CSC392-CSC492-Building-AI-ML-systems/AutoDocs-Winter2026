"""Durable, observable state for serialized local AutoDocs inference jobs."""

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STAGES = (
    ("parse", "Parsing terminal recording", 5),
    ("boundaries", "Detecting event boundaries", 45),
    ("restructure", "Grouping terminal events", 5),
    ("annotate", "Generating event summaries", 43),
    ("finalize", "Finalizing session", 2),
)


class JobStore:
    """Own job snapshots and raw inputs without exposing raw terminal data."""

    def __init__(self, root_path: str) -> None:
        self.root = Path(root_path)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    def _state_path(self, job_id: str) -> Path:
        return self.root / f"{job_id}.json"

    def _input_path(self, job_id: str) -> Path:
        return self.root / f"{job_id}.cast"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _write_json(self, path: Path, value: dict[str, Any]) -> None:
        temporary_path = path.with_suffix(".tmp")
        temporary_path.write_text(json.dumps(value, separators=(",", ":")))
        os.chmod(temporary_path, 0o600)
        temporary_path.replace(path)

    def _load(self, job_id: str) -> dict[str, Any]:
        path = self._state_path(job_id)
        if not path.exists():
            raise KeyError(job_id)
        return json.loads(path.read_text())

    @staticmethod
    def _stages() -> list[dict[str, Any]]:
        return [{"id": identifier, "label": label, "weight": weight, "status": "pending", "current": 0, "total": 0, "detail": ""} for identifier, label, weight in STAGES]

    async def create(self, job_id: str, title: str, content: str) -> dict[str, Any]:
        """Persist source input first, then publish an observable queued job."""
        async with self._lock:
            input_path = self._input_path(job_id)
            temporary_path = input_path.with_suffix(".tmp")
            temporary_path.write_text(content)
            os.chmod(temporary_path, 0o600)
            temporary_path.replace(input_path)
            now = self._now()
            state = {"id": job_id, "title": title, "status": "queued", "percent": 0, "createdAt": now, "updatedAt": now, "stages": self._stages(), "timeline": [{"at": now, "kind": "queued", "message": "Upload accepted; waiting for the CPU inference worker."}], "error": None, "result": None}
            self._write_json(self._state_path(job_id), state)
            return state

    async def status(self, job_id: str) -> dict[str, Any]:
        async with self._lock:
            return self._load(job_id)

    async def input_content(self, job_id: str) -> str:
        async with self._lock:
            return self._input_path(job_id).read_text()

    async def running(self, job_id: str) -> None:
        await self._mutate(job_id, status="running", message="CPU inference worker started.", kind="started")

    async def stage(self, job_id: str, stage_id: str, total: int, detail: str) -> None:
        async with self._lock:
            state = self._load(job_id)
            stage = next(stage for stage in state["stages"] if stage["id"] == stage_id)
            stage.update({"status": "running", "current": 0, "total": total, "detail": detail})
            self._append_event(state, "stage", detail)
            self._touch(state)
            self._write_json(self._state_path(job_id), state)

    async def progress(self, job_id: str, stage_id: str, current: int, total: int, detail: str) -> None:
        async with self._lock:
            state = self._load(job_id)
            stage = next(stage for stage in state["stages"] if stage["id"] == stage_id)
            previous_current = stage["current"]
            stage.update({"current": current, "total": total, "detail": detail})
            completed_weight = sum(candidate["weight"] for candidate in state["stages"] if candidate["status"] == "completed")
            if total:
                completed_weight += stage["weight"] * min(current / total, 1)
            state["percent"] = min(99, int(completed_weight))
            milestone = total and (current == 1 or current == total or (current * 100 // total) // 10 > (previous_current * 100 // total) // 10)
            if milestone:
                self._append_event(state, "progress", detail)
            self._touch(state)
            self._write_json(self._state_path(job_id), state)

    async def complete_stage(self, job_id: str, stage_id: str, detail: str) -> None:
        async with self._lock:
            state = self._load(job_id)
            stage = next(stage for stage in state["stages"] if stage["id"] == stage_id)
            stage["status"] = "completed"
            stage["current"] = stage["total"] or 1
            stage["total"] = stage["total"] or 1
            stage["detail"] = detail
            self._append_event(state, "complete", detail)
            self._touch(state)
            self._write_json(self._state_path(job_id), state)

    async def completed(self, job_id: str, result: dict[str, Any]) -> None:
        await self._mutate(job_id, status="completed", percent=100, result=result, message="Session analysis completed and is ready to save.", kind="completed")

    async def failed(self, job_id: str, message: str) -> None:
        await self._mutate(job_id, status="failed", error=message, message=message, kind="failed")

    async def pending_job_ids(self) -> list[str]:
        async with self._lock:
            queued: list[str] = []
            for path in self.root.glob("*.json"):
                state = json.loads(path.read_text())
                if state["status"] == "queued":
                    queued.append(state["id"])
                elif state["status"] == "running":
                    state["status"] = "failed"
                    state["error"] = "The inference service restarted before this job finished. Upload again to retry."
                    self._append_event(state, "failed", state["error"])
                    self._touch(state)
                    self._write_json(path, state)
            return queued

    async def _mutate(self, job_id: str, **changes: Any) -> None:
        async with self._lock:
            state = self._load(job_id)
            message = changes.pop("message", None)
            kind = changes.pop("kind", "update")
            state.update(changes)
            if message:
                self._append_event(state, kind, message)
            self._touch(state)
            self._write_json(self._state_path(job_id), state)

    def _append_event(self, state: dict[str, Any], kind: str, message: str) -> None:
        state["timeline"].append({"at": self._now(), "kind": kind, "message": message})
        state["timeline"] = state["timeline"][-120:]

    def _touch(self, state: dict[str, Any]) -> None:
        state["updatedAt"] = self._now()
