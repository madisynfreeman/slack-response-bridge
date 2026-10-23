import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { webApi } from '@slack/bolt';
import { sendMessage } from '../src/messages';
import type { MessageRequest } from '../src/validation';

const profiles: Record<string, { name: string; real_name?: string; profile?: { first_name?: string } }> = {
  U111: { name: 'jane.doe', real_name: 'Jane Doe', profile: { first_name: 'Jane' } },
  U222: { name: 'sam', real_name: 'Sam <Lee>' },
};

let posted: Array<{ channel: string; text: string; blocks: Array<{ type: string; text?: { text: string } }> }>;
let usersInfoCalls: number;

const client = {
  users: {
    info: async ({ user }: { user: string }) => {
      usersInfoCalls++;
      return { user: profiles[user] };
    },
    lookupByEmail: async () => ({ user: { id: 'U111' } }),
  },
  conversations: { open: async ({ users }: { users: string }) => ({ channel: { id: `D-${users}` } }) },
  chat: {
    postMessage: async (args: (typeof posted)[number]) => {
      posted.push(args);
      return { ts: '1.2' };
    },
  },
} as unknown as webApi.WebClient;

const request = (text: string, recipients: string[]): MessageRequest => ({
  requestId: 'req-1',
  text,
  recipients,
  responses: [{ label: 'Yes', value: 'yes' }],
  callbackUrl: 'https://example.com/cb',
});

describe('sendMessage personalization', () => {
  beforeEach(() => {
    posted = [];
    usersInfoCalls = 0;
  });

  it("fills {firstName} with each recipient's Slack first name", async () => {
    const results = await sendMessage(client, request('Hi Dr {firstName}, {firstName}!', ['U111', 'jane@example.com']));

    assert.deepEqual(results.map((r) => r.ok), [true, true]);
    assert.deepEqual(posted.map((p) => p.text), ['Hi Dr Jane, Jane!', 'Hi Dr Jane, Jane!']);
    assert.equal(posted[0].blocks[0].text?.text, 'Hi Dr Jane, Jane!');
  });

  it('falls back to the first word of the real name, escaped for mrkdwn', async () => {
    await sendMessage(client, request('Hi Dr {firstName}', ['U222']));
    assert.equal(posted[0].text, 'Hi Dr Sam');

    profiles.U222.real_name = '<Sam> Lee';
    await sendMessage(client, request('Hi Dr {firstName}', ['U222']));
    assert.equal(posted[1].text, 'Hi Dr &lt;Sam&gt;');
  });

  it('fails only the channel recipients when the text uses {firstName}', async () => {
    const results = await sendMessage(client, request('Hi {firstName}', ['C456DEF', 'U111']));

    assert.deepEqual(results[0], {
      recipient: 'C456DEF',
      ok: false,
      error: '{firstName} can only be used for people, not channels',
    });
    assert.equal(results[1].ok, true);
    assert.deepEqual(posted.map((p) => p.channel), ['D-U111']);
  });

  it("doesn't look up users when the text has no placeholder", async () => {
    await sendMessage(client, request('Hello', ['U111', 'C456DEF']));
    assert.equal(usersInfoCalls, 0);
    assert.equal(posted.length, 2);
  });
});
