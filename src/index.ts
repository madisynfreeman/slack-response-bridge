import { App } from '@slack/bolt';
import { createApiServer } from './api';
import { loadConfig } from './config';

const config = loadConfig();

// Socket Mode: Slack events and button clicks arrive over a WebSocket, so no public URL is needed.
const app = new App({ token: config.slackBotToken, appToken: config.slackAppToken, socketMode: true });

const server = createApiServer({
  client: app.client,
  apiKey: config.apiKey,
  defaultCallbackUrl: config.callbackUrl,
});

async function main() {
  await app.start();
  server.listen(config.port, () => console.log(`Connected to Slack; API listening on port ${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
