// Everything needed to handle a click lives in the button's value, so the app keeps no state.
export interface ButtonValue {
  requestId: string;
  value: string;
  callbackUrl: string;
}

// Slack's limit for a button's value field.
export const MAX_BUTTON_VALUE_LENGTH = 2000;

export function encodeButtonValue(button: ButtonValue): string {
  return JSON.stringify({
    requestId: button.requestId,
    value: button.value,
    callbackUrl: button.callbackUrl,
  });
}

export function decodeButtonValue(raw: string): ButtonValue {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('requestId' in parsed && typeof parsed.requestId === 'string') ||
    !('value' in parsed && typeof parsed.value === 'string') ||
    !('callbackUrl' in parsed && typeof parsed.callbackUrl === 'string')
  ) {
    throw new Error('Invalid button value');
  }
  return { requestId: parsed.requestId, value: parsed.value, callbackUrl: parsed.callbackUrl };
}
