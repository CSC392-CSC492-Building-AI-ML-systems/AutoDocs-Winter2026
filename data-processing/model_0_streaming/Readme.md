# Terminal Log Boundary Prediction (Model 0)

This repository contains the complete end-to-end pipeline for training and evaluating a Large Language Model (LLM) to detect phase transitions and event boundaries within continuous terminal XML logs.

## 📂 Repository Contents

* **`process_streaming_data.py`**
  The core data engineering script. It generates the streaming dataset used for Model 0 training. It parses raw XML logs into chunked events where each event captures terminal activity at a specific timestamp. It applies two-phase truncation and handles the logic to determine if the final timestamp represents a continuation of the previous group or the start of a new one. *For more details, see the [Dataset Card on Hugging Face](https://huggingface.co/datasets/Jaiccc/model0_boundary_predict_streaming).*

* **`base_model_0_inference.ipynb`**
  This notebook establishes the performance baseline. It demonstrates how the raw `Phi-4` model performs on the Model 0 dataset before any training. It includes implementation details on how to load the model, format prompts, and visualize terminal data.

* **`model_0_fine_tunning_(Streaming).ipynb`**
  The primary **training pipeline** notebook. It documents the actual fine-tuning process, including:
  * How the data is processed and formatted.
  * Splitting the dataset into training and evaluation sets.
  * Setting up the training pipeline and hyperparameters.
  * Executing the SFT (Supervised Fine-Tuning) process using Unsloth.
  * The fine tunned model can be found at the [Model Card on Hugging Face](https://huggingface.co/Jaiccc/model_0_streaming_timestamp).

* **`fine_tuned_model_0_inference(Streaming).ipynb`**
  This notebook demonstrates the performance of the final fine-tuned model. It features a side-by-side comparison with the baseline model, showcasing how the fine-tuned version significantly outperforms the original `Phi-4` model in detecting log boundaries on the evaluation set.
