"""One serialized worker that turns persisted AutoDocs jobs into model results."""

import asyncio
import json
import logging
import tempfile
from pathlib import Path

import httpx

import model0
import model1
import parser0
import restructure
from job_store import JobStore


logger = logging.getLogger("ml-service.jobs")


class JobRunner:
    """Serialize all-core inference so two uploads cannot starve each other."""

    def __init__(self, store: JobStore) -> None:
        self.store = store
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.worker_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        for job_id in await self.store.pending_job_ids():
            await self.queue.put(job_id)
        self.worker_task = asyncio.create_task(self._work(), name="autodocs-job-worker")

    async def stop(self) -> None:
        if self.worker_task:
            self.worker_task.cancel()
            await asyncio.gather(self.worker_task, return_exceptions=True)

    async def enqueue(self, job_id: str) -> None:
        await self.queue.put(job_id)

    async def _work(self) -> None:
        while True:
            job_id = await self.queue.get()
            try:
                await self._run(job_id)
            except Exception as error:
                logger.exception("job %s failed", job_id)
                await self.store.failed(job_id, f"{type(error).__name__}: {error}")
            finally:
                self.queue.task_done()

    async def _run(self, job_id: str) -> None:
        await self.store.running(job_id)
        content = await self.store.input_content(job_id)
        await self.store.stage(job_id, "parse", 1, "Reading and validating the asciinema recording.")
        flat_xml = parser0.cast_to_xml(content, strip_annotations=True)
        await self.store.progress(job_id, "parse", 1, 1, "Terminal recording parsed into model input.")
        await self.store.complete_stage(job_id, "parse", "Terminal recording parsed successfully.")

        total_chunks = len(model0.extract_chunks(flat_xml))
        await self.store.stage(job_id, "boundaries", total_chunks, f"Checking 0 of {total_chunks} terminal chunks for event boundaries.")

        async def report_boundaries(current: int, total: int, found: int) -> None:
            await self.store.progress(job_id, "boundaries", current, total, f"Checked {current} of {total} chunks; found {found} event boundaries.")

        async with httpx.AsyncClient() as client:
            boundaries = await model0.find_new_event_timestamps(flat_xml, client, report_boundaries)
            await self.store.complete_stage(job_id, "boundaries", f"Detected {len(boundaries)} event boundaries across {total_chunks} chunks.")

            await self.store.stage(job_id, "restructure", 1, "Grouping chunks into hierarchical terminal events.")
            event_xml = restructure.restructure_xml_to_events(flat_xml, boundaries)
            await self.store.progress(job_id, "restructure", 1, 1, "Terminal chunks grouped into events.")
            await self.store.complete_stage(job_id, "restructure", "Terminal events are ready for summarization.")

            with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as temporary_file:
                temporary_file.write(event_xml)
                event_xml_path = temporary_file.name

            try:
                events = model1.load_events(event_xml_path)
                await self.store.stage(job_id, "annotate", len(events), f"Generating 0 of {len(events)} event summaries.")

                async def report_annotations(current: int, total: int, produced: int) -> None:
                    await self.store.progress(job_id, "annotate", current, total, f"Generated {produced} of {total} event summaries.")

                predictions = await model1.annotate_events(events, client, report_annotations)
            finally:
                Path(event_xml_path).unlink(missing_ok=True)

        await self.store.complete_stage(job_id, "annotate", f"Generated {len(predictions)} event summaries.")
        await self.store.stage(job_id, "finalize", 1, "Formatting results for the AutoDocs application.")
        result = {"content": [json.dumps({"idx": index, "depth": value["depth"], "summary": value["summary"]}) for index, value in sorted(predictions.items())]}
        await self.store.progress(job_id, "finalize", 1, 1, "Analysis results formatted successfully.")
        await self.store.complete_stage(job_id, "finalize", "Analysis results are ready to save.")
        await self.store.completed(job_id, result)
