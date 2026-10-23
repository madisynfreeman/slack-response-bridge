import 'dotenv/config';

export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  apiKey: string;
  callbackUrl?: string;
  callbackSecret: string;
  port: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(): Config {
  return {
    slackBotToken: required('SLACK_BOT_TOKEN'),
    slackAppToken: required('SLACK_APP_TOKEN'),
    apiKey: required('API_KEY'),
    callbackUrl: process.env.CALLBACK_URL || undefined,
    callbackSecret: required('CALLBACK_SECRET'),
    port: Number(process.env.PORT) || 3000,
  };
}
