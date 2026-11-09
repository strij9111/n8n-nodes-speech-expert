// Run only inside an isolated Docker container, with /package and /proof mounted.
// Only a copy of dist is redirected to the local mock. Production API calls are impossible.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const output = '/proof';
const custom = '/tmp/speech-expert-custom';
const sourceA = '11111111-1111-4111-8111-111111111111';
const sourceB = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const requests = [];
const cases = [];
let activeCase = '';
let scenario = 'success';

fs.mkdirSync(output, { recursive: true });
fs.mkdirSync('/tmp/runtime-data', { recursive: true });
fs.cpSync('/package/dist', custom, { recursive: true });
fs.symlinkSync('/usr/local/lib/node_modules/n8n/node_modules', `${custom}/node_modules`);
function redirectTestCopy(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) redirectTestCopy(filename);
		else if (entry.name.endsWith('.js')) {
			fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replaceAll(
				'https://speech-expert.ru/api', 'http://127.0.0.1:18787/api',
			));
		}
	}
}
redirectTestCopy(custom);

const wav = Buffer.alloc(76);
wav.write('RIFF', 0); wav.writeUInt32LE(68, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(32, 40);
fs.writeFileSync('/tmp/runtime-data/fixture.wav', wav);

function jsonResponse(response, body, status = 200) {
	response.writeHead(status, { 'Content-Type': 'application/json' });
	response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	const body = Buffer.concat(chunks);
	const record = { case: activeCase, method: request.method, url: request.url,
		contentType: request.headers['content-type'], bytes: body.length,
		authorized: request.headers.authorization === 'Api-Key local-test-key' };
	requests.push(record);
	if (!record.authorized) return jsonResponse(response, { detail: 'Invalid credential' }, 401);
	if (request.method === 'POST') {
		if (record.contentType?.startsWith('multipart/form-data')) {
			const bodyText = body.toString('latin1');
			record.fields = [...bodyText.matchAll(/name="([^\"]+)"\r\n\r\n([^\r]*)/g)]
				.reduce((result, match) => ({ ...result, [match[1]]: match[2] }), {});
			record.hasAudio = body.includes(wav);
		} else {
			try { record.json = JSON.parse(body.toString()); }
			catch { return jsonResponse(response, { detail: 'Expected JSON' }, 400); }
		}
	}
	if (request.url === '/api/creator-research/presets') {
		return jsonResponse(response, { presets: [{ id: 'prosody_meaning', title: 'Prosody' }],
			limits: { minDurationMs: 20000, maxDurationMs: 120000 }, pricing: { creditsPerMinute: '1.0000' } });
	}
	if (request.url === '/api/tts/v1/voices') {
		return jsonResponse(response, [{ name: 'pavel-higgs', label: 'Pavel', language: 'ru-RU',
			provider: 'higgs', synthesis_engines: ['higgs', 'eleven_v4'] }]);
	}
	if (request.method === 'POST' && request.url.startsWith('/api/stt/v1:recognizeAsync')) {
		assert.equal(record.hasAudio, true, 'Transcription multipart must preserve audio bytes');
		assert.equal(record.fields.lang, 'ru-RU');
		assert.equal(new URL(request.url, 'http://localhost').searchParams.get('model'), 'SpeechExpert-STT-RU');
		return jsonResponse(response, { id: operationId, done: false, response: null, error: null });
	}
	if (request.method === 'GET' && request.url === `/api/operations/${operationId}`) {
		if (scenario === 'pendingOnce' && requests.filter((entry) => entry.case === activeCase && entry.url === request.url).length === 1) {
			return jsonResponse(response, { id: operationId, done: false, response: null, error: null });
		}
		return jsonResponse(response, { id: operationId, done: true,
			response: { result: 'Проверка нативного узла n8n.', summarization_status: null }, error: null });
	}
	if (request.method === 'POST' && request.url === '/api/tts/v1/operations') {
		assert.equal(record.fields.voice, 'pavel-higgs');
		assert.equal(record.fields.synthesisEngine, 'higgs');
		return jsonResponse(response, { id: operationId, done: false,
			metadata: { status: 'queued', result_available: false }, error: null });
	}
	if (request.method === 'GET' && request.url === `/api/tts/v1/operations/${operationId}`) {
		if (scenario === 'pendingOnce' && requests.filter((entry) => entry.case === activeCase && entry.url === request.url).length === 1) {
			return jsonResponse(response, { id: operationId, done: false,
				metadata: { status: 'running', result_available: false }, error: null });
		}
		return jsonResponse(response, { id: operationId, done: scenario !== 'pending',
			metadata: { status: scenario === 'partial' ? 'cancelled' : 'completed',
				result_available: scenario !== 'partial', partial_available: scenario === 'partial' }, error: null });
	}
	if (request.url === `/api/tts/v1/operations/${operationId}/audio`) {
		response.writeHead(200, { 'Content-Type': 'audio/wav' });
		response.end(wav); return;
	}
	if (request.url === '/api/creator-research/sources') {
		assert.equal(record.hasAudio, true, 'Research upload must preserve audio bytes');
		assert.equal(record.fields.requestId, sourceA);
		return jsonResponse(response, { id: sourceA, duration_ms: 30000, status: 'saved',
			audio_retention: 'keep', media_available: true }, 201);
	}
	if (request.url === '/api/creator-research/preview') {
		assert.equal(record.json.recordingId, sourceA);
		return jsonResponse(response, { billing: { credits: '0.5000', billingEnabled: true }, manifest: {} });
	}
	if (request.url === '/api/creator-research/analyze') {
		assert.equal(record.json.recordingId, sourceA);
		assert.equal(record.json.maxCredits, '0.5000');
		assert.ok(!('externalAiConsent' in record.json), 'Client consent is not a ResearchRequest field');
		return jsonResponse(response, { resultId: operationId, versionId: sourceB, recordingId: sourceA,
			status: 'ready', payload: { description: 'Mock audio analysis', findings: [], limitations: [] },
			billing: { credits_charged: '0.5000' } });
	}
	if (request.url === `/api/creator-research/recordings/${sourceA}/results`) {
		return jsonResponse(response, [{ resultId: operationId, recordingId: sourceA,
			status: 'ready', payload: { description: 'Saved analysis' } }]);
	}
	jsonResponse(response, { detail: `Unexpected route: ${request.url}` }, 404);
});

