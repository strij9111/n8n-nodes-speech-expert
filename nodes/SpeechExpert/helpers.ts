import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
} from 'n8n-workflow';

const API_URL = 'https://speech-expert.ru/api';
const DEFAULT_MODELS: Record<string, string> = {
	'ru-RU': 'SpeechExpert-STT-RU',
	'en-US': 'Parakeet-EN',
	'kk-KZ': 'SpeechExpert-STT-KK-Large',
	'ky-KG': 'SpeechExpert-STT-KY-Large',
	'uz-UZ': 'SpeechExpert-STT-UZ',
	'tg-TJ': 'SpeechExpert-STT-TG-Large',
	'hy-AM': 'SpeechExpert-STT-HY-Large',
};

// Require explicit consent for external models and unknown future overrides.
// "Large" alone is not sufficient: some Large models run locally.
const LOCAL_MODELS = new Set(
	[
		'SpeechExpert-STT-RU',
		'SpeechExpert-STT-RU-stream',
		'SpeechExpert-STT-EN',
		'Parakeet-EN',
		'SpeechExpert-STT-UZ',
		'SpeechExpert-STT-UZ-stream',
		'SpeechExpert-STT-UZ-Large',
		'SpeechExpert-STT-KK-stream',
		'SpeechExpert-STT-TG-stream',
		'Whisper-Kotib-UZ',
		'Whisper-Callcenter-UZ',
		'Uzinfocom-FastConformer-UZ',
		'GigaAM-Multilingual-Large-CTC',
		'GigaAM-v3-RNNT',
		'Mhery-RNNT',
		'Armenian-Zipformer',
		'Tajik-Zipformer-v0.61',
		'Vosk-0.54',
		'GigaAM-UZ-0.6B',
		'Whisper-Large-v3-Turbo',
	].map((model) => model.toLowerCase()),
);

function fail(context: IExecuteSingleFunctions, message: string): never {
	throw new NodeOperationError(context.getNode(), message, { itemIndex: context.getItemIndex() });
}

function text(context: IExecuteSingleFunctions, name: string, fallback = ''): string {
	return String(context.getNodeParameter(name, fallback)).trim();
}

function required(context: IExecuteSingleFunctions, name: string, maxLength?: number): string {
	const value = text(context, name);
	if (!value || (maxLength !== undefined && value.length > maxLength)) {
		fail(
			context,
			`Provide ${name}${maxLength ? ` with no more than ${maxLength} characters` : ''}`,
		);
	}
	return value;
}

function uuid(context: IExecuteSingleFunctions, name: string): string {
	const value = required(context, name);
	if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) {
		fail(context, `${name} must be a UUID`);
	}
	return value.toLowerCase();
}

function limitedText(context: IExecuteSingleFunctions, name: string, limit: number): string {
	const value = text(context, name);
	if (value.length > limit) fail(context, `${name} must not exceed ${limit} characters`);
	return value;
}

function milliseconds(context: IExecuteSingleFunctions, name: string, fallback: number): number {
	const value = Number(context.getNodeParameter(name, fallback));
	const ms = Math.round(value * 1000);
	if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(ms)) {
		fail(context, `${name} must be a finite, non-negative number of seconds`);
	}
	return ms;
}

// A dependency-free multipart body. Binary input is read through n8n's storage helper,
// so this works with filesystem and external binary storage as well as inline data.
async function multipart(
	context: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
	fields: Record<string, string>,
	withAudio: boolean,
): Promise<IHttpRequestOptions> {
	const parts = Object.entries(fields).map(([name, value]) =>
		Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}`),
	);
	if (withAudio) {
		const property = required(context, 'binaryPropertyName');
		const binary = context.helpers.assertBinaryData(property);
		const content = await context.helpers.getBinaryDataBuffer(property);
		if (!content.length) fail(context, `The binary field "${property}" is empty`);
		const filename = encodeURIComponent((binary.fileName || 'audio.wav').split(/[\\/]/).pop()!);
		const mime = /^[\w.+-]+\/[\w.+-]+$/.test(binary.mimeType)
			? binary.mimeType
			: 'application/octet-stream';
		parts.push(
			Buffer.concat([
				Buffer.from(
					`Content-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
				),
				content,
			]),
		);
	}
	let boundary = 'n8nSpeechExpertMultipartBoundary';
	while (parts.some((part) => part.includes(boundary))) boundary += 'x';
	request.body = Buffer.concat([
		...parts.flatMap((part) => [Buffer.from(`--${boundary}\r\n`), part, Buffer.from('\r\n')]),
		Buffer.from(`--${boundary}--\r\n`),
	]);
	request.headers = {
		...request.headers,
		'Content-Type': `multipart/form-data; boundary=${boundary}`,
	};
	request.json = false;
	return request;
}

