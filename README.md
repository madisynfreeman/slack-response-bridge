# ZipMatch

A Slack Bolt app that other systems drive over HTTP. A caller posts a message for a list of Slack
recipients along with suggested responses, and each recipient gets the message with one button per
response.

The app connects to Slack with **Socket Mode**, so Slack events and button clicks arrive over a WebSocket
and no public URL is needed. A separate small Express server on `PORT` serves the HTTP API:

| Route                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `POST /api/messages` | Send a message (requires the `x-api-key` header) |
| `GET /health`        | Health check                                     |

## Slack app setup

1. Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**, pick your workspace,
   and paste the contents of [`manifest.yml`](manifest.yml). It enables Socket Mode and interactivity.
2. **Basic Information → App-Level Tokens → Generate Token and Scopes**: add the `connections:write` scope and
   generate. Copy the `xapp-...` token → `SLACK_APP_TOKEN`.
3. **Install to Workspace**, then copy **OAuth & Permissions → Bot User OAuth Token** → `SLACK_BOT_TOKEN`.
4. To send to a channel, invite the bot to it first (`/invite @ZipMatch`). DMs to users don't need this.

Bot scopes: `chat:write`, `im:write` (open DMs), `users:read`, `users:read.email` (look up users by email).

## Configuration

Copy `.env.example` to `.env` and fill it in.

| Variable               | Required | Description                                                     |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`      | yes      | Bot token (`xoxb-...`)                                          |
| `SLACK_APP_TOKEN`      | yes      | App-level token (`xapp-...`) with `connections:write`, for Socket Mode |
| `API_KEY`              | yes      | Callers must send this in the `x-api-key` header                |
| `CALLBACK_URL`         | no       | Default callback URL; a request's `callbackUrl` overrides it    |
| `CALLBACK_SECRET`      | yes      | Signs callbacks; share it with the receiving system (`openssl rand -hex 32`) |
| `PORT`                 | no       | Port for the HTTP API; defaults to `3000`                       |

## Local development

```sh
npm install
cp .env.example .env   # then fill it in
npm run dev            # connects to Slack and serves the API on http://localhost:3000
```

Socket Mode connects out to Slack, so this works on a laptop with no ngrok or public URL.

Other scripts: `npm test`, `npm run typecheck`, `npm run build && npm start`.

## API

### `POST /api/messages`

```sh
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "requestId": "deploy-4821",
    "text": "*Deploy 4821* to production is ready. Approve?",
    "recipients": ["U123ABC", "jane@example.com", "C456DEF"],
    "responses": [
      { "label": "Approve", "value": "approve", "style": "primary", "confirmation": "Thanks, the deploy is approved 🚀" },
      { "label": "Reject", "value": "reject", "style": "danger", "confirmation": "Got it, the deploy is cancelled." }
    ],
    "callbackUrl": "https://example.com/slack-responses"
  }'
```

| Field         | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `requestId`   | Your ID for this request; echoed back in the response and in callbacks                       |
| `text`        | Message text in Slack mrkdwn, up to 3000 characters. `{firstName}` is replaced per recipient (see below) |
| `recipients`  | Slack user IDs (`U…`/`W…`, sent as a DM), emails (looked up, sent as a DM), or channel IDs (`C…`/`G…`/`D…`) |
| `responses`   | 1–25 buttons. `label` ≤ 75 chars, `value` required, `style` optional: `primary` or `danger`, `confirmation` optional (see below) |
| `callbackUrl` | Optional if `CALLBACK_URL` is set; must be http(s)                                           |

`{firstName}` in `text` is replaced with each recipient's Slack first name (their profile's first name, or
else the first word of their full name), so `"Hi Dr {firstName}"` becomes "Hi Dr Jane". A channel has no
single person to name, so channel recipients fail with an error if `text` uses `{firstName}`; other
recipients are unaffected.

`confirmation` is the reply shown once that response is recorded (see [Callbacks](#callbacks)). Without one,
the reply is "You responded: <label>".

Each button's value carries `requestId`, the response `value`, `callbackUrl` and `confirmation` as JSON, so the
app keeps no state. Slack caps a button value at 2000 characters, so a request is rejected if that JSON is longer.

Each recipient is sent to independently, and one failing doesn't stop the others. The response is `200` with a
result per recipient:

```json
{
  "requestId": "deploy-4821",
  "results": [
    { "recipient": "U123ABC", "ok": true, "channel": "D0123ABCD", "ts": "1729680000.000100" },
    { "recipient": "jane@example.com", "ok": false, "error": "users_not_found" },
    { "recipient": "C456DEF", "ok": false, "error": "not_in_channel" }
  ]
}
```

`error` is the Slack API error code when there is one.

Errors:

- `401 {"error": "Invalid API key"}`: missing or wrong `x-api-key`
- `400 {"error": "..."}`: invalid body, for example `{"error": "responses[0].label must be 75 characters or fewer"}`

## Callbacks

When a recipient clicks a button, the app POSTs JSON to the request's callback URL:

```json
{
  "requestId": "deploy-4821",
  "response": { "value": "approve", "label": "Approve" },
  "user": { "id": "U123ABC", "name": "Jane Doe", "email": "jane@example.com" },
  "channel": "D0123ABCD",
  "messageTs": "1729680000.000100",
  "respondedAt": "2026-10-23T18:04:12.345Z"
}
```

`name` and `email` come from `users.info` (`email` needs `users:read.email` and is missing for bots and
some guest accounts).

Headers:

| Header         | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `content-type` | `application/json`                                                          |
| `x-timestamp`  | Unix time in seconds when the callback was sent                             |
| `x-signature`  | `sha256=` + hex HMAC-SHA256 of `"<x-timestamp>.<raw body>"` with `CALLBACK_SECRET` |

The callback must return a 2xx within 10 seconds.

- **Success:** the buttons are removed from the message and replaced with that response's `confirmation`, or
  "You responded: <label>" if it has none. In a channel, the first click answers for everyone.
- **Failure** (network error, timeout or non-2xx): the buttons stay and the user gets an ephemeral
  "please try again" message. The error is logged.

A callback can arrive more than once for the same message (for example, two quick clicks, or the
receiver timing out after it already saved the response), so treat `requestId` + `user.id` as the key and
ignore repeats if that matters to you.

### Verifying the signature

Compute the HMAC over the **raw** request body, before any JSON parsing, and reject old timestamps to
block replays. In Node with Express:

```js
const crypto = require('node:crypto');
const express = require('express');

const app = express();

app.post('/slack-responses', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('x-timestamp') ?? '';
  const signature = req.get('x-signature') ?? '';

  // Reject anything older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return res.sendStatus(401);

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', process.env.CALLBACK_SECRET).update(`${timestamp}.${req.body}`).digest('hex');

  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return res.sendStatus(401);

  const payload = JSON.parse(req.body);
  // ... record payload.response for payload.requestId ...
  res.sendStatus(204);
});
```