const environment = {
	...process.env,
	N8N_CUSTOM_EXTENSIONS: custom,
	N8N_USER_FOLDER: '/tmp/n8n-runtime',
	N8N_ENCRYPTION_KEY: 'isolated-runtime-test-only-key',
	N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
	N8N_TEMPLATES_ENABLED: 'false', N8N_PERSONALIZATION_ENABLED: 'false',
	N8N_RUNNERS_ENABLED: 'false', N8N_LOG_LEVEL: 'info',
	N8N_RESTRICT_FILE_ACCESS_TO: '/tmp/runtime-data',
	NODE_PATH: '/usr/local/lib/node_modules/n8n/node_modules',
};

function cli(args) {
	return new Promise((resolve, reject) => {
		const child = spawn('n8n', args, { env: environment });
		let stdout = '', stderr = '';
		child.stdout.on('data', (chunk) => { stdout += chunk; });
		child.stderr.on('data', (chunk) => { stderr += chunk; });
		const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`n8n timeout: ${args}`)); }, 90000);
		child.on('error', reject);
		child.on('close', (code) => { clearTimeout(deadline); resolve({ code, stdout, stderr }); });
	});
}

function workflow(name, operations, binary = false) {
	const nodes = [{ id: 'trigger', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
		position: [0, 0], parameters: {} }];
	if (binary) nodes.push({ id: 'file', name: 'Read fixture', type: 'n8n-nodes-base.readWriteFile',
		typeVersion: 1, position: [200, 0], parameters: { operation: 'read',
			fileSelector: '/tmp/runtime-data/fixture.wav', options: { dataPropertyName: 'audio' } } });
	operations.forEach((parameters, index) => nodes.push({ id: `speech-${index}`, name: `Speech ${index}`,
		type: 'CUSTOM.speechExpert', typeVersion: 1, position: [(index + 2) * 200, 0],
		parameters: { simplify: false, ...parameters },
		credentials: { speechExpertApi: { id: 'speech-test-credential', name: 'Speech Expert Local Mock' } } }));
	const connections = {};
	for (let index = 0; index < nodes.length - 1; index++) {
		connections[nodes[index].name] = { main: [[{ node: nodes[index + 1].name, type: 'main', index: 0 }]] };
	}
	return { id: name, name, active: false, nodes, connections, settings: { executionOrder: 'v1' } };
}

function executionJson(stdout) {
	for (let index = stdout.indexOf('{'); index !== -1; index = stdout.indexOf('{', index + 1)) {
		try { const value = JSON.parse(stdout.slice(index, stdout.lastIndexOf('}') + 1)); if (value.data?.resultData) return value; }
		catch { /* Startup messages can precede the JSON execution result. */ }
	}
	throw new Error(`No execution result JSON: ${stdout.slice(-1500)}`);
}

