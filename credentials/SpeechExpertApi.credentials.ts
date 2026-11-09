import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class SpeechExpertApi implements ICredentialType {
	name = 'speechExpertApi';

	displayName = 'Speech Expert API';

	icon: Icon = {
		light: 'file:../nodes/SpeechExpert/speechExpert.svg',
		dark: 'file:../nodes/SpeechExpert/speechExpert.dark.svg',
	};

	documentationUrl = 'https://github.com/strij9111/n8n-nodes-speech-expert#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Api-Key {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://speech-expert.ru/api',
			url: '/creator-research/presets',
			method: 'GET',
		},
	};
}
