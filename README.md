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
      { "label": "Approve", "value": "approve", "style": "primary" },
      { "label": "Reject", "value": "reject", "style": "danger" }
    ],
    "callbackUrl": "https://example.com/slack-responses"
  }'
```

| Field         | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `requestId`   | Your ID for this request; echoed back in the response and in callbacks                       |
| `text`        | Message text in Slack mrkdwn, up to 3000 characters                                          |
| `recipients`  | Slack user IDs (`U…`/`W…`, sent as a DM), emails (looked up, sent as a DM), or channel IDs (`C…`/`G…`/`D…`) |
| `responses`   | 1–25 buttons. `label` ≤ 75 chars, `value` required, `style` optional: `primary` or `danger`  |
| `callbackUrl` | Optional if `CALLBACK_URL` is set; must be http(s)                                           |

Each button's value carries `requestId`, the response `value`, and `callbackUrl` as JSON, so the app keeps no
state. Slack caps a button value at 2000 characters, so a request is rejected if that JSON is longer.

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
