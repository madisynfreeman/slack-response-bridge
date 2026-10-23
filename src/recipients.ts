import type { webApi } from '@slack/bolt';

export type RecipientKind = 'user' | 'email' | 'channel';

export function classifyRecipient(recipient: string): RecipientKind | undefined {
  if (/^[UW][A-Z0-9]{2,}$/.test(recipient)) return 'user';
  if (/^[CGD][A-Z0-9]{2,}$/.test(recipient)) return 'channel';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return 'email';
  return undefined;
}

// Returns the conversation ID to post to: the channel itself, or a DM with the user.
export async function resolveChannel(client: webApi.WebClient, recipient: string): Promise<string> {
  switch (classifyRecipient(recipient)) {
    case 'channel':
      return recipient;
    case 'user':
      return openDm(client, recipient);
    case 'email': {
      const { user } = await client.users.lookupByEmail({ email: recipient });
      if (!user?.id) throw new Error('users_not_found');
      return openDm(client, user.id);
    }
    default:
      throw new Error(`Unrecognized recipient: ${recipient}`);
  }
}

async function openDm(client: webApi.WebClient, userId: string): Promise<string> {
  const { channel } = await client.conversations.open({ users: userId });
  if (!channel?.id) throw new Error('conversations.open returned no channel');
  return channel.id;
}
