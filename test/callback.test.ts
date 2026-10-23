import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { postCallback, signCallback, type CallbackPayload } from '../src/callback';

const secret = 'test-secret';

const payload: CallbackPayload = {
  requestId: 'req-1',
  response: { value: 'approve', label: 'Approve' },
  user: { id: 'U123ABC', name: 'Jane', email: 'jane@example.com' },
  channel: 'D123',
  messageTs: '1.2',
  respondedAt: '2026-10-23T00:00:00.000Z',
};

describe('signCallback', () => {
  it('is sha256= plus the hex HMAC of "timestamp.body"', () => {
    const expected = createHmac('sha256', secret).update('1700000000.{"a":1}').digest('hex');
    assert.equal(signCallback('{"a":1}', '1700000000', secret), `sha256=${expected}`);
  });

  it('changes when the body, timestamp or secret changes', () => {
    const base = signCallback('{"a":1}', '1700000000', secret);
    assert.notEqual(signCallback('{"a":2}', '1700000000', secret), base);
    assert.notEqual(signCallback('{"a":1}', '1700000001', secret), base);
    assert.notEqual(signCallback('{"a":1}', '1700000000', 'other'), base);
  });
});

describe('postCallback', () => {
  let server: Server;
  let url: string;
  let received: { headers: IncomingHttpHeaders; body: string } | undefined;
  let respond: (res: import('node:http').ServerResponse) => void;

  before(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received = { headers: req.headers, body };
        respond(res);
      });
    }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}/cb`;
  });

  beforeEach(() => {
    received = undefined;
    respond = (res) => res.writeHead(204).end();
  });

  after(() => server.close());

  it('posts the JSON payload with a signature the receiver can verify', async () => {
    await postCallback(url, payload, secret);

    assert.ok(received);
    assert.equal(received.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(received.body), payload);

    const timestamp = received.headers['x-timestamp'] as string;
    assert.ok(Math.abs(Date.now() / 1000 - Number(timestamp)) < 5);
    assert.equal(received.headers['x-signature'], signCallback(received.body, timestamp, secret));
  });

  it('treats non-2xx responses as failures', async () => {
    respond = (res) => res.writeHead(500).end();
    await assert.rejects(postCallback(url, payload, secret), /HTTP 500/);
  });

  it('times out', async () => {
    respond = (res) => setTimeout(() => res.writeHead(200).end(), 500);
    await assert.rejects(postCallback(url, payload, secret, 50), { name: 'TimeoutError' });
  });
});