async function runCase(name, operations, { binary = false, error = false, mode = 'success', verify, example } = {}) {
	if (process.env.CASE_FILTER && !process.env.CASE_FILTER.split(',').includes(name)) return;
	activeCase = name; scenario = mode;
	const before = requests.length;
	const definition = example || workflow(name, operations, binary);
	const filename = `/tmp/runtime-data/${name}.json`;
	fs.writeFileSync(filename, JSON.stringify([definition]));
	const imported = await cli(['import:workflow', `--input=${filename}`]);
	assert.equal(imported.code, 0, imported.stdout + imported.stderr);
	const executed = await cli(['execute', `--id=${name}`, '--rawOutput']);
	fs.writeFileSync(`${output}/${name}.stdout.txt`, executed.stdout);
	fs.writeFileSync(`${output}/${name}.stderr.txt`, executed.stderr);
	let result;
	try { result = executionJson(executed.stdout); }
	catch (cause) {
		if (!error) throw cause;
		assert.match(executed.stdout + executed.stderr, /error|failed|consent|completed|pending/i);
	}
	if (result) {
		fs.writeFileSync(`${output}/${name}.execution.json`, JSON.stringify(result, null, 2));
		assert.equal(Boolean(result.data.resultData.error), error, JSON.stringify(result.data.resultData.error));
	}
	const sent = requests.slice(before);
	if (verify) verify(sent, result);
	cases.push({ name, expectedError: error, passed: true, requests: sent.length });
	console.log(`PASS ${name} (${sent.length} requests)`);
}

function exampleWorkflow(filename, name) {
	const definition = JSON.parse(fs.readFileSync(`/package/examples/${filename}`, 'utf8'));
	definition.id = name;
	definition.name += ' [isolated runtime check]';
	for (const node of definition.nodes) {
		if (node.type === 'n8n-nodes-speech-expert.speechExpert') {
			node.type = 'CUSTOM.speechExpert';
			node.credentials = { speechExpertApi: { id: 'speech-test-credential', name: 'Speech Expert Local Mock' } };
		}
	}
	const form = definition.nodes.find((node) => node.type === 'n8n-nodes-base.formTrigger');
	if (form) {
		form.type = 'n8n-nodes-base.manualTrigger';
		form.typeVersion = 1;
		form.parameters = {};
		delete form.webhookId;
		definition.nodes.push({ id: 'runtime-file', name: 'Read runtime fixture',
			type: 'n8n-nodes-base.readWriteFile', typeVersion: 1, position: [-300, 0],
			parameters: { operation: 'read', fileSelector: '/tmp/runtime-data/fixture.wav',
				options: { dataPropertyName: 'audio' } } });
		definition.nodes.push({ id: 'runtime-fields', name: 'Runtime form fields',
			type: 'n8n-nodes-base.code', typeVersion: 2, position: [-100, 0],
			parameters: { jsCode: `return $input.all().map(item => ({json:{...item.json,requestId:'${sourceA}'},binary:item.binary}));` } });
		definition.connections['Runtime form fields'] = definition.connections[form.name];
		definition.connections[form.name] = { main: [[{ node: 'Read runtime fixture', type: 'main', index: 0 }]] };
		definition.connections['Read runtime fixture'] = { main: [[{ node: 'Runtime form fields', type: 'main', index: 0 }]] };
	}
	return definition;
}

