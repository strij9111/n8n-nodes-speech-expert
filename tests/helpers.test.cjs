const test = require('node:test');
const assert = require('node:assert/strict');
const {
	prepareTranscription, prepareSynthesis, ensureSynthesisReady,
	prepareResearchSource, prepareResearch, parseJsonResponse, binaryAudioResponse,
} = require('../dist/nodes/SpeechExpert/helpers.js');

const sourceA = '11111111-1111-4111-8111-111111111111';
const sourceB = '22222222-2222-4222-8222-222222222222';
const audio = Buffer.from('RIFF\x04\x00\x00\x00WAVEbinary\x00\xff', 'latin1');

function context(parameters = {}, overrides = {}) {
	const calls = [];
	const node = { id: 'test-node', name: 'Speech Expert test', type: 'speechExpert', typeVersion: 1,
		position: [0, 0], parameters };
	const fixture = {
		parameters, calls,
		getNode: () => node,
		getItemIndex: () => 3,
		getNodeParameter: (name, fallback) => Object.hasOwn(parameters, name) ? parameters[name] : fallback,
		helpers: {
			assertBinaryData: (property) => {
				calls.push({ kind: 'binaryMetadata', property });
				assert.equal(property, 'audio');
				return { fileName: 'запись.wav', mimeType: 'audio/wav', data: 'filesystem' };
			},
			getBinaryDataBuffer: async (property) => {
				calls.push({ kind: 'binaryRead', property });
				return audio;
			},
			httpRequestWithAuthentication: async function (credential, request) {
				calls.push({ kind: 'http', credential, request });
				assert.equal(this, fixture);
				return { id: sourceA, done: true, error: null,
					metadata: { status: 'completed', result_available: true } };
			},
			prepareBinaryData: async (data, fileName, mimeType) => {
				calls.push({ kind: 'binaryWrite', data, fileName, mimeType });
				return { data: data.toString('base64'), fileName, mimeType };
			},
			...overrides,
		},
	};
	return fixture;
}

function fields(request) {
	assert.ok(Buffer.isBuffer(request.body));
	assert.equal(request.json, false);
	const boundary = request.headers['Content-Type'].split('boundary=')[1];
	assert.ok(boundary);
	const result = {};
	for (const part of request.body.toString('latin1').split(`--${boundary}`)) {
		const match = part.match(/name="([^\"]+)"(?:; filename="([^\"]+)")?\r\n(?:Content-Type: ([^\r]+)\r\n)?\r\n([\s\S]*)\r\n$/);
		if (match) result[match[1]] = { value: match[4], filename: match[2], mimeType: match[3] };
	}
	return result;
}

test('transcription sends real binary storage bytes and seven default model/language pairs', async () => {
	const mapping = { 'ru-RU': 'SpeechExpert-STT-RU', 'en-US': 'Parakeet-EN',
		'kk-KZ': 'SpeechExpert-STT-KK-Large', 'ky-KG': 'SpeechExpert-STT-KY-Large',
		'uz-UZ': 'SpeechExpert-STT-UZ', 'tg-TJ': 'SpeechExpert-STT-TG-Large',
		'hy-AM': 'SpeechExpert-STT-HY-Large' };
	for (const [language, model] of Object.entries(mapping)) {
		const fixture = context({ binaryPropertyName: 'audio', language, externalAiConsent: true });
		const request = await prepareTranscription.call(fixture, { method: 'POST', headers: { Accept: 'application/json' } });
		const form = fields(request);
		assert.equal(form.lang.value, language); assert.equal(request.qs.model, model);
		assert.ok(!('model' in form));
		assert.equal(form.channelMode.value, 'mono'); assert.equal(form.diarization.value, 'false');
		assert.equal(form.privacyMode.value, 'true'); assert.equal(form.externalAiConsent.value, 'true');
		assert.equal(form.audio.filename, encodeURIComponent('запись.wav'));
		assert.deepEqual(Buffer.from(form.audio.value, 'latin1'), audio);
		assert.equal(request.headers.Accept, 'application/json');
		assert.deepEqual(fixture.calls.map((entry) => entry.kind), ['binaryMetadata', 'binaryRead']);
	}
});

test('Large and summary require explicit consent before reading or uploading binary data', async () => {
	for (const parameters of [{ language: 'hy-AM' }, { summaryPreset: 'short' },
		{ summaryPreset: 'conversation', privacyMode: false }]) {
		const fixture = context({ binaryPropertyName: 'audio', ...parameters });
		await assert.rejects(prepareTranscription.call(fixture, {}), /External AI Processing/);
		assert.equal(fixture.calls.length, 0);
	}
});

