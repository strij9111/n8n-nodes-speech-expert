import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { transcriptionDescription } from './resources/transcription';
import { synthesisDescription } from './resources/synthesis';
import { researchDescription } from './resources/research';

export class SpeechExpert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Speech Expert',
		name: 'speechExpert',
		icon: { light: 'file:speechExpert.svg', dark: 'file:speechExpert.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Transcribe, synthesize, and research audio with Speech Expert',
		defaults: {
			name: 'Speech Expert',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'speechExpertApi', required: true }],
		requestDefaults: {
			baseURL: 'https://speech-expert.ru/api',
			json: false,
			timeout: 300000,
			headers: {
				Accept: 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Audio Research',
						value: 'research',
					},
					{
						name: 'Speech Synthesis',
						value: 'synthesis',
					},
					{ name: 'Transcription', value: 'transcription' },
				],
				default: 'transcription',
			},
			...transcriptionDescription,
			...synthesisDescription,
			...researchDescription,
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				displayOptions: { hide: { operation: ['download'] } },
				description:
					'Whether to return a simplified version of the response instead of the raw data',
			},
		],
	};
}
