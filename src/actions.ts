import type { App, BlockAction, ButtonAction, types } from '@slack/bolt';
import { type ButtonValue, decodeButtonValue } from './buttonValue';
import { postCallback } from './callback';
import { RESPONSE_ACTION_PREFIX } from './messages';

const RETRY_MESSAGE = "Sorry, we couldn't record your response. Please try again.";

export function registerResponseHandler(app: App, callbackSecret: string): void {
  app.action<BlockAction<ButtonAction>>(
    { type: 'block_actions', action_id: new RegExp(`^${RESPONSE_ACTION_PREFIX}`) },
    async ({ ack, body, action, client, logger }) => {
      await ack();

      const channel = body.channel?.id;
      const message = body.message;
      const label = action.text.text;
      if (!channel || !message || !action.value) {
        logger.error('Response click is missing its channel, message or value', { actionId: action.action_id });
        return;
      }

      console.log(`Response received: ${label}`);

      let button: ButtonValue;
      try {
        button = decodeButtonValue(action.value);
        const { user } = await client.users.info({ user: body.user.id });

        await postCallback(
          button.callbackUrl,
          {
            requestId: button.requestId,
            response: { value: button.value, label },
            user: {
              id: body.user.id,
              name: user?.real_name || user?.name || body.user.name,
              email: user?.profile?.email,
            },
            channel,
            messageTs: message.ts,
            respondedAt: new Date().toISOString(),
          },
          callbackSecret,
        );
      } catch (err) {
        logger.error(`Callback failed for ${channel}/${message.ts}`, err);
        await client.chat.postEphemeral({ channel, user: body.user.id, text: RETRY_MESSAGE });
        return;
      }

      // The callback was delivered, so a failed update is only logged; asking the user to retry would send a duplicate.
      try {
        const reply = button.confirmation ?? `You responded: ${label}`;
        await client.chat.update({
          channel,
          ts: message.ts,
          text: `${message.text ?? ''}\n${reply}`,
          blocks: answeredBlocks(message.blocks as types.KnownBlock[] | undefined, reply),
        });
      } catch (err) {
        logger.error(`Failed to update message ${channel}/${message.ts}`, err);
      }
    },
  );
}

// The original message minus its buttons, plus the reply to the chosen response.
function answeredBlocks(blocks: types.KnownBlock[] = [], reply: string): types.KnownBlock[] {
  return [
    ...blocks.filter((block) => block.type !== 'actions'),
    { type: 'context', elements: [{ type: 'plain_text', text: reply }] },
  ];
}
