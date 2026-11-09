# n8n-nodes-speech-expert

Use [Speech Expert](https://speech-expert.ru/) in n8n to transcribe audio and video, generate speech, and research how audio sounds. The node accepts n8n binary files and uses a Speech Expert API key.

This community node is being prepared for n8n verification. It is **not yet an n8n verified community node**. Self-hosted n8n can install community packages; installation on n8n Cloud requires approval by n8n first.

## Operations

| Resource | Operations | Result |
| --- | --- | --- |
| Transcription | Create, Get | Background transcription, with an optional summary |
| Speech synthesis | Create, Get, Download, Get Voices | Background synthesis and a completed WAV file |
| Audio research | Upload Source, Preview, Analyze, Get Results, Get Presets | Saved sources, a cost estimate, and audio research or A/B comparison results |

Transcription offers seven core languages: **Armenian, English, Kazakh, Kyrgyz, Russian, Tajik, and Uzbek**. It selects a compatible default model for each language. An optional model override must support the selected language. Voice and synthesis-language availability depend on the voice catalog and selected engine.

## Installation

After the package has been published to npm, an owner or administrator of a self-hosted n8n instance can install `n8n-nodes-speech-expert` from **Settings > Community nodes > Install**. Follow the [n8n community node installation instructions](https://docs.n8n.io/integrations/community-nodes/installation/).

Before the first npm release, use a local package build in a development instance. Maintainer build and release instructions are in [docs/RELEASING.md](docs/RELEASING.md). Do not expect the package to appear in the n8n Cloud node search before verification.

## Credentials

1. Sign in to [Speech Expert](https://speech-expert.ru/) and create an API key in your account.
2. In n8n, create a **Speech Expert API** credential and paste the key into **API Key**.
3. Select that credential in every Speech Expert node in the workflow.

The node sends the key as `Authorization: Api-Key …` to the fixed Speech Expert API host. Keep keys in n8n credentials, not workflow parameters, exported JSON, or screenshots. Paid operations require sufficient Speech Expert credits. [API documentation](https://speech-expert.ru/documentation/)

## Transcribe a file

1. Obtain a file from a form, storage integration, webhook, or another node. Keep it in an n8n binary field, such as `audio`.
2. Choose **Transcription > Create**, set **Input Binary Field** to that field, and select the spoken language.
3. Save the returned operation `id`.
4. Use **Wait > Transcription Get > If** to poll that ID until `done` is `true`. Check `error` before treating the operation as successful.

Create submits a background task; it does not wait for the transcript. Use Get to check progress. A successful response contains the transcript in `response.result`; simplified output also exposes it as `text`. Requested summaries may be available in `response.summarization.summary` and the simplified `summary` field. A summary failure does not necessarily mean transcription failed.

**Privacy Mode** defaults to enabled and marks operation results as temporary. For this node's binary-file upload, **Create does not add a recording to your archive in either privacy setting**. Turning privacy mode off does not save the source in My Recordings.

Retrieve private results promptly. The API schedules automatic cleanup 15 minutes after the operation starts; reading the result does not purge it. This node does not call the purge endpoint. If immediate removal is needed after copying the result, add an authenticated HTTP Request to `POST /api/operations/{operationId}:purge`. See the [API privacy documentation](https://speech-expert.ru/documentation/api/stt-v1/#privacy-mode).

Optional summaries and the default Armenian, Kazakh, Kyrgyz, and Tajik Large profiles require **Allow External AI Processing**. The node also requires consent for an unfamiliar model override, even when Privacy Mode is off. Allowing external processing does not enable permanent result storage. Enable consent only when the intended processing is appropriate for your data.

[Import the transcription example](examples/transcribe-audio.json). It accepts a file through an authenticated n8n form, creates one Russian transcription, and polls every five seconds for at most ten minutes or 120 status responses. Change the language and summary settings in the Create node as needed. Configure both the form's Basic Auth credential and the Speech Expert credentials before using it.

## Generate speech

1. Use **Speech Synthesis > Get Voices** to find a voice and its supported engines.
2. Choose **Create**, enter the text, exact voice name, engine, and language.
3. Save the operation `id`, then poll it with **Wait > Get > If**.
4. After `done: true` without `error`, use **Download** with the same ID.

Download returns a completed PCM16 mono WAV in the chosen output binary field, normally `audio`. This is file synthesis for workflow automation; it does not stream live playback into n8n. The node checks operation readiness before downloading. Keep the same credentials for Create, Get, and Download.

[Import the synthesis example](examples/synthesize-speech.json), review its text and voice settings, and select your credentials. It creates one operation, uses bounded polling, and downloads the result. The sample text is Russian to match the default voice reference and `ru-RU` setting.

## Research audio

Research uses sources saved in your Speech Expert archive.

1. **Upload Source** accepts a binary file. Supply a new UUID as **Request ID** for each distinct upload. Reuse that UUID only to retry the same upload.
2. Keep the returned source `id` and `duration_ms`.
3. **Preview** validates the selected recording, preset, and time range, and returns an estimated charge in `billing.credits`. It does not invoke the analysis model.
4. Review the estimate. Configure **Analyze** with the same request, a non-negative **Maximum Credits**, and explicit **Allow External AI Processing** consent.
5. **Get Results** retrieves the saved research history for the recording.

Normal research presets examine a continuous fragment between **20 and 120 seconds**. The node uses seconds in its interface and converts them to API milliseconds. The three standard presets cover prosody and meaning, audience reactions, and changes in delivery. **Evidence Mode** controls whether available stored transcripts and analyzer results are included alongside the audio.

Upload Source stores the recording without running transcription or analysis. Preview performs validation and pricing without paid model analysis. Analyze is the paid call and may take several minutes. **Maximum Credits** defaults to `0`, so an unconfigured node cannot start a positive-cost analysis. A price exceeding the cap is rejected by the server.

[Import the research preview example](examples/research-audio.json). Its connected path stops at Preview. A separate, unconnected Analyze node shows the corresponding paid operation; its cap remains `0` and consent remains off. To analyze, reuse the saved recording ID, review the estimate, set the cap and consent, and run only the intended analysis path.

## Compare synthesized speech

Choose **Speech Synthesis A/B Comparison** as the research preset. Upload variants A and B separately using that preset and distinct upload UUIDs. Both files must contain the same intended text, be different saved recordings, and each be longer than zero and no longer than **120 seconds**.

Preview and Analyze require:

- **Recording ID** and **End (Seconds)** for variant A.
- **Comparison Recording ID** and **Comparison Duration (Seconds)** for variant B.
- **Target Text**: the exact text both clips should say, up to 4,000 characters.
- **Pair ID**: your comparison label, up to 256 characters.
- Optional **Speech Context**, up to 1,000 characters, describing the intended language, dialect, or delivery.

Use each complete file: set durations to the respective upload response's `duration_ms / 1000`. A/B comparison starts at zero, uses audio-only evidence, and is priced for both clips. The result is a **subjective model review, not a measured MOS score**. Listen to the cited passages when making a consequential voice choice.

## Retries, costs, and stored data

- Creating transcription or synthesis, or running Analyze, can spend credits. The node does not automatically retry these creation calls. A repeated Create starts another operation; research Analyze is not idempotent.
- If a request times out, check the existing operation ID or research history before submitting it again. An n8n timeout does not cancel a server operation.
- Only source upload has the Request ID duplicate-protection behavior. It does not make repeated analysis free.
- Research sources remain in the Speech Expert archive even if you stop after Preview. Research sends selected audio and requested context to an external AI provider after consent. Manage saved files and retention in your account.
- Review n8n execution retention and binary storage separately. n8n may retain workflow inputs and outputs according to its configuration.
- Large uploads depend on limits and available memory in n8n, any proxy, and Speech Expert. The usual Speech Expert upload limit is 500 MiB; an n8n form commonly has a lower limit. The node does not increase those limits.

See the [n8n integration guide](https://speech-expert.ru/documentation/integrations/n8n/) for API behavior, billing, and file handling details. The examples contain no credentials and import inactive. They deliberately process one file or text item per execution and reject multiple input items before creating an operation. For a batch workflow, run the complete create-and-poll sequence separately for each item and retain each returned operation ID.

## Development and support

Use Node.js 24 or newer, install dependencies with `npm ci --ignore-scripts`, then run `npm run lint`, `npm test`, and `npm run build`. Dependency install scripts are not needed to build and check this package. Use an isolated n8n development instance for integration tests. See [release instructions](docs/RELEASING.md) for packaging and verification.

Report node issues at [strij9111/n8n-nodes-speech-expert](https://github.com/strij9111/n8n-nodes-speech-expert/issues). Include the node operation, package version, and a redacted error. Do not attach credentials or private audio.

License: MIT.
