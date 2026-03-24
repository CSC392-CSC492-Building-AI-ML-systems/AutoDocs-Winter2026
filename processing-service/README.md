# Processing Service

This service turns a terminal recording upload into the final `model 1` annotation output your Next app already knows how to display.

Pipeline:

1. Upload `.cast`, `.rec`, `.asciinema`, or raw `.xml`
2. Parser 0 converts recording JSON into raw XML
3. Model 0 runs the same boundary-detection logic extracted from `data-processing/EndToEndProcessWhole_file(1).ipynb`
4. Parser 1 restructures the XML into `<event>` groups
5. Model 1 annotates each event with `summary` and `depth`
6. The response includes `sessionContent`, which is already formatted for the current frontend

## Recommendation

Use Colab only as a temporary GPU host while you are prototyping. It can work with `FastAPI + ngrok/cloudflared`, but it is not a stable app backend because the runtime sleeps, URLs change, and large model startup is slow.

The more reliable setup is:

- Next.js app on your normal app host
- This FastAPI service on a persistent GPU machine
- `PROCESSOR_API_URL` in the Next app pointing at the FastAPI service

## Install

Install a CUDA-compatible PyTorch build first for your machine, then:

```bash
cd processing-service
pip install -r requirements.txt
```

Important env vars:

```bash
export HF_TOKEN=your_huggingface_token
export MODEL0_REPO_ID=Jaiccc/model_0_streaming_timestamp
export MODEL1_MODEL_ID=openai/gpt-oss-20b
```

Optional tuning:

```bash
export MODEL0_MAX_SEQ_LENGTH=4096
export MODEL1_GPU_UTIL=0.70
export MODEL1_MAX_MODEL_LEN=16384
export MODEL1_MAX_NEW_TOKENS=2000
```

## Run

```bash
cd processing-service
uvicorn app:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Colab Prototype

If you insist on Colab for the first iteration, the workable pattern is:

1. Clone the repo into the runtime.
2. Install the requirements.
3. Start `uvicorn`.
4. Expose the FastAPI port with ngrok or cloudflared.
5. Put that public URL into the Next app as `PROCESSOR_API_URL`.

That will let the Next route treat Colab like a temporary GPU microservice, but expect downtime whenever the notebook disconnects.
