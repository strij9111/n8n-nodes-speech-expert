import type { INodeProperties } from 'n8n-workflow';
import {
	binaryAudioResponse,
	ensureSynthesisReady,
	parseJsonResponse,
	prepareSynthesis,
} from '../../helpers';

const showCreate = { resource: ['synthesis'], operation: ['create'] };

export const synthesisDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['synthesis'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create speech synthesis',
				description: 'Start background speech synthesis from text',
				routing: {
					request: { method: 'POST', url: '/tts/v1/operations' },
					send: { preSend: [prepareSynthesis] },
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Download',
				value: 'download',
				action: 'Download synthesized speech',
				description: 'Download the complete WAV file from a successful synthesis operation',
				routing: {
					request: {
						method: 'GET',
						url: "={{ '/tts/v1/operations/' + encodeURIComponent($parameter.operationId) + '/audio' }}",
					},
					send: { preSend: [ensureSynthesisReady] },
					output: { postReceive: [binaryAudioResponse] },
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a synthesis operation',
				description: 'Get the progress and result availability of a synthesis operation',
				routing: {
					request: {
						method: 'GET',
						url: "={{ '/tts/v1/operations/' + encodeURIComponent($parameter.operationId) }}",
					},
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Get Voices',
				value: 'getVoices',
				action: 'Get available voices',
				description: 'Get the current voice catalog and supported synthesis engines',
				routing: {
					request: { method: 'GET', url: '/tts/v1/voices' },
					output: { postReceive: [parseJsonResponse] },
				},
			},
		],
		default: 'create',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 5 },
		required: true,
		default: '',
		displayOptions: { show: showCreate },
		description: 'The text to synthesize, between 1 and 40,000 characters',
	},
	{
		displayName: 'Voice',
		name: 'voice',
		type: 'string',
		required: true,
		default: 'pavel-higgs',
		displayOptions: { show: showCreate },
		description:
			"The exact voice name returned by Get Voices. The selected engine must be listed in that voice's synthesis_engines.",
	},
	{
		displayName: 'Engine',
		name: 'engine',
		type: 'options',
		default: 'higgs',
		displayOptions: { show: showCreate },
		options: [
			{ name: 'Higgs', value: 'higgs' },
			{ name: 'ElevenLabs V4', value: 'eleven_v4' },
		],
		description: 'The synthesis engine supported by the selected voice',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'string',
		required: true,
		default: 'ru-RU',
		displayOptions: { show: showCreate },
		description: 'The BCP-47 language code supported by the selected voice and engine',
	},
	{
		displayName: 'Speed',
		name: 'speed',
		type: 'number',
		typeOptions: { minValue: 0.1, maxValue: 3, numberPrecision: 2 },
		default: 1,
		displayOptions: { show: showCreate },
		description: 'The speaking speed multiplier. ElevenLabs v4 supports only 1.',
	},
	{
		displayName: 'Sample Rate',
		name: 'sampleRate',
		type: 'options',
		default: 48000,
		displayOptions: { show: showCreate },
		options: [
			{ name: '8 kHz', value: 8000 },
			{ name: '48 kHz', value: 48000 },
		],
		description: 'The output WAV sample rate. Audio is PCM16 mono.',
	},
	{
		displayName:
			'Creating speech uses Speech Expert credits. Use Get with the returned operation ID, then Download after successful completion. Repeating Create starts another paid operation.',
		name: 'synthesisNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showCreate },
	},
	{
		displayName: 'Operation ID',
		name: 'operationId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['synthesis'], operation: ['get', 'download'] } },
		description: 'The operation ID returned when speech synthesis was created',
	},
	{
		displayName: 'Output Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'audio',
		displayOptions: { show: { resource: ['synthesis'], operation: ['download'] } },
		description: 'The output binary field that will contain the completed WAV file',
	},
];
