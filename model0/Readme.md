# Terminal Log Boundary Prediction (Model 0)

### 🚀 Project Overview
This repository provides a complete end-to-end pipeline for **fine-tuning and evaluating Model 0**, specifically designed to detect phase transitions and logical event boundaries within continuous terminal XML logs. 
Additionally, it includes a comprehensive **demonstration of Model 1**, illustrating how to perform automated annotation on chunked events to identify and label discrete terminal activities.

## 📂 Repository Contents

### 📂 Data Preprocessing & Pipeline
* **`data-preprocessing/`**
  This directory contains the complete pipeline for transforming raw XML terminal recordings and ground-truth boundaries into structured training and testing datasets for Model 0.
  
  * **`inputs/`**: A collection of raw XML terminal recordings and log files used as the source data.
  * **`timestamp-output/`**: Ground-truth files corresponding to each input. These files record the specific timestamps of every "new event" boundary. Since every line has a unique timestamp, these effectively function as the logical line-number identifiers for boundaries.
  * **`parsed_inputs/`**: The output of the initial parsing stage (Parser 1). These XML files contain the necessary event tags used by Model 0 to distinguish and separate logical boundaries.
  * **`process_streaming_data.py`**
  The core data engineering script for the project. It generates the sliding-window streaming dataset required for Model 0 training. 
    * **Segmentation**: Parses raw logs into discrete, chunked events based on unique timestamps.
    * **Two-Phase Truncation**: Applies intra-chunk and window-level compression to manage context window limits while preserving chronological integrity.
    * **Boundary Logic**: Implements the decision logic to determine if a target timestamp represents a continuation of an "old event" or the start of a "new event."
    *For a deep dive into the dataset specifications, see the [Dataset Card on Hugging Face](https://huggingface.co/datasets/Jaiccc/model0_boundary_predict_streaming).*

### 📂 Model training / Colab notebooks
* **`base_model_0_inference.ipynb`**
  This notebook establishes the performance baseline. It demonstrates how the raw `Phi-4` model performs on the Model 0 dataset before any training. It includes implementation details on how to load the model, format prompts, and visualize terminal data.

* **`model_0_fine_tunning_(Streaming).ipynb`**
  The primary **training pipeline** notebook. It documents the end-to-end fine-tuning process, including:
  * **Data Preparation**: Strategies for processing and formatting XML terminal logs.
  * **Dataset Splitting**: Creating distinct training and evaluation sets (90/10 split).
  * **Hyperparameter Tuning**: Configuration of the SFT (Supervised Fine-Tuning) pipeline using Unsloth.
  * **Model Weights**: The resulting fine-tuned adapters are hosted at the [Model Card on Hugging Face](https://huggingface.co/Jaiccc/model_0_streaming_timestamp).

  **Generalization Performance (Blind Evaluation):**
  On a completely unseen evaluation dataset (data the model did **not** encounter during training), the results confirm strong generalization:
  * **Baseline (Phi-4)**: 83.27% (229/275)
  * **Fine-Tuned Model**: 95.27% (262/275)
  * **Net Improvement**: **+12.00%**

* **`fine_tuned_model_0_inference(Streaming).ipynb`**
  This notebook provides a comprehensive evaluation of the final fine-tuned model. It features a side-by-side comparison between the baseline `Phi-4` model and our fine-tuned version, utilizing a memory-efficient "adapter toggle" technique. 
  **Performance Metrics:**
  On a representative 200-sample split from the Model 0 dataset, the evaluation demonstrates a significant performance leap:
  * **Base Model (Phi-4):** 75.50% (151/200)
  * **Fine-Tuned Model:** 98.00% (196/200)
  * **Total Improvement:** **+22.50%**
  *Note: These statistics are calculated on a subset of the dataset to validate the model's high-precision capability in detecting complex terminal log boundaries which may contain leaked training data.*

* **`Model_1_inference.ipynb`** *(Refinement to Model 1 is required)*  
  This notebook demonstrates the usage of Model 1 for event annotation. It takes a processed XML file where events are already labeled using event tags. Model 1 generates annotations and depth predictions for each event chunk. The prompts are directly adapted from the previous iteration, and the model is used without fine-tuning (same as in the previous iteration). The current model used is `openai/gpt-oss-20b`.

* **`EndToEndProcessWhole_file.ipynb`**  
  This notebook implements the full end-to-end pipeline. It takes a raw XML file as input, segments the file, and feeds it into Model 0 in a streaming manner. Each prediction is based on the previous 15 timestamps, and the model determines whether the current timestamp represents a new event boundary or belongs to an existing event. The prediction window then moves forward continuously. The predicted timestamp boundaries from Model 0 are collected and used to parse the input XML file into separate events by inserting event tags at the predicted boundaries. The event-tagged XML file is then passed to Model 1, which generates the annotation and depth prediction for each event.

### 📂 Thinking Process & Reasoning (Experimental)

* **`thinking-tokens/`**
  This directory contains the datasets and research files for enabling **Explicit Reasoning** (Thinking Tokens) in the `Phi-4` model. This experimental branch aimed to implement a Chain-of-Thought (CoT) ability, where the model outputs its internal logic before reaching a final classification.

  **Training Methodology:**
  The pipeline utilized **Knowledge Distillation** from a teacher model. During training, the `Phi-4` model's generated thinking process was compared against reasoning traces obtained from more advanced reasoning models (e.g., O1/O3). The loss function guided the model’s internal logic to align with these high-level reasoning paths.

  **Evaluation & Final Decision:**
  Although the "Thinking" capability was successfully trained, it was **not utilized in the final production model** for the following reasons:
  1.  **High Baseline Performance**: The standard Fine-Tuned model (without thinking tokens) already achieved **>95% accuracy**, leaving very little room for improvement through added reasoning steps.
  2.  **Inference Hallucinations**: The inclusion of thinking tokens introduced a higher rate of **logical hallucinations**—the model would occasionally generate circular reasoning that distracted from the final classification task.
  3.  **Inference Latency**: Generating a chain of thought significantly increased the time-per-inference, which is counterproductive for the "Streaming" nature of this project.

  *For a deeper dive into the specific training logs and CoT datasets, please refer to the dedicated **README.md** located inside the `thinking-tokens/` folder.*

### 📂 Batch Prediction vs. Streaming (Experimental)

* **`direct_time_pred(Experimental)/`**
  This directory explores the architectural shift from **Sequential/Streaming Inference** to **Full-File Batch Prediction**. 

  **Motivation:**
  While the current streaming approach is highly accurate, it is computationally inefficient for large-scale deployment. In a live terminal environment, every single new line of output triggers a full model inference to determine if a boundary has occurred. 

  **Research Goal:**
  The experiment aims to allow the model to process an entire raw XML file in a single pass, outputting all boundary timestamps simultaneously. 

  **Future Research & Challenges:**
  This approach is currently in the experimental phase, with the following challenges identified for future contributors:
  1. **Context Window Management**: Developing strategies to split massive terminal logs into segments that fit the model's 16k/128k context window without losing boundary signals.
  2. **Sequence Adherence**: Ensuring the model meticulously evaluates every timestamp in a long recording without "skipping" sections or losing track of the chronological sequence.
  3. **Data Pre-processing**: Refining the parser to handle larger input blocks while maintaining the high precision found in the streaming Model 0.
