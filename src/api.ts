import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import type { webApi } from '@slack/bolt';
import { sendMessage } from './messages';
import { validateMessageRequest } from './validation';

interface ApiOptions {
  client: webApi.WebClient;
  apiKey: string;
  defaultCallbackUrl?: string;
}

// Hashing first makes both buffers the same length, so the compare doesn't leak the key's length.
function safeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function requireApiKey(apiKey: string): RequestHandler {
  return (req, res, next) => {
    const provided = req.get('x-api-key');
    if (!provided || !safeEqual(provided, apiKey)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    next();
  };
}

const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
};

// The HTTP server for callers. Slack traffic goes over Socket Mode, so this server only hosts our own routes.
export function createApiServer({ client, apiKey, defaultCallbackUrl }: ApiOptions): Express {
  const server = express();
  server.use(express.json());

  server.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  server.post('/api/messages', requireApiKey(apiKey), async (req, res) => {
    const validation = validateMessageRequest(req.body, defaultCallbackUrl);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const results = await sendMessage(client, validation.request);
    res.json({ requestId: validation.request.requestId, results });
  });

  server.use(jsonErrorHandler);
  return server;
}