export async function prepareTranscription(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const language = text(this, 'language', 'ru-RU');
	if (!DEFAULT_MODELS[language])
		fail(this, 'Choose one of the seven supported transcription languages');
	const model = text(this, 'modelOverride') || DEFAULT_MODELS[language];
	const summary = text(this, 'summaryPreset');
	if (!['', 'short', 'conversation'].includes(summary))
		fail(this, 'Choose a supported summary preset');
	const consent = this.getNodeParameter('externalAiConsent', false) === true;
	if ((!LOCAL_MODELS.has(model.toLowerCase()) || summary) && !consent) {
		fail(
			this,
			'Enable Allow External AI Processing for the selected model or summary. Unknown model overrides also require consent.',
		);
	}
	const fields: Record<string, string> = {
		lang: language,
		channelMode: 'mono',
		diarization: 'false',
		llmCorrection: 'false',
		privacyMode: String(this.getNodeParameter('privacyMode', true) === true),
		externalAiConsent: String(consent),
	};
	request.qs = { ...request.qs, model };
	if (summary) {
		fields.summarizationPreset = summary;
		fields.summarizationDetail = 'standard';
	}
	return await multipart(this, request, fields, true);
}

export async function prepareSynthesis(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const engine = text(this, 'engine', 'higgs');
	const speed = Number(this.getNodeParameter('speed', 1));
	const sampleRate = Number(this.getNodeParameter('sampleRate', 48000));
	if (!['higgs', 'eleven_v4'].includes(engine)) fail(this, 'Choose a supported synthesis engine');
	if (
		!Number.isFinite(speed) ||
		speed < 0.1 ||
		speed > 3 ||
		(engine === 'eleven_v4' && speed !== 1)
	) {
		fail(this, 'Speed must be between 0.1 and 3; ElevenLabs v4 requires a speed of 1');
	}
	if (![8000, 48000].includes(sampleRate)) fail(this, 'Sample rate must be 8000 or 48000');
	return await multipart(
		this,
		request,
		{
			text: required(this, 'text', 40000),
			voice: required(this, 'voice'),
			synthesisEngine: engine,
			lang: required(this, 'language'),
			speed: String(speed),
			format: 'wav',
			sampleRateHertz: String(sampleRate),
		},
		false,
	);
}

export async function ensureSynthesisReady(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const id = required(this, 'operationId');
	const operation = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'speechExpertApi',
		{
			method: 'GET',
			url: `${API_URL}/tts/v1/operations/${encodeURIComponent(id)}`,
			json: true,
			timeout: 30000,
			disableFollowRedirect: true,
		},
	)) as IDataObject;
	const metadata = operation.metadata as IDataObject | undefined;
	if (operation.error || metadata?.status === 'failed' || metadata?.status === 'cancelled') {
		fail(
			this,
			'The synthesis operation failed or was cancelled; incomplete audio will not be downloaded',
		);
	}
	if (
		operation.done !== true ||
		metadata?.status !== 'completed' ||
		metadata.result_available !== true
	) {
		fail(
			this,
			'The complete synthesis audio is not available. Use Get to check its status, then retry Download.',
		);
	}
	request.json = false;
	request.encoding = 'arraybuffer';
	request.headers = { ...request.headers, Accept: 'audio/wav' };
	return request;
}

export async function prepareResearchSource(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const fields: Record<string, string> = {
		requestId: uuid(this, 'requestId'),
		presetId: required(this, 'presetId'),
	};
	const name = limitedText(this, 'sourceName', 512);
	if (name) fields.name = name;
	return await multipart(this, request, fields, true);
}

