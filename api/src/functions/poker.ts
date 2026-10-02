import { createHash, timingSafeEqual } from 'node:crypto';
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { bootstrap, dispatch } from '../service.js';
import { consumePinAttempt } from '../security.js';

interface Envelope {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function allowedOrigin(request: HttpRequest): string {
  const origin = request.headers.get('origin') || '';
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || configured.includes('*') || configured.includes(origin)) {
    return origin || '*';
  }
  return configured[0] || '*';
}

function response(
  request: HttpRequest,
  envelope: Envelope,
  status = 200,
): HttpResponseInit {
  return {
    status,
    jsonBody: envelope,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin(request),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  };
}

function hashPin(pin: unknown): Buffer {
  return createHash('sha256')
    .update(String(pin ?? ''), 'utf8')
    .digest();
}

function pinMatches(pin: unknown): boolean {
  const expectedHex = process.env.EDIT_PIN_HASH?.trim().toLowerCase();
  if (!expectedHex || !/^[a-f0-9]{64}$/.test(expectedHex)) {
    throw new Error('Editing PIN is not configured.');
  }
  const expected = Buffer.from(expectedHex, 'hex');
  const supplied = hashPin(pin);
  return timingSafeEqual(expected, supplied);
}

function throttleId(request: HttpRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') || 'unknown';
  const hops = forwarded
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const client = hops.at(-1) || 'unknown';
  return `pinThrottle:${createHash('sha256').update(client).digest('hex')}`;
}

async function handler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return response(request, { ok: true });
  try {
    if (request.method === 'GET') {
      const action = request.query.get('action') || 'bootstrap';
      if (action !== 'bootstrap' && action !== 'tables') {
        throw new Error(`Unknown action: ${action}`);
      }
      const tableId = request.query.get('table') || undefined;
      return response(request, { ok: true, data: await bootstrap(tableId) });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const matches = pinMatches(body.pin);
    const globallyAllowed = await consumePinAttempt(
      'pinThrottle:global',
      matches,
      50,
      false,
    );
    const clientAllowed = await consumePinAttempt(throttleId(request), matches);
    if (!matches || !globallyAllowed || !clientAllowed) {
      throw new Error('Incorrect PIN.');
    }
    const action = String(body.action || '');
    return response(request, {
      ok: true,
      data: await dispatch(action, body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.error('Poker API request failed', { error: message });
    return response(request, { ok: false, error: message });
  }
}

app.http('poker', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'poker',
  handler,
});