test('summary fields are optional and sent with a declared detail only when requested', async () => {
	for (const summaryPreset of ['', 'short', 'conversation']) {
		const request = await prepareTranscription.call(context({ binaryPropertyName: 'audio',
			summaryPreset, externalAiConsent: true, privacyMode: false }), {});
		const form = fields(request);
		assert.equal(form.privacyMode.value, 'false');
		if (summaryPreset) { assert.equal(form.summarizationPreset.value, summaryPreset); assert.equal(form.summarizationDetail.value, 'standard'); }
		else assert.ok(!('summarizationPreset' in form));
	}
});

test('local Large model overrides do not require external AI consent', async () => {
	for (const modelOverride of ['SpeechExpert-STT-UZ-Large', 'Whisper-Large-v3-Turbo',
		'GigaAM-Multilingual-Large-CTC']) {
		const request = await prepareTranscription.call(context({ binaryPropertyName: 'audio',
			modelOverride, externalAiConsent: false }), {});
		const form = fields(request);
		assert.equal(request.qs.model, modelOverride);
		assert.equal(form.externalAiConsent.value, 'false');
	}
});

test('external and unknown model overrides require consent even when privacy mode is disabled', async () => {
	for (const modelOverride of ['ElevenLabs-Scribe-v2', 'gemini-3.5-transcribe',
		'gpt-transcribe', 'SpeechExpert-STT-Heavy', 'Future-Unclassified-Model']) {
		const fixture = context({ binaryPropertyName: 'audio', modelOverride,
			privacyMode: false, externalAiConsent: false });
		await assert.rejects(prepareTranscription.call(fixture, {}), /External AI Processing/);
		assert.equal(fixture.calls.length, 0);
	}
});

test('rejects unsupported transcription language or summary and empty audio', async () => {
	await assert.rejects(prepareTranscription.call(context({ language: 'fr-FR' }), {}), /seven supported/);
	await assert.rejects(prepareTranscription.call(context({ summaryPreset: 'invented' }), {}), /summary preset/);
	await assert.rejects(prepareTranscription.call(context({ binaryPropertyName: 'audio' }, {
		getBinaryDataBuffer: async () => Buffer.alloc(0),
	}), {}), /empty/);
});

test('multipart escapes hostile filenames and chooses a boundary absent from file content', async () => {
	const content = Buffer.from('audio n8nSpeechExpertMultipartBoundary with bytes');
	const fixture = context({ binaryPropertyName: 'audio' }, {
		assertBinaryData: () => ({ fileName: '../clip"\r\nInjected:yes.wav', mimeType: 'audio/wav\r\nInjected:yes' }),
		getBinaryDataBuffer: async () => content,
	});
	const request = await prepareTranscription.call(fixture, {});
	const form = fields(request);
	assert.ok(request.headers['Content-Type'].endsWith('Boundaryx'));
	assert.equal(form.audio.mimeType, 'application/octet-stream');
	assert.equal(form.audio.filename, 'clip%22%0D%0AInjected%3Ayes.wav');
	assert.deepEqual(Buffer.from(form.audio.value, 'latin1'), content);
});

test('synthesis preserves Unicode text and uses expected multipart fields', async () => {
	const request = await prepareSynthesis.call(context({ text: 'Проверка.\nИ вторая строка.', voice: 'pavel-higgs',
		language: 'ru-RU', engine: 'higgs', speed: 1.25, sampleRate: 8000 }), {});
	const form = fields(request);
	assert.equal(Buffer.from(form.text.value, 'latin1').toString('utf8'), 'Проверка.\nИ вторая строка.');
	assert.equal(form.voice.value, 'pavel-higgs'); assert.equal(form.synthesisEngine.value, 'higgs');
	assert.equal(form.format.value, 'wav'); assert.equal(form.speed.value, '1.25');
	assert.equal(form.sampleRateHertz.value, '8000'); assert.ok(!form.audio);
});

test('synthesis rejects invalid size, engine, speed and output format settings', async () => {
	const base = { text: 'Текст', voice: 'pavel-higgs', language: 'ru-RU' };
	for (const invalid of [{ text: '' }, { text: 'a'.repeat(40001) }, { engine: 'unknown' },
		{ speed: NaN }, { speed: 0 }, { speed: 4 }, { engine: 'eleven_v4', speed: 1.1 }, { sampleRate: 44100 }]) {
		await assert.rejects(prepareSynthesis.call(context({ ...base, ...invalid }), {}));
	}
	const request = await prepareSynthesis.call(context({ ...base, engine: 'eleven_v4', speed: 1 }), {});
	assert.equal(fields(request).synthesisEngine.value, 'eleven_v4');
});

