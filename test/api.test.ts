import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { webApi } from '@slack/bolt';
import { createApiServer } from '../src/api';

// Just enough of the Slack client to send to a channel ID.
const posted: Array<{ channel: string }> = [];
const client = {
  chat: {
    postMessage: async (args: { channel: string }) => {
      posted.push(args);
      return { ts: '123.456' };
    },
  },
} as unknown as webApi.WebClient;

const validBody = {
  requestId: 'req-1',
  text: 'Approve?',
  recipients: ['C456DEF'],
  responses: [{ label: 'Approve', value: 'approve' }],
  callbackUrl: 'https://example.com/cb',
};

describe('API server', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createApiServer({ client, apiKey: 'secret' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  after(() => server.close());

  const post = (body: string, apiKey?: string) =>
    fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey && { 'x-api-key': apiKey }) },
      body,
    });

  it('serves /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it('rejects a missing or wrong API key', async () => {
    assert.equal((await post(JSON.stringify(validBody))).status, 401);
    assert.equal((await post(JSON.stringify(validBody), 'wrong')).status, 401);
  });

  it('returns 400 JSON for malformed JSON', async () => {
    const res = await post('{oops', 'secret');
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  });

  it('returns 400 with the validation error', async () => {
    const res = await post(JSON.stringify({ ...validBody, recipients: [] }), 'secret');
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'recipients must be a non-empty array' });
  });

  it('sends a valid request and returns per-recipient results', async () => {
    const res = await post(JSON.stringify(validBody), 'secret');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      requestId: 'req-1',
      results: [{ recipient: 'C456DEF', ok: true, channel: 'C456DEF', ts: '123.456' }],
    });
    assert.equal(posted.at(-1)?.channel, 'C456DEF');
  });
});
