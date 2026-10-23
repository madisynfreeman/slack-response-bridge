import { encodeButtonValue, MAX_BUTTON_VALUE_LENGTH } from './buttonValue';
import { classifyRecipient } from './recipients';

export interface ResponseOption {
  label: string;
  value: string;
  style?: 'primary' | 'danger';
}

export interface MessageRequest {
  requestId: string;
  text: string;
  recipients: string[];
  responses: ResponseOption[];
  callbackUrl: string;
}

export type ValidationResult = { ok: true; request: MessageRequest } | { ok: false; error: string };

export const MAX_BUTTONS = 25;
export const MAX_LABEL_LENGTH = 75;
export const MAX_TEXT_LENGTH = 3000;

const fail = (error: string): ValidationResult => ({ ok: false, error });

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateMessageRequest(body: unknown, defaultCallbackUrl?: string): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('Request body must be a JSON object');
  }
  const { requestId, text, recipients, responses, callbackUrl } = body as Record<string, unknown>;

  if (!isNonEmptyString(requestId)) return fail('requestId must be a non-empty string');

  if (!isNonEmptyString(text)) return fail('text must be a non-empty string');
  if (text.length > MAX_TEXT_LENGTH) return fail(`text must be ${MAX_TEXT_LENGTH} characters or fewer`);

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return fail('recipients must be a non-empty array');
  }
  for (const [i, recipient] of recipients.entries()) {
    if (typeof recipient !== 'string' || !classifyRecipient(recipient)) {
      return fail(`recipients[${i}] must be a Slack user ID, channel ID, or email address`);
    }
  }

  if (callbackUrl !== undefined && typeof callbackUrl !== 'string') {
    return fail('callbackUrl must be a string');
  }
  const resolvedCallbackUrl = callbackUrl || defaultCallbackUrl;
  if (!resolvedCallbackUrl) return fail('callbackUrl is required because CALLBACK_URL is not configured');
  if (!isHttpUrl(resolvedCallbackUrl)) return fail('callbackUrl must be an http(s) URL');

  if (!Array.isArray(responses) || responses.length === 0) {
    return fail('responses must be a non-empty array');
  }
  if (responses.length > MAX_BUTTONS) return fail(`responses can have at most ${MAX_BUTTONS} items`);

  const validResponses: ResponseOption[] = [];
  for (const [i, response] of responses.entries()) {
    if (typeof response !== 'object' || response === null) return fail(`responses[${i}] must be an object`);
    const { label, value, style } = response as Record<string, unknown>;

    if (!isNonEmptyString(label)) return fail(`responses[${i}].label must be a non-empty string`);
    if (label.length > MAX_LABEL_LENGTH) {
      return fail(`responses[${i}].label must be ${MAX_LABEL_LENGTH} characters or fewer`);
    }
    if (!isNonEmptyString(value)) return fail(`responses[${i}].value must be a non-empty string`);
    if (style !== undefined && style !== 'primary' && style !== 'danger') {
      return fail(`responses[${i}].style must be "primary" or "danger"`);
    }

    const encodedLength = encodeButtonValue({ requestId, value, callbackUrl: resolvedCallbackUrl }).length;
    if (encodedLength > MAX_BUTTON_VALUE_LENGTH) {
      return fail(
        `responses[${i}] button payload is ${encodedLength} characters (max ${MAX_BUTTON_VALUE_LENGTH}); ` +
          'shorten value, requestId, or callbackUrl',
      );
    }

    validResponses.push(style ? { label, value, style } : { label, value });
  }

  return {
    ok: true,
    request: {
      requestId,
      text,
      recipients: recipients as string[],
      responses: validResponses,
      callbackUrl: resolvedCallbackUrl,
    },
  };
}
