import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { App } from '@slack/bolt';
import { registerResponseHandler } from '../src/actions';
import { encodeButtonValue } from '../src/buttonValue';

type Listener = (args: Record<string, unknown>) => Promise<void>;

// Captures the listener registered with app.action so the test can call it directly.
function captureListener(): Listener {
  let listener: Listener | undefined;
  const app = { action: (_constraints: unknown, fn: Listener) => (listener = fn) } as unknown as App;
  registerResponseHandler(app, 'test-secret');
  return listener!;
}

describe('response button handler', () => {
  let server: Server;
  let callbackUrl: string;
  let callbackStatus: number;
  let callbacks: unknown[];
  let calls: Record<string, unknown[]>;

  before(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        callbacks.push(JSON.parse(body));
        res.writeHead(callbackStatus).end();
      });
    }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    callbackUrl = `http://localhost:${(server.address() as AddressInfo).port}/cb`;
  });

  beforeEach(() => {
    callbackStatus = 200;
    callbacks = [];
    calls = { ack: [], update: [], postEphemeral: [], errors: [] };
  });

  after(() => server.close());

  const click = (confirmation?: string) =>
    captureListener()({
      ack: async () => calls.ack.push(true),
      body: {
        user: { id: 'U123ABC', name: 'jane' },
        channel: { id: 'D123' },
        message: {
          ts: '1.2',
          text: 'Approve?',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'Approve?' } },
            { type: 'actions', elements: [] },
          ],
        },
      },
      action: {
        action_id: 'response_0',
        text: { type: 'plain_text', text: 'Approve' },
        value: encodeButtonValue({ requestId: 'req-1', value: 'approve', callbackUrl, confirmation }),
      },
      client: {
        users: {
          info: async () => ({ user: { name: 'jane', real_name: 'Jane Doe', profile: { email: 'jane@example.com' } } }),
        },
        chat: {
          update: async (args: unknown) => calls.update.push(args),
          postEphemeral: async (args: unknown) => calls.postEphemeral.push(args),
        },
      },
      logger: { error: (...args: unknown[]) => calls.errors.push(args) },
    });

  it('posts the callback and replaces the buttons with the chosen response', async () => {
    await click();

    assert.equal(calls.ack.length, 1);
    assert.equal(callbacks.length, 1);
    const callback = callbacks[0] as Record<string, unknown>;
    assert.deepEqual(
      { ...callback, respondedAt: undefined },
      {
        requestId: 'req-1',
        response: { value: 'approve', label: 'Approve' },
        user: { id: 'U123ABC', name: 'Jane Doe', email: 'jane@example.com' },
        channel: 'D123',
        messageTs: '1.2',
        respondedAt: undefined,
      },
    );
    assert.ok(!Number.isNaN(Date.parse(callback.respondedAt as string)));

    assert.deepEqual(calls.update, [
      {
        channel: 'D123',
        ts: '1.2',
        text: 'Approve?\nYou responded: Approve',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: 'Approve?' } },
          { type: 'context', elements: [{ type: 'plain_text', text: 'You responded: Approve' }] },
        ],
      },
    ]);
    assert.equal(calls.postEphemeral.length, 0);
  });

  it("shows the response's confirmation instead of the default reply", async () => {
    await click("Great, we'll put you forward 🎉");

    assert.equal(callbacks.length, 1);
    assert.deepEqual(calls.update, [
      {
        channel: 'D123',
        ts: '1.2',
        text: "Approve?\nGreat, we'll put you forward 🎉",
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: 'Approve?' } },
          { type: 'context', elements: [{ type: 'plain_text', text: "Great, we'll put you forward 🎉" }] },
        ],
      },
    ]);
  });

  it('keeps the buttons and asks the user to retry when the callback fails', async () => {
    callbackStatus = 503;
    await click();

    assert.equal(calls.ack.length, 1);
    assert.equal(calls.update.length, 0);
    assert.deepEqual(calls.postEphemeral, [
      { channel: 'D123', user: 'U123ABC', text: "Sorry, we couldn't record your response. Please try again." },
    ]);
    assert.equal(calls.errors.length, 1);
  });
});
