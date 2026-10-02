export const EPSILON = 0.01;
export const MEMBER_THRESHOLD = 5;

export type PlayerStatus = 'guest' | 'member';
export type SessionStatus = 'open' | 'closed';
export type TableMode = 'legacy' | 'wallet';
export type WalletTransactionType =
  | 'top_up'
  | 'cash_out'
  | 'buy_in'
  | 'buy_in_adjustment'
  | 'buy_in_reversal'
  | 'buy_out'
  | 'buy_out_reversal'
  | 'session_reversal';

interface BaseDocument {
  id: string;
  tableId: string;
  type:
    | 'table'
    | 'player'
    | 'session'
    | 'result'
    | 'buyIn'
    | 'wallet'
    | 'walletTransaction'
    | 'command';
  _etag?: string;
}

export interface TableDocument extends BaseDocument {
  type: 'table';
  tableId: string;
  name: string;
  createdAt: string;
  mode?: TableMode;
  currency?: 'INR';
  chipsPerRupee?: number;
  defaultBuyIn?: number;
  deleting?: boolean;
}

export interface PlayerDocument extends BaseDocument {
  type: 'player';
  playerId: string;
  name: string;
  status: PlayerStatus;
  createdAt: string;
}

export interface SessionDocument extends BaseDocument {
  type: 'session';
  sessionId: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
  status: SessionStatus;
}

export interface ResultDocument extends BaseDocument {
  type: 'result';
  sessionId: string;
  playerId: string;
  net: number;
  chips: number | null;
}

export interface BuyInDocument extends BaseDocument {
  type: 'buyIn';
  sessionId: string;
  playerId: string;
  buyInId: string;
  amount: number;
  remark: string;
  createdAt: string;
}

export interface WalletDocument extends BaseDocument {
  type: 'wallet';
  playerId: string;
  balance: number;
  updatedAt: string;
}

export interface WalletTransactionDocument extends BaseDocument {
  type: 'walletTransaction';
  transactionId: string;
  playerId: string;
  transactionType: WalletTransactionType;
  chips: number;
  moneyPaise: number | null;
  sessionId: string | null;
  buyInId: string | null;
  remark: string;
  createdAt: string;
}

export interface CommandDocument extends BaseDocument {
  type: 'command';
  operationId: string;
  action: 'topUpWallet' | 'cashOutWallet' | 'startSession' | 'addBuyIn';
  fingerprint: string;
  result: Record<string, unknown>;
  createdAt: string;
}

export type PokerDocument =
  | TableDocument
  | PlayerDocument
  | SessionDocument
  | ResultDocument
  | BuyInDocument
  | WalletDocument
  | WalletTransactionDocument
  | CommandDocument;

export interface ResultInput {
  playerId: string;
  net: number;
  chips?: number | null;
}

export function assertZeroSum(results: ResultInput[]): void {
  if (!Array.isArray(results) || results.length < 2) {
    throw new Error('A session needs at least two players.');
  }
  const sum = results.reduce(
    (total, result) => total + (Number(result.net) || 0),
    0,
  );
  if (Math.abs(sum) > EPSILON) {
    throw new Error(`Results must balance to zero (off by ${sum.toFixed(2)}).`);
  }
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function tableDocumentId(tableId: string): string {
  return `table:${tableId}`;
}

export function playerDocumentId(playerId: string): string {
  return `player:${playerId}`;
}

export function sessionDocumentId(sessionId: string): string {
  return `session:${sessionId}`;
}

export function resultDocumentId(sessionId: string, playerId: string): string {
  return `result:${sessionId}:${playerId}`;
}

export function buyInDocumentId(buyInId: string): string {
  return `buyIn:${buyInId}`;
}

export function walletDocumentId(playerId: string): string {
  return `wallet:${playerId}`;
}

export function walletTransactionDocumentId(transactionId: string): string {
  return `walletTransaction:${transactionId}`;
}

export function commandDocumentId(operationId: string): string {
  return `command:${operationId}`;
}

export function assertPositiveInteger(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return numeric;
}

export function moneyPaiseToChips(
  moneyPaise: unknown,
  chipsPerRupee: number,
): number {
  const paise = assertPositiveInteger(moneyPaise, 'Money amount');
  const numerator = paise * chipsPerRupee;
  if (numerator % 100 !== 0) {
    throw new Error(
      'Money amount does not convert to a whole number of chips.',
    );
  }
  return numerator / 100;
}

export function chipsToMoneyPaise(
  chips: unknown,
  chipsPerRupee: number,
): number {
  const chipCount = assertPositiveInteger(chips, 'Chip amount');
  const numerator = chipCount * 100;
  if (numerator % chipsPerRupee !== 0) {
    throw new Error('Chip amount does not convert to an exact cash value.');
  }
  return numerator / chipsPerRupee;
}

export function publicDocument<T extends PokerDocument>(
  document: T,
): Omit<T, 'id' | 'type' | '_etag'> {
  return Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => key !== 'id' && key !== 'type' && !key.startsWith('_'),
    ),
  ) as Omit<T, 'id' | 'type' | '_etag'>;
}
