# AutoDocs: From Logs to Docs
Upload your Asciinema terminal recording and convert it into documentation that you can share with your friends or colleagues.

## Our webapp
Access our hosted webapp [here](https://autodocs-winter2026-production.up.railway.app)!
or
Watch our [demo](https://drive.google.com/file/d/1ssCTLpFQCOF0IWctK1j3NYFi1jjNiI9B/view?usp=sharing)!
*Note that the generation feature may not work fully as the models are not hosted due to usage limits.

## Archeticture
Our webapp is built on **Next.js** with a **PostgreSQL** database. [Our model pipeline](https://github.com/CSC392-CSC492-Building-AI-ML-systems/AutoDocs-Winter2026/blob/main/host_pipeline.ipynb) is currently hosted using Colab Pro and exposed to the backend using an Ngrok tunnel.
<img width="1176" height="611" alt="{B8429BF9-6917-4791-A6F2-37BBD3A316B2}" src="https://github.com/user-attachments/assets/1f6d89c0-9a8a-4385-8824-3266ab31e22a" />
Parser 0 converts the Asciinema recordings into XML format for easier processing.
Model 0, our finetuned Microsoft Phi model, takes the XML input and categorizes it into new or old events.
Parser 1 wraps the created events with the relevant XML parts.
Model 1, our finetuned Deepseek R1 model, takes the events and generates the event tree by finding the relationship between the events.

## Documentation
To learn more about how the models are finetuned, visit these READMEs:
- [Generating thinking tokens](https://github.com/CSC392-CSC492-Building-AI-ML-systems/AutoDocs-Winter2026/blob/main/data-processing/model_0_streaming/guide_to_thinking.md)

### White Paper
Read our full paper here. (to be added)
