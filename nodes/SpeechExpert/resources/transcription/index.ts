import type { INodeProperties } from 'n8n-workflow';
import { parseJsonResponse, prepareTranscription } from '../../helpers';

const showCreate = { resource: ['transcription'], operation: ['create'] };

export const transcriptionDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['transcription'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a transcription',
				description: 'Upload audio or video and start background transcription',
				routing: {
					request: { method: 'POST', url: '/stt/v1:recognizeAsync' },
					send: { preSend: [prepareTranscription] },
					output: { postReceive: [parseJsonResponse] },
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a transcription',
				description: 'Get operation status and the completed transcript',
				routing: {
					request: {
						method: 'GET',
						url: "={{ '/operations/' + encodeURIComponent($parameter.operationId) }}",
					},
					output: { postReceive: [parseJsonResponse] },
				},
			},
		],
		default: 'create',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'audio',
		displayOptions: { show: showCreate },
		description: 'The input binary field containing the audio or video file',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'options',
		required: true,
		default: 'ru-RU',
		displayOptions: { show: showCreate },
		options: [
			{ name: 'Armenian', value: 'hy-AM' },
			{ name: 'English', value: 'en-US' },
			{ name: 'Kazakh', value: 'kk-KZ' },
			{ name: 'Kyrgyz', value: 'ky-KG' },
			{ name: 'Russian', value: 'ru-RU' },
			{ name: 'Tajik', value: 'tg-TJ' },
			{ name: 'Uzbek', value: 'uz-UZ' },
		],
		description: 'The spoken language; a compatible model is selected automatically',
	},
	{
		displayName: 'Model Override',
		name: 'modelOverride',
		type: 'string',
		default: '',
		displayOptions: { show: showCreate },
		description:
			'An optional Speech Expert API model identifier compatible with the selected language. Leave empty to use the default model for that language.',
	},
	{
		displayName: 'Summary',
		name: 'summaryPreset',
		type: 'options',
		default: '',
		displayOptions: { show: showCreate },
		options: [
			{ name: 'None', value: '' },
			{ name: 'Short', value: 'short' },
			{ name: 'Conversation', value: 'conversation' },
		],
		description:
			'Optional summary of the transcript, billed separately and processed by external AI',
	},
	{
		displayName: 'Privacy Mode',
		name: 'privacyMode',
		type: 'boolean',
		default: true,
		displayOptions: { show: showCreate },
		description:
			'Whether to use temporary processing without adding a saved recording. Retrieve the completed transcript promptly because private operation results expire.',
	},
	{
		displayName: 'Allow External AI Processing',
		name: 'externalAiConsent',
		type: 'boolean',
		default: false,
		displayOptions: { show: showCreate },
		description:
			'Whether to allow audio or transcript processing by external AI providers. Required for summaries and the default Armenian, Kazakh, Kyrgyz, and Tajik Large models.',
	},
	{
		displayName:
			'Creating a transcription uses Speech Expert credits. Use Get with the returned operation ID to check progress; repeating Create starts another paid operation.',
		name: 'transcriptionNotice',
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
		displayOptions: { show: { resource: ['transcription'], operation: ['get'] } },
		description: 'The operation ID returned when the transcription was created',
	},
];