export async function prepareResearch(
	this: IExecuteSingleFunctions,
	request: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const comparison = text(this, 'presetId') === 'tts_ab_quality';
	const body: IDataObject = {
		recordingId: uuid(this, 'recordingId'),
		presetId: required(this, 'presetId'),
		startMs: comparison ? 0 : milliseconds(this, 'startSeconds', 0),
		endMs: milliseconds(this, 'endSeconds', 75),
		evidenceMode: comparison ? 'none' : text(this, 'evidenceMode', 'none'),
		instructions: limitedText(this, 'instructions', 4000),
	};
	if (comparison) {
		body.comparisonRecordingId = uuid(this, 'comparisonRecordingId');
		if (body.comparisonRecordingId === body.recordingId)
			fail(this, 'Upload two different recordings for A/B comparison');
		body.comparisonEndMs = milliseconds(this, 'comparisonDurationSeconds', 75);
		if (
			Number(body.endMs) < 1 ||
			Number(body.endMs) > 120000 ||
			body.comparisonEndMs < 1 ||
			body.comparisonEndMs > 120000
		) {
			fail(this, 'Each complete A/B clip must be between 0.001 and 120 seconds long');
		}
		body.targetText = required(this, 'targetText', 4000);
		body.pairId = required(this, 'pairId', 256);
		body.speechContext = limitedText(this, 'speechContext', 1000);
	} else {
		const duration = Number(body.endMs) - Number(body.startMs);
		if (duration < 20000 || duration > 120000)
			fail(this, 'Select a research fragment between 20 and 120 seconds long');
	}
	if (text(this, 'operation') === 'analyze') {
		if (this.getNodeParameter('externalAiConsent', false) !== true) {
			fail(this, 'Enable Allow External AI Processing before running audio research');
		}
		const maxCredits = text(this, 'maxCredits', '0');
		if (!/^\d+(?:\.\d+)?$/.test(maxCredits))
			fail(this, 'Maximum Credits must be a non-negative decimal amount');
		body.maxCredits = maxCredits;
	}
	request.body = body;
	request.json = true;
	request.headers = { ...request.headers, 'Content-Type': 'application/json' };
	return request;
}

function object(value: unknown): value is IDataObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function parseJsonResponse(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	let body: unknown = response.body;
	if (Buffer.isBuffer(body)) body = body.toString('utf8');
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body);
		} catch {
			fail(this, 'Speech Expert returned an invalid JSON response');
		}
	}
	const simplify = this.getNodeParameter('simplify', true) === true;
	return (Array.isArray(body) ? body : [body]).map((value: unknown) => {
		if (!object(value)) fail(this, 'Speech Expert returned an unexpected response format');
		const json = { ...value };
		if (simplify) {
			if (object(json.response)) {
				if (typeof json.response.result === 'string') json.text = json.response.result;
				if (
					object(json.response.summarization) &&
					typeof json.response.summarization.summary === 'string'
				) {
					json.summary = json.response.summarization.summary;
				}
			}
			if (text(this, 'resource') === 'research' && text(this, 'operation') === 'preview') {
				delete json.prompt;
				delete json.evidence;
			}
		}
		return { json, pairedItem: { item: this.getItemIndex() } };
	});
}

export async function binaryAudioResponse(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const body: unknown = response.body;
	const audio = Buffer.isBuffer(body)
		? body
		: body instanceof ArrayBuffer
			? Buffer.from(body)
			: null;
	if (
		!audio ||
		audio.length < 12 ||
		audio.toString('ascii', 0, 4) !== 'RIFF' ||
		audio.toString('ascii', 8, 12) !== 'WAVE'
	) {
		fail(this, 'Speech Expert did not return a valid WAV file');
	}
	const id = required(this, 'operationId');
	const property = required(this, 'binaryPropertyName');
	const data = await this.helpers.prepareBinaryData(
		audio,
		`speech-${id.replace(/[^\w-]/g, '_')}.wav`,
		'audio/wav',
	);
	return [
		{
			json: { operationId: id },
			binary: { [property]: data },
			pairedItem: { item: this.getItemIndex() },
		},
	];
}
