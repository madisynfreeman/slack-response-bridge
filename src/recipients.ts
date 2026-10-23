import type { webApi } from '@slack/bolt';

export type RecipientKind = 'user' | 'email' | 'channel';

export function classifyRecipient(recipient: string): RecipientKind | undefined {
  if (/^[UW][A-Z0-9]{2,}$/.test(recipient)) return 'user';
  if (/^[CGD][A-Z0-9]{2,}$/.test(recipient)) return 'channel';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return 'email';
  return undefined;
}

export interface ResolvedRecipient {
  channel: string;
  // Set when the recipient is a person (a DM), not a channel.
  userId?: string;
}

// Returns the conversation to post to: the channel itself, or a DM with the user.
export async function resolveRecipient(client: webApi.WebClient, recipient: string): Promise<ResolvedRecipient> {
  switch (classifyRecipient(recipient)) {
    case 'channel':
      return { channel: recipient };
    case 'user':
      return { channel: await openDm(client, recipient), userId: recipient };
    case 'email': {
      const { user } = await client.users.lookupByEmail({ email: recipient });
      if (!user?.id) throw new Error('users_not_found');
      return { channel: await openDm(client, user.id), userId: user.id };
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
