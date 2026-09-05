"""ml-service: local-CPU replacement for the Colab+ngrok Flask endpoint.

Implements the same contract the notebook's Flask sketch intended
(POST / -> {title, content}) but with real, verified glue between the four
pipeline stages, and calling local Ollama-served models instead of Colab.

Response contract (verified against autodocs-app/app/api/terminal-sessions/route.ts):
  {"title": <str>, "content": [<JSON string of {"idx","depth","summary"}>, ...]}
content must be an array of JSON-encoded STRINGS, not objects -- the Next.js
route does JSON.parse() on each element itself.
"""
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import model0
import model1
import parser0
import restructure
from job_runner import JobRunner
from job_store import JobStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-service")

job_store = JobStore(os.getenv("AUTODOCS_JOB_DIRECTORY", str(Path(__file__).with_name("jobs"))))
job_runner = JobRunner(job_store)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await job_runner.start()
    try:
        yield
    finally:
        await job_runner.stop()


app = FastAPI(title="autodocs-ml-service", lifespan=lifespan)


class RecordingRequest(BaseModel):
    title: str
    content: str


class RecordingResponse(BaseModel):
    title: str
    content: list[str]


class JobRequest(RecordingRequest):
    jobId: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/jobs")
async def create_job(body: JobRequest):
    try:
        state = await job_store.create(body.jobId, body.title, body.content)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Could not persist upload job: {error}") from error
    await job_runner.enqueue(body.jobId)
    return state


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    try:
        return await job_store.status(job_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Upload job not found.") from error


@app.post("/", response_model=RecordingResponse)
async def process_recording(body: RecordingRequest):
    title = body.title
    logger.info("processing %s (%d bytes)", title, len(body.content))

    try:
        flat_xml = parser0.cast_to_xml(body.content, strip_annotations=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"parser0 failed: {e}") from e

    async with httpx.AsyncClient() as client:
        new_event_timestamps = await model0.find_new_event_timestamps(flat_xml, client)
        logger.info("model0: %d new-event boundaries", len(new_event_timestamps))

        event_xml = restructure.restructure_xml_to_events(flat_xml, new_event_timestamps)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
            f.write(event_xml)
            event_xml_path = f.name

        try:
            events = model1.load_events(event_xml_path)
            preds = await model1.annotate_events(events, client)
        finally:
            Path(event_xml_path).unlink(missing_ok=True)

    logger.info("model1: annotated %d/%d events", len(preds), len(events))

    content = [
        json.dumps({"idx": idx, "depth": v["depth"], "summary": v["summary"]})
        for idx, v in sorted(preds.items())
    ]

    return RecordingResponse(title=title, content=content)
