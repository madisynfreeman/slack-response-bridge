import { createHmac } from 'node:crypto';

export interface CallbackPayload {
  requestId: string;
  response: { value: string; label: string };
  user: { id: string; name?: string; email?: string };
  channel: string;
  messageTs: string;
  respondedAt: string;
}

export const CALLBACK_TIMEOUT_MS = 10_000;

// sha256=<hex HMAC-SHA256 of "timestamp.body">, so the receiver can check both the body and its freshness.
export function signCallback(body: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

// Throws on network errors, timeouts and non-2xx responses.
export async function postCallback(
  url: string,
  payload: CallbackPayload,
  secret: string,
  timeoutMs = CALLBACK_TIMEOUT_MS,
): Promise<void> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-timestamp': timestamp,
      'x-signature': signCallback(body, timestamp, secret),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`Callback to ${url} returned HTTP ${res.status}`);
}