async function main() {
	await new Promise((resolve) => server.listen(18787, '127.0.0.1', resolve));
	const credentials = [{ id: 'speech-test-credential', name: 'Speech Expert Local Mock',
		type: 'speechExpertApi', data: { apiKey: 'local-test-key' } }];
	fs.writeFileSync('/tmp/runtime-data/credentials.json', JSON.stringify(credentials));
	const imported = await cli(['import:credentials', '--input=/tmp/runtime-data/credentials.json']);
	assert.equal(imported.code, 0, imported.stdout + imported.stderr);
	await runCase('nativeVoices', [{ resource: 'synthesis', operation: 'getVoices' }], {
		verify: (sent) => assert.equal(sent.length, 1),
	});
	await runCase('nativeTranscription', [{ resource: 'transcription', operation: 'create',
		binaryPropertyName: 'audio', language: 'ru-RU', modelOverride: '', summaryPreset: '',
		privacyMode: true, externalAiConsent: false },
		{ resource: 'transcription', operation: 'get', operationId: '={{$json.id}}' }], { binary: true,
		verify: (sent) => assert.equal(sent.length, 2) });
	await runCase('nativeSynthesis', [{ resource: 'synthesis', operation: 'create', text: 'Проверка речи.',
		voice: 'pavel-higgs', engine: 'higgs', language: 'ru-RU', speed: 1, sampleRate: 48000 },
		{ resource: 'synthesis', operation: 'download', operationId: '={{$json.id}}', binaryPropertyName: 'audio' }], {
		verify: (sent, result) => {
			assert.equal(sent.length, 3);
			const item = result.data.resultData.runData['Speech 1'][0].data.main[0][0];
			assert.equal(item.binary.audio.mimeType, 'audio/wav');
		},
	});
	await runCase('rejectPartialWav', [{ resource: 'synthesis', operation: 'download', operationId,
		binaryPropertyName: 'audio' }], { error: true, mode: 'partial',
		verify: (sent) => { assert.equal(sent.length, 1); assert.ok(!sent[0].url.endsWith('/audio')); } });
	await runCase('rejectLargeWithoutConsent', [{ resource: 'transcription', operation: 'create',
		binaryPropertyName: 'audio', language: 'hy-AM', modelOverride: '', summaryPreset: '',
		privacyMode: true, externalAiConsent: false }], { binary: true, error: true,
		verify: (sent) => assert.equal(sent.length, 0) });
	await runCase('nativeResearch', [{ resource: 'research', operation: 'uploadSource', binaryPropertyName: 'audio',
		requestId: sourceA, sourceName: 'Runtime fixture', presetId: 'prosody_meaning' },
		{ resource: 'research', operation: 'preview', recordingId: '={{$json.id}}', presetId: 'prosody_meaning',
			startSeconds: 0, endSeconds: 30, evidenceMode: 'none', instructions: '' },
		{ resource: 'research', operation: 'analyze', recordingId: sourceA, presetId: 'prosody_meaning',
			startSeconds: 0, endSeconds: 30, evidenceMode: 'none', instructions: '',
			maxCredits: '={{$json.billing.credits}}', externalAiConsent: true }], { binary: true,
		verify: (sent) => assert.equal(sent.length, 3) });
	await runCase('nativeComparison', [{ resource: 'research', operation: 'preview', recordingId: sourceA,
		comparisonRecordingId: sourceB, presetId: 'tts_ab_quality', endSeconds: 1.234,
		comparisonDurationSeconds: 2.345, pairId: 'runtime-pair', targetText: 'Один текст.',
		speechContext: 'ru-RU', instructions: '' }], {
		verify: (sent) => {
			assert.equal(sent.length, 1);
			assert.equal(sent[0].json.startMs, 0);
			assert.equal(sent[0].json.endMs, 1234);
			assert.equal(sent[0].json.comparisonEndMs, 2345);
		},
	});
	await runCase('rejectResearchWithoutConsent', [{ resource: 'research', operation: 'analyze',
		recordingId: sourceA, presetId: 'prosody_meaning', startSeconds: 0, endSeconds: 30,
		evidenceMode: 'none', instructions: '', maxCredits: '0.5000', externalAiConsent: false }], {
		error: true, verify: (sent) => assert.equal(sent.length, 0),
	});
	await runCase('exampleTranscription', [], {
		example: exampleWorkflow('transcribe-audio.json', 'exampleTranscription'), mode: 'pendingOnce',
		verify: (sent, result) => {
			assert.equal(sent.length, 3);
			assert.equal(sent.filter((entry) => entry.method === 'POST').length, 1);
			assert.equal(result.data.resultData.runData['Wait 5 seconds'].length, 2);
			assert.equal(result.data.resultData.runData.Transcript[0].data.main[0][0].json.text, 'Проверка нативного узла n8n.');
		},
	});
	await runCase('exampleSynthesis', [], {
		example: exampleWorkflow('synthesize-speech.json', 'exampleSynthesis'), mode: 'pendingOnce',
		verify: (sent, result) => {
			assert.equal(sent.length, 5);
			assert.equal(sent.filter((entry) => entry.method === 'POST').length, 1);
			assert.equal(result.data.resultData.runData['Wait 5 seconds'].length, 2);
			assert.equal(result.data.resultData.runData['Download audio'][0].data.main[0][0].binary.audio.mimeType, 'audio/wav');
		},
	});
	await runCase('exampleResearch', [], {
		example: exampleWorkflow('research-audio.json', 'exampleResearch'),
		verify: (sent, result) => {
			assert.equal(sent.length, 2);
			assert.equal(sent.filter((entry) => entry.url.endsWith('/analyze')).length, 0);
			assert.equal(result.data.resultData.runData['Preview research'][0].data.main[0][0].json.billing.credits, '0.5000');
			assert.equal(result.data.resultData.runData['Analyze after review'], undefined);
		},
	});
}

main().then(() => {
	fs.writeFileSync(`${output}/runtime-report.json`, JSON.stringify({
		n8nVersion: '2.46.6', network: 'Docker --network none; loopback mock only',
		compiledCopyChanges: ['API origin redirected to loopback mock'],
		exampleCopyChanges: ['Native type prefix CUSTOM and test credential binding',
			'Form triggers replaced by manual trigger plus fixture file/form fields; downstream logic unchanged'],
		cases, requests,
	}, null, 2));
}).catch((error) => {
	console.error(error);
	fs.writeFileSync(`${output}/runtime-failure.json`, JSON.stringify({ error: error.stack, cases, requests }, null, 2));
	process.exitCode = 1;
}).finally(() => server.close());
