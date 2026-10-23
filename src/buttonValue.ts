// Everything needed to handle a click lives in the button's value, so the app keeps no state.
export interface ButtonValue {
  requestId: string;
  value: string;
  callbackUrl: string;
  // Shown in place of "You responded: <label>" once the response is recorded.
  confirmation?: string;
}

// Slack's limit for a button's value field.
export const MAX_BUTTON_VALUE_LENGTH = 2000;

export function encodeButtonValue(button: ButtonValue): string {
  return JSON.stringify({
    requestId: button.requestId,
    value: button.value,
    callbackUrl: button.callbackUrl,
    ...(button.confirmation !== undefined && { confirmation: button.confirmation }),
  });
}

export function decodeButtonValue(raw: string): ButtonValue {
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('requestId' in parsed && typeof parsed.requestId === 'string') ||
    !('value' in parsed && typeof parsed.value === 'string') ||
    !('callbackUrl' in parsed && typeof parsed.callbackUrl === 'string') ||
    ('confirmation' in parsed && typeof parsed.confirmation !== 'string')
  ) {
    throw new Error('Invalid button value');
  }
  const button: ButtonValue = { requestId: parsed.requestId, value: parsed.value, callbackUrl: parsed.callbackUrl };
  if ('confirmation' in parsed) button.confirmation = parsed.confirmation as string;
  return button;
}
