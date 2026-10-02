import type {
  Bootstrap,
  CloseSessionInput,
  CreateTableInput,
  NewSessionInput,
  NewResultInput,
  StartSessionInput,
  Wallet,
  WalletTransaction,
} from '../domain/types';
import { getConfig } from './config';
import { getPin } from './pin';

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
      'API URL is not configured. Set VITE_API_URL to the deployed backend URL.',
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
  const pin = (payload.pin as string | undefined) ?? getPin() ?? undefined;
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, pin }),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) throw new Error(body.error || 'Unknown API error.');
  return body.data as T;
}

export const api = {
  verifyPin(pin: string): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'verifyPin', pin });
  },

  bootstrap(tableId?: string): Promise<Bootstrap> {
    return get<Bootstrap>(
      tableId
        ? { action: 'bootstrap', table: tableId }
        : { action: 'bootstrap' },
    );
  },

  walletBootstrap(
    tableId: string,
  ): Promise<{ wallets: Wallet[]; walletTransactions: WalletTransaction[] }> {
    return post<{ wallets: Wallet[]; walletTransactions: WalletTransaction[] }>(
      { action: 'walletBootstrap', tableId },
    );
  },

  createTable(input: CreateTableInput): Promise<{ tableId: string }> {
    return post<{ tableId: string }>({ action: 'createTable', ...input });
  },

  addPlayer(tableId: string, name: string): Promise<{ playerId: string }> {
    return post<{ playerId: string }>({ action: 'addPlayer', tableId, name });
  },

  renamePlayer(
    tableId: string,
    playerId: string,
    name: string,
  ): Promise<{ ok: true }> {
    return post<{ ok: true }>({
      action: 'renamePlayer',
      tableId,
      playerId,
      name,
    });
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

  startSession(input: StartSessionInput): Promise<{ sessionId: string }> {
    return post<{ sessionId: string }>({ action: 'startSession', ...input });
  },

  addBuyIn(
    operationId: string,
    tableId: string,
    sessionId: string,
    playerId: string,
    amount?: number,
    remark?: string,
  ): Promise<{ buyInId: string }> {
    return post<{ buyInId: string }>({
      action: 'addBuyIn',
      operationId,
      tableId,
      sessionId,
      playerId,
      amount,
      remark,
    });
  },

  editBuyIn(
    buyInId: string,
    patch: { amount?: number; remark?: string },
  ): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'editBuyIn', buyInId, ...patch });
  },

  deleteBuyIn(buyInId: string): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'deleteBuyIn', buyInId });
  },

  closeSession(input: CloseSessionInput): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'closeSession', ...input });
  },

  reopenSession(tableId: string, sessionId: string): Promise<{ ok: true }> {
    return post<{ ok: true }>({ action: 'reopenSession', tableId, sessionId });
  },

  topUpWallet(
    operationId: string,
    tableId: string,
    playerId: string,
    moneyPaise: number,
    remark?: string,
  ): Promise<{ transactionId: string; balance: number }> {
    return post<{ transactionId: string; balance: number }>({
      action: 'topUpWallet',
      operationId,
      tableId,
      playerId,
      moneyPaise,
      remark,
    });
  },

  cashOutWallet(
    operationId: string,
    tableId: string,
    playerId: string,
    chips: number,
    remark?: string,
  ): Promise<{ transactionId: string; balance: number; moneyPaise: number }> {
    return post<{ transactionId: string; balance: number; moneyPaise: number }>(
      {
        action: 'cashOutWallet',
        operationId,
        tableId,
        playerId,
        chips,
        remark,
      },
    );
  },

  deleteTable(
    tableId: string,
    confirmationName: string,
  ): Promise<{ ok: true }> {
    return post<{ ok: true }>({
      action: 'deleteTable',
      tableId,
      confirmationName,
    });
  },
};
