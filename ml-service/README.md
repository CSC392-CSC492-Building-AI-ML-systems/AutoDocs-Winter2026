# AutoDocs local CPU ML service

This optional FastAPI service replaces the hosted Colab/ngrok endpoint with a
local Ollama-backed pipeline. It preserves the legacy `POST /` response
contract, and additionally provides durable `/jobs` endpoints for the web
app's opt-in progress UI.

## Prerequisites

- Python 3.11 or later.
- Ollama reachable at `OLLAMA_URL` (default: `http://127.0.0.1:11434`).
- A Model 0 GGUF registered in Ollama as `model0`, built from the project's
  fine-tuned adapter and served in raw-completion mode.
- `gpt-oss:20b` available in Ollama for Model 1 annotation.

The model names and CPU thread count are configurable. The service does not
download, merge, or quantize model artifacts itself.

## Start the service

From the repository root:

```bash
python3 -m venv ml-service/.venv
ml-service/.venv/bin/pip install -r ml-service/requirements.txt

export OLLAMA_URL="http://127.0.0.1:11434"
export MODEL0_NAME="model0"
export MODEL1_NAME="gpt-oss:20b"
export OLLAMA_NUM_THREAD="$(nproc)"
export AUTODOCS_JOB_DIRECTORY="$(pwd)/ml-service/jobs"

ml-service/.venv/bin/uvicorn app:app --app-dir ml-service --host 127.0.0.1 --port 8500
```

The job directory stores raw uploaded recordings and status snapshots with
owner-only permissions. Keep it on private storage and do not serve it over
HTTP. Set `AUTODOCS_JOB_DIRECTORY` to a durable private location when running
under a service manager.

## Connect the web app

Set these values in `autodocs-app/.env.local`:

```env
ML_URL="http://127.0.0.1:8500"
AUTODOCS_PROCESSING_MODE="local-cpu-jobs"
```

Apply `autodocs-app/db/init/004_processing_jobs.sql` to existing Postgres
databases before enabling this mode. See the [web app README](../autodocs-app/README.md#local-cpu-inference-option)
for the full migration and behavior notes.

## Compatibility

`AUTODOCS_PROCESSING_MODE` is deliberately opt-in. When it is absent, the web
app continues to call its original `/api/terminal-sessions` route, and this
service's `POST /` endpoint remains compatible with that route. Only the
`local-cpu-jobs` setting uses `POST /jobs` and `GET /jobs/{id}`.