test('download checks authenticated status before configuring binary response', async () => {
	const fixture = context({ operationId: 'id/with?reserved' });
	const request = await ensureSynthesisReady.call(fixture, { headers: { 'X-Test': 'retained' } });
	assert.equal(request.encoding, 'arraybuffer'); assert.equal(request.json, false);
	assert.equal(request.headers.Accept, 'audio/wav'); assert.equal(request.headers['X-Test'], 'retained');
	assert.equal(fixture.calls[0].credential, 'speechExpertApi');
	assert.ok(fixture.calls[0].request.url.endsWith('id%2Fwith%3Freserved'));
	assert.equal(fixture.calls[0].request.disableFollowRedirect, true);
});

test('download refuses pending, cancelled, failed or incomplete audio', async () => {
	for (const operation of [
		{ done: false, metadata: { status: 'running', result_available: false } },
		{ done: true, metadata: { status: 'cancelled', partial_available: true, result_available: false } },
		{ done: true, metadata: { status: 'failed', partial_available: true } },
		{ done: true, metadata: { status: 'completed', result_available: false } },
		{ done: true, error: { message: 'Provider failed' }, metadata: { status: 'completed', result_available: true } },
	]) {
		const request = { url: '/audio' };
		await assert.rejects(ensureSynthesisReady.call(context({ operationId: sourceA }, {
			httpRequestWithAuthentication: async () => operation,
		}), request));
		assert.equal(request.encoding, undefined);
	}
});

test('research source import sends UUID idempotency key and retained archive name', async () => {
	const request = await prepareResearchSource.call(context({ binaryPropertyName: 'audio',
		requestId: sourceA, sourceName: 'My recording', presetId: 'tts_ab_quality' }), {});
	const form = fields(request);
	assert.equal(form.requestId.value, sourceA); assert.equal(form.name.value, 'My recording');
	assert.equal(form.presetId.value, 'tts_ab_quality'); assert.deepEqual(Buffer.from(form.audio.value, 'latin1'), audio);
	await assert.rejects(prepareResearchSource.call(context({ requestId: 'execution-123' }), {}), /UUID/);
});

test('normal research has exact allowed fields and no A/B fields or client consent field', async () => {
	const fixture = context({ operation: 'preview', recordingId: sourceA, presetId: 'prosody_meaning',
		startSeconds: 2.345, endSeconds: 32.345, evidenceMode: 'stored', instructions: 'Review pauses',
		comparisonRecordingId: sourceB, pairId: 'stale hidden field', externalAiConsent: false });
	const request = await prepareResearch.call(fixture, {});
	assert.deepEqual(request.body, { recordingId: sourceA, presetId: 'prosody_meaning',
		startMs: 2345, endMs: 32345, evidenceMode: 'stored', instructions: 'Review pauses' });
	assert.equal(request.json, true); assert.equal(request.headers['Content-Type'], 'application/json');
});

test('A/B converts complete clip durations accurately and forces start zero/audio-only evidence', async () => {
	const request = await prepareResearch.call(context({ operation: 'preview', recordingId: sourceA,
		comparisonRecordingId: sourceB, presetId: 'tts_ab_quality', startSeconds: 99,
		endSeconds: 1.234, comparisonDurationSeconds: 2.345, evidenceMode: 'stored',
		pairId: 'pair-1', targetText: 'One phrase.', speechContext: 'English', instructions: '' }), {});
	assert.deepEqual(request.body, { recordingId: sourceA, comparisonRecordingId: sourceB,
		presetId: 'tts_ab_quality', startMs: 0, endMs: 1234, comparisonEndMs: 2345,
		evidenceMode: 'none', pairId: 'pair-1', targetText: 'One phrase.', speechContext: 'English', instructions: '' });
});

test('research rejects invalid intervals, UUIDs, same source pair and empty comparison target', async () => {
	const normal = { operation: 'preview', recordingId: sourceA, presetId: 'prosody_meaning' };
	for (const invalid of [{ recordingId: 'not-a-uuid' }, { startSeconds: -1 }, { endSeconds: NaN },
		{ endSeconds: 19.999 }, { endSeconds: 120.001 }, { instructions: 'x'.repeat(4001) }]) {
		await assert.rejects(prepareResearch.call(context({ ...normal, ...invalid }), {}));
	}
	const comparison = { ...normal, presetId: 'tts_ab_quality', comparisonRecordingId: sourceB,
		pairId: 'pair', targetText: 'Phrase', endSeconds: 10, comparisonDurationSeconds: 10 };
	for (const invalid of [{ comparisonRecordingId: sourceA }, { endSeconds: 0 },
		{ comparisonDurationSeconds: 120.001 }, { targetText: '' }, { pairId: '' }]) {
		await assert.rejects(prepareResearch.call(context({ ...comparison, ...invalid }), {}));
	}
});

