import type {
  Bootstrap,
  NewSessionInput,
  NewResultInput,
} from '../domain/types';
import { getConfig } from './config';

/** Shape returned by the Apps Script web app. */
interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function apiUrl(): string {
  const { apiUrl } = getConfig();
  if (!apiUrl) {
    throw new Error(
      'API URL is not configured. Set VITE_API_URL to your Apps Script /exec URL.',
    );
  }
  return apiUrl;
}

async function get<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(apiUrl());
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) throw new Error(body.error || 'Unknown API error.');
  return body.data as T;
}

/**
 * Apps Script web apps do not return CORS headers for custom-header requests,
 * so we POST as text/plain to keep it a "simple" request (no preflight).
 */
async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) throw new Error(body.error || 'Unknown API error.');
  return body.data as T;
}

export const api = {
  bootstrap(tableId?: string): Promise<Bootstrap> {
    return get<Bootstrap>(tableId ? { action: 'bootstrap', table: tableId } : { action: 'bootstrap' });
  },

  createTable(name: string): Promise<{ tableId: string }> {
    return post<{ tableId: string }>({ action: 'createTable', name });
  },

  addPlayer(tableId: string, name: string): Promise<{ playerId: string }> {
    return post<{ playerId: string }>({ action: 'addPlayer', tableId, name });
  },

  renamePlayer(
    tableId: string,
    playerId: string,
    name: string,
  ): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'renamePlayer', tableId, playerId, name });
  },

  addSession(input: NewSessionInput): Promise<{ sessionId: string }> {
    return post<{ sessionId: string }>({ action: 'addSession', ...input });
  },

  editSession(
    tableId: string,
    sessionId: string,
    patch: {
      date: string;
      location: string;
      notes: string;
      results: NewResultInput[];
    },
  ): Promise<{ ok: true }> {
    return post<{ ok: true }>({
      action: 'editSession',
      tableId,
      sessionId,
      ...patch,
    });
  },

  deleteSession(tableId: string, sessionId: string): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'deleteSession', tableId, sessionId });
  },
};
