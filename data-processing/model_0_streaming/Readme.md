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

* **`Model_1_inference.ipynb`** *(Refinement to Model 1 is required)*  
  This notebook demonstrates the usage of Model 1 for event annotation. It takes a processed XML file where events are already labeled using event tags. Model 1 generates annotations and depth predictions for each event chunk. The prompts are directly adapted from the previous iteration, and the model is used without fine-tuning (same as in the previous iteration). The current model used is `openai/gpt-oss-20b`.

* **`EndToEndProcessWhole_file.ipynb`**  
  This notebook implements the full end-to-end pipeline. It takes a raw XML file as input, segments the file, and feeds it into Model 0 in a streaming manner. Each prediction is based on the previous 15 timestamps, and the model determines whether the current timestamp represents a new event boundary or belongs to an existing event. The prediction window then moves forward continuously. The predicted timestamp boundaries from Model 0 are collected and used to parse the input XML file into separate events by inserting event tags at the predicted boundaries. The event-tagged XML file is then passed to Model 1, which generates the annotation and depth prediction for each event.