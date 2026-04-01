## How to Generate Thinking Tokens for Our Model (Bash Version)

1. **Open your terminal** (Bash/Zsh) in the repo root.

2. **Ensure your environment is configured** with the following:
* **Environment Variables:**
    * `AZURE_API_KEY`: Required for Phi generation.
    * `DEEPSEEK_API_KEY`: Required for evaluation.
* **Training Dependencies** (if fine-tuning): `torch`, `datasets`, `transformers`, `trl`, `unsloth`.

3. **Move into the streaming folder:**
```bash
cd ./data-processing/model_0_streaming
```

4. **Generate Phi reasoning for the dataset:**
```bash
python ./phi_reasoning_extraction.py --dataset-path ./streaming_dataset.jsonl --output-dir ./generated
```
To force a full regeneration:
```bash
python ./phi_reasoning_extraction.py --dataset-path ./streaming_dataset.jsonl --output-dir ./generated --force-all
```
> Using a higher-tier model to generate thinking tokens for our model typically increases accuracy.

5. **Evaluate the generated reasoning with DeepSeek:**
```bash
python ./deepseek_eval.py --manifest-path ./generated/manifest.jsonl --result-dir ./evaluation --min-thinking-score 4
```
 > This ensures that the generated thinking tokens meet quality standards before they are incorporated into the dataset.

6. **Check whether every sample is accepted:**
```bash
cat ./evaluation/summary.json
```
Look for:
* `"all_samples_accepted": true`

If it is `false`, repeat **Step 4** and then **Step 5**.

7. **Final output locations:**
* **Generated output artifacts:** `/generated/outputs`
* **Generated reasoning:** `/generated/thinking`
* **Evaluation results:** `/evaluation`

## Notes
**/generated_unlimited** contains the generated output without having a token limitation.

**/generated_128** contains the generated output with a token limit of 128.

Thinking tokens that are generated alongside incorrect output are recorded with a *discarded* tag on the top of the file.
