import type { types, webApi } from '@slack/bolt';
import { encodeButtonValue } from './buttonValue';
import { resolveChannel } from './recipients';
import type { MessageRequest } from './validation';

export type SendResult =
  | { recipient: string; ok: true; channel: string; ts: string }
  | { recipient: string; ok: false; error: string };

// Button action IDs are `response_<index>`; the click handler matches on this prefix.
export const RESPONSE_ACTION_PREFIX = 'response_';

export function buildMessageBlocks(request: MessageRequest): types.KnownBlock[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: request.text } },
    {
      type: 'actions',
      elements: request.responses.map((response, i) => ({
        type: 'button',
        action_id: `${RESPONSE_ACTION_PREFIX}${i}`,
        text: { type: 'plain_text', text: response.label },
        value: encodeButtonValue({
          requestId: request.requestId,
          value: response.value,
          callbackUrl: request.callbackUrl,
        }),
        ...(response.style && { style: response.style }),
      })),
    },
  ];
}

// Sends to every recipient independently; a failure for one doesn't affect the others.
export async function sendMessage(client: webApi.WebClient, request: MessageRequest): Promise<SendResult[]> {
  const blocks = buildMessageBlocks(request);

  return Promise.all(
    request.recipients.map(async (recipient): Promise<SendResult> => {
      try {
        const channel = await resolveChannel(client, recipient);
        const { ts } = await client.chat.postMessage({ channel, text: request.text, blocks });
        return { recipient, ok: true, channel, ts: ts! };
      } catch (err) {
        const error = slackErrorCode(err);
        console.error(`Failed to send request ${request.requestId} to ${recipient}: ${error}`);
        return { recipient, ok: false, error };
      }
    }),
  );
}

// Slack API errors carry a short code like "users_not_found" in data.error.
function slackErrorCode(err: unknown): string {
  const data = (err as { data?: { error?: string } }).data;
  if (data?.error) return data.error;
  return err instanceof Error ? err.message : String(err);
}
