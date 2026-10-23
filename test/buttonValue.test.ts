import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeButtonValue, encodeButtonValue } from '../src/buttonValue';
import { buildMessageBlocks } from '../src/messages';

const button = { requestId: 'req-1', value: 'approve', callbackUrl: 'https://example.com/cb' };

describe('button value encoding', () => {
  it('round-trips', () => {
    assert.deepEqual(decodeButtonValue(encodeButtonValue(button)), button);
  });

  it('round-trips values with quotes, unicode and JSON-looking content', () => {
    const tricky = { ...button, value: '{"nested": "yes"} — ✅ "quoted"' };
    assert.deepEqual(decodeButtonValue(encodeButtonValue(tricky)), tricky);
  });

  it('rejects malformed values', () => {
    assert.throws(() => decodeButtonValue('not json'));
    assert.throws(() => decodeButtonValue('null'), /Invalid button value/);
    assert.throws(() => decodeButtonValue(JSON.stringify({ requestId: 'r', value: 'v' })), /Invalid button value/);
    assert.throws(() => decodeButtonValue(JSON.stringify({ ...button, value: 1 })), /Invalid button value/);
  });
});

describe('buildMessageBlocks', () => {
  it('builds a section and one button per response with encoded values', () => {
    const blocks = buildMessageBlocks({
      requestId: 'req-1',
      text: 'Approve?',
      recipients: ['U123ABC'],
      responses: [
        { label: 'Approve', value: 'approve', style: 'primary' },
        { label: 'Reject', value: 'reject' },
      ],
      callbackUrl: 'https://example.com/cb',
    });

    assert.deepEqual(blocks[0], { type: 'section', text: { type: 'mrkdwn', text: 'Approve?' } });
    const actions = blocks[1];
    assert.equal(actions.type, 'actions');
    if (actions.type !== 'actions') return;

    const [approve, reject] = actions.elements as Array<{ action_id: string; value: string; style?: string }>;
    assert.equal(approve.action_id, 'response_0');
    assert.equal(approve.style, 'primary');
    assert.deepEqual(decodeButtonValue(approve.value), button);
    assert.equal(reject.action_id, 'response_1');
    assert.equal(reject.style, undefined);
    assert.equal(decodeButtonValue(reject.value).value, 'reject');
  });
});