test('paid research requires explicit consent and preserves a decimal credit cap', async () => {
	const base = { operation: 'analyze', recordingId: sourceA, presetId: 'prosody_meaning',
		startSeconds: 0, endSeconds: 30, externalAiConsent: true };
	for (const cap of ['0', '0.5000', '10.125']) {
		const request = await prepareResearch.call(context({ ...base, maxCredits: cap }), {});
		assert.equal(request.body.maxCredits, cap); assert.ok(!('externalAiConsent' in request.body));
	}
	await assert.rejects(prepareResearch.call(context({ ...base, externalAiConsent: false, maxCredits: '1' }), {}), /External AI/);
	for (const cap of ['', '-1', 'NaN', 'Infinity', '1e3', '0,5']) {
		await assert.rejects(prepareResearch.call(context({ ...base, maxCredits: cap }), {}), /Maximum Credits/);
	}
});

test('JSON response supports buffers, text, objects and list items with correct pairing', async () => {
	const record = { id: sourceA, done: true, response: { result: 'Текст', summarization: { summary: 'Резюме' } }, error: null };
	for (const body of [record, JSON.stringify(record), Buffer.from(JSON.stringify(record))]) {
		const [item] = await parseJsonResponse.call(context({ simplify: true }), [], { body });
		assert.equal(item.json.text, 'Текст'); assert.equal(item.json.summary, 'Резюме');
		assert.deepEqual(item.json.response, record.response); assert.deepEqual(item.pairedItem, { item: 3 });
	}
	const list = await parseJsonResponse.call(context({ simplify: false }), [], { body: [{ name: 'a' }, { name: 'b' }] });
	assert.deepEqual(list.map((item) => item.json.name), ['a', 'b']);
	assert.equal((await parseJsonResponse.call(context(), [], { body: [] })).length, 0);
});

test('simplified preview removes prompt/evidence but preserves billing and raw mode retains all', async () => {
	const body = { prompt: 'Prompt', evidence: { words: [] }, manifest: { durationMs: 30000 }, billing: { credits: '0.5000' } };
	for (const simplify of [true, false]) {
		const [item] = await parseJsonResponse.call(context({ resource: 'research', operation: 'preview', simplify }), [], { body });
		assert.equal('prompt' in item.json, !simplify); assert.equal('evidence' in item.json, !simplify);
		assert.deepEqual(item.json.billing, body.billing); assert.deepEqual(item.json.manifest, body.manifest);
	}
});

test('JSON response refuses malformed or scalar results instead of reporting success', async () => {
	for (const body of ['not json', 'null', 'true', '42', '["bad"]']) {
		await assert.rejects(parseJsonResponse.call(context(), [], { body }), /response/);
	}
});

test('binary WAV output uses n8n binary storage and safe output name for buffer/ArrayBuffer', async () => {
	for (const body of [audio, Uint8Array.from(audio).buffer]) {
		const fixture = context({ operationId: 'op/unsafe', binaryPropertyName: 'audio' });
		const [item] = await binaryAudioResponse.call(fixture, [], { body });
		assert.deepEqual(Buffer.from(item.binary.audio.data, 'base64'), audio);
		assert.equal(item.binary.audio.fileName, 'speech-op_unsafe.wav');
		assert.equal(item.binary.audio.mimeType, 'audio/wav');
		assert.equal(item.json.operationId, 'op/unsafe'); assert.deepEqual(item.pairedItem, { item: 3 });
		assert.equal(fixture.calls[0].kind, 'binaryWrite');
	}
});

test('binary output rejects JSON errors, string data and truncated non-WAV responses', async () => {
	for (const body of [Buffer.from('{"error":"failed"}'), Buffer.alloc(0), audio.toString('latin1'), Buffer.from('RIFFxxxxNOPE')]) {
		const fixture = context({ operationId: sourceA, binaryPropertyName: 'audio' });
		await assert.rejects(binaryAudioResponse.call(fixture, [], { body }), /valid WAV/);
		assert.equal(fixture.calls.length, 0);
	}
});
