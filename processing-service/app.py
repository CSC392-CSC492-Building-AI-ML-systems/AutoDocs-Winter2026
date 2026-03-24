from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from pipeline import RecordingPipelineService


app = FastAPI(
    title="AutoDocs Processing Service",
    version="0.1.0",
)
pipeline = RecordingPipelineService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process-terminal-recording")
async def process_terminal_recording(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
) -> dict[str, object]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file is missing a filename.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = pipeline.process_upload(
            filename=file.filename,
            payload=payload,
            title_override=title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "The processing service is missing runtime dependencies. "
                f"Original error: {exc}"
            ),
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc

    return {
        "filename": result.filename,
        "title": result.title,
        "durationSeconds": result.duration_seconds,
        "sessionContent": result.session_content,
        "boundaryTimestamps": result.boundary_timestamps,
        "annotations": result.annotations,
        "parsedXml": result.parsed_xml,
        "rawXml": result.raw_xml,
    }
