import type { types, webApi } from '@slack/bolt';
import { encodeButtonValue } from './buttonValue';
import { resolveRecipient } from './recipients';
import type { MessageRequest } from './validation';

export type SendResult =
  | { recipient: string; ok: true; channel: string; ts: string }
  | { recipient: string; ok: false; error: string };

// Replaced in the message text with each recipient's Slack first name.
export const FIRST_NAME_PLACEHOLDER = '{firstName}';

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
          confirmation: response.confirmation,
        }),
        ...(response.style && { style: response.style }),
      })),
    },
  ];
}

// Sends to every recipient independently; a failure for one doesn't affect the others.
export async function sendMessage(client: webApi.WebClient, request: MessageRequest): Promise<SendResult[]> {
  return Promise.all(
    request.recipients.map(async (recipient): Promise<SendResult> => {
      try {
        const { channel, userId } = await resolveRecipient(client, recipient);
        const text = await personalize(client, request.text, userId);
        const blocks = buildMessageBlocks({ ...request, text });
        const { ts } = await client.chat.postMessage({ channel, text, blocks });
        return { recipient, ok: true, channel, ts: ts! };
      } catch (err) {
        const error = slackErrorCode(err);
        console.error(`Failed to send request ${request.requestId} to ${recipient}: ${error}`);
        return { recipient, ok: false, error };
      }
    }),
  );
}

async function personalize(client: webApi.WebClient, text: string, userId?: string): Promise<string> {
  if (!text.includes(FIRST_NAME_PLACEHOLDER)) return text;
  if (!userId) throw new Error(`${FIRST_NAME_PLACEHOLDER} can only be used for people, not channels`);

  const { user } = await client.users.info({ user: userId });
  const firstName = user?.profile?.first_name || user?.real_name?.split(' ')[0] || user?.name || '';
  return text.replaceAll(FIRST_NAME_PLACEHOLDER, escapeMrkdwn(firstName));
}

// Slack mrkdwn treats &, < and > as control characters.
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Slack API errors carry a short code like "users_not_found" in data.error.
function slackErrorCode(err: unknown): string {
  const data = (err as { data?: { error?: string } }).data;
  if (data?.error) return data.error;
  return err instanceof Error ? err.message : String(err);
}
