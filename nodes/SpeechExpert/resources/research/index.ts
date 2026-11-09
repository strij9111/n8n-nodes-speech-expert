import type { INodeProperties } from 'n8n-workflow';
import { parseJsonResponse, prepareResearch, prepareResearchSource } from '../../helpers';

const researchOperations = ['preview', 'analyze'];
const standardPresets = ['prosody_meaning', 'audience_peaks', 'tension_delivery'];

export const researchDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['research'] } },
		options: [
			{
				name: 'Analyze',
				value: 'analyze',
				action: 'Analyze audio',
				description: 'Run paid audio research or compare two complete speech clips',
				routing: {
					request: { method: 'POST', url: '/creator-research/analyze', timeout: 300000 },
					send: { preSend: [prepareResearch] },
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Get Presets',
				value: 'getPresets',
				action: 'Get research presets',
				description: 'Get available research presets, limits, and prices',
				routing: {
					request: { method: 'GET', url: '/creator-research/presets', timeout: 300000 },
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Get Results',
				value: 'getResults',
				action: 'Get research results',
				description: 'Get up to 50 saved research results for a recording',
				routing: {
					request: {
						method: 'GET',
						url: '=/creator-research/recordings/{{encodeURIComponent($parameter.recordingId)}}/results',
						timeout: 300000,
					},
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Preview',
				value: 'preview',
				action: 'Preview audio research',
				description: 'Validate a research request and estimate its cost without running analysis',
				routing: {
					request: { method: 'POST', url: '/creator-research/preview', timeout: 300000 },
					send: { preSend: [prepareResearch] },
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Upload Source',
				value: 'uploadSource',
				action: 'Upload research source',
				description:
					'Save an audio or video file for research without running transcription or analysis',
				routing: {
					request: { method: 'POST', url: '/creator-research/sources', timeout: 300000 },
					send: { preSend: [prepareResearchSource] },
					output: { postReceive: [parseJsonResponse] },
				},
			},
		],
		default: 'preview',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'audio',
		displayOptions: { show: { resource: ['research'], operation: ['uploadSource'] } },
		description:
			'The input binary field containing the audio or video file to save in your Speech Expert archive',
	},
	{
		displayName: 'Request ID',
		name: 'requestId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 7b3dbace-d336-44f3-adc6-aa9267399262',
		displayOptions: { show: { resource: ['research'], operation: ['uploadSource'] } },
		description:
			'A new UUID for each source upload. Reuse the same UUID only when retrying that upload to avoid duplicates. A workflow execution ID is not a UUID.',
	},
	{
		displayName: 'Source Name',
		name: 'sourceName',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['research'], operation: ['uploadSource'] } },
		description: 'Optional name for the saved source in your Speech Expert archive',
	},
	{
		displayName: 'Preset',
		name: 'presetId',
		type: 'options',
		required: true,
		options: [
			{
				name: 'Audience Reactions',
				value: 'audience_peaks',
				description: 'Review audible laughter, applause, and audience responses',
			},
			{
				name: 'Delivery Changes',
				value: 'tension_delivery',
				description: 'Review changes in pace, volume, and delivery',
			},
			{
				name: 'Prosody and Meaning',
				value: 'prosody_meaning',
				description: 'Review emphasis and possible interpretations of intonation',
			},
			{
				name: 'Speech Synthesis A/B Comparison',
				value: 'tts_ab_quality',
				description: 'Compare two complete clips of the same text using subjective model review',
			},
		],
		default: 'prosody_meaning',
		displayOptions: {
			show: { resource: ['research'], operation: ['uploadSource', ...researchOperations] },
		},
		description:
			'The research task. For A/B comparison, upload each clip separately with the comparison preset.',
	},
	{
		displayName: 'Recording ID',
		name: 'recordingId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['research'], operation: [...researchOperations, 'getResults'] },
		},
		description:
			'The saved recording UUID returned as ID by Upload Source. For A/B comparison, use variant A.',
	},
	{
		displayName: 'Start (Seconds)',
		name: 'startSeconds',
		type: 'number',
		typeOptions: { minValue: 0, numberPrecision: 3 },
		default: 0,
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: standardPresets },
		},
		description:
			'Start of the research fragment in seconds. Select a continuous fragment between 20 and 120 seconds long.',
	},
	{
		displayName: 'End (Seconds)',
		name: 'endSeconds',
		type: 'number',
		required: true,
		typeOptions: { minValue: 0.001, numberPrecision: 3 },
		default: 75,
		displayOptions: { show: { resource: ['research'], operation: researchOperations } },
		description:
			'End of the fragment in seconds. For A/B comparison, use the exact full duration of variant A: duration_ms from Upload Source divided by 1000.',
	},
	{
		displayName: 'Comparison Recording ID',
		name: 'comparisonRecordingId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: ['tts_ab_quality'] },
		},
		description:
			'The UUID of variant B, uploaded separately. It must differ from variant A, and each complete clip must be no longer than 120 seconds.',
	},
	{
		displayName: 'Comparison Duration (Seconds)',
		name: 'comparisonDurationSeconds',
		type: 'number',
		required: true,
		typeOptions: { minValue: 0.001, maxValue: 120, numberPrecision: 3 },
		default: 75,
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: ['tts_ab_quality'] },
		},
		description:
			'The exact full duration of variant B: duration_ms from its Upload Source response divided by 1000',
	},
	{
		displayName: 'Target Text',
		name: 'targetText',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: ['tts_ab_quality'] },
		},
		description: 'The text both variants should say, up to 4000 characters',
	},
	{
		displayName: 'Speech Context',
		name: 'speechContext',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: ['tts_ab_quality'] },
		},
		description: 'Optional language, dialect, or intended delivery, up to 1000 characters',
	},
	{
		displayName: 'Pair ID',
		name: 'pairId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. voiceComparison1',
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: ['tts_ab_quality'] },
		},
		description:
			'A label identifying this comparison, up to 256 characters. This does not make repeated analysis requests free.',
	},
	{
		displayName: 'Instructions',
		name: 'instructions',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: { resource: ['research'], operation: researchOperations } },
		description: 'Optional research question or instructions, up to 4000 characters',
	},
	{
		displayName: 'Evidence Mode',
		name: 'evidenceMode',
		type: 'options',
		options: [
			{
				name: 'Audio Only',
				value: 'none',
				description: 'Use the selected audio without stored transcripts or analyzer results',
			},
			{
				name: 'Include Stored Results',
				value: 'stored',
				description: 'Include available saved evidence for the selected fragment',
			},
		],
		default: 'none',
		displayOptions: {
			show: { resource: ['research'], operation: researchOperations, presetId: standardPresets },
		},
		description: 'Whether to include available stored evidence alongside the audio',
	},
	{
		displayName: 'Maximum Credits',
		name: 'maxCredits',
		type: 'string',
		required: true,
		default: '0',
		displayOptions: { show: { resource: ['research'], operation: ['analyze'] } },
		description:
			'The maximum amount to charge. Run Preview first and use billing.credits from that response, or set your own non-negative decimal limit. Zero prevents a paid analysis.',
	},
	{
		displayName: 'Allow External AI Processing',
		name: 'externalAiConsent',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['research'], operation: ['analyze'] } },
		description:
			'Whether to allow the selected audio, instructions, and included evidence to be sent to the external AI provider used by Speech Expert for this paid analysis',
	},
];
