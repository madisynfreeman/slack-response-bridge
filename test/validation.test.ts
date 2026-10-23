import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateMessageRequest } from '../src/validation';

const validBody = {
  requestId: 'req-1',
  text: 'Approve the deploy?',
  recipients: ['U123ABC', 'jane@example.com', 'C456DEF'],
  responses: [
    { label: 'Approve', value: 'approve', style: 'primary' },
    { label: 'Reject', value: 'reject' },
  ],
  callbackUrl: 'https://example.com/callback',
};

function expectError(body: unknown, pattern: RegExp, defaultCallbackUrl?: string) {
  const result = validateMessageRequest(body, defaultCallbackUrl);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, pattern);
}

describe('validateMessageRequest', () => {
  it('accepts a valid request', () => {
    const result = validateMessageRequest(validBody);
    assert.deepEqual(result, { ok: true, request: validBody });
  });

  it('falls back to the default callback URL', () => {
    const { callbackUrl, ...body } = validBody;
    const result = validateMessageRequest(body, 'https://default.example.com/cb');
    assert.equal(result.ok && result.request.callbackUrl, 'https://default.example.com/cb');
  });

  it('prefers the request callback URL over the default', () => {
    const result = validateMessageRequest(validBody, 'https://default.example.com/cb');
    assert.equal(result.ok && result.request.callbackUrl, validBody.callbackUrl);
  });

  it('rejects a non-object body', () => {
    expectError(null, /JSON object/);
    expectError([validBody], /JSON object/);
  });

  it('requires requestId and text', () => {
    expectError({ ...validBody, requestId: '' }, /requestId/);
    expectError({ ...validBody, text: undefined }, /text/);
    expectError({ ...validBody, text: 'x'.repeat(3001) }, /text must be 3000/);
  });

  it('rejects empty or malformed recipients', () => {
    expectError({ ...validBody, recipients: [] }, /recipients must be a non-empty array/);
    expectError({ ...validBody, recipients: 'U123ABC' }, /recipients must be a non-empty array/);
    expectError({ ...validBody, recipients: ['U123ABC', 'not-a-recipient'] }, /recipients\[1\]/);
    expectError({ ...validBody, recipients: [42] }, /recipients\[0\]/);
  });

  it('rejects empty responses and more than 25 buttons', () => {
    expectError({ ...validBody, responses: [] }, /responses must be a non-empty array/);
    const tooMany = Array.from({ length: 26 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
    expectError({ ...validBody, responses: tooMany }, /at most 25/);
  });

  it('accepts exactly 25 buttons', () => {
    const max = Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
    assert.equal(validateMessageRequest({ ...validBody, responses: max }).ok, true);
  });

  it('enforces the 75 character label limit', () => {
    assert.equal(validateMessageRequest({ ...validBody, responses: [{ label: 'x'.repeat(75), value: 'v' }] }).ok, true);
    expectError({ ...validBody, responses: [{ label: 'x'.repeat(76), value: 'v' }] }, /responses\[0\]\.label.*75/);
  });

  it('rejects missing values and unknown styles', () => {
    expectError({ ...validBody, responses: [{ label: 'A' }] }, /responses\[0\]\.value/);
    expectError({ ...validBody, responses: [{ label: 'A', value: 'a', style: 'green' }] }, /style/);
  });

  it('enforces the 2000 character button payload limit', () => {
    expectError({ ...validBody, responses: [{ label: 'A', value: 'x'.repeat(2000) }] }, /payload is \d+ characters \(max 2000\)/);
  });

  it('requires a valid http(s) callback URL', () => {
    const { callbackUrl, ...body } = validBody;
    expectError(body, /callbackUrl is required/);
    expectError({ ...validBody, callbackUrl: 'not a url' }, /http\(s\) URL/);
    expectError({ ...validBody, callbackUrl: 'ftp://example.com' }, /http\(s\) URL/);
  });
});
