export const EPSILON = 0.01;
export const MEMBER_THRESHOLD = 5;

export type PlayerStatus = 'guest' | 'member';
export type SessionStatus = 'open' | 'closed';

interface BaseDocument {
  id: string;
  tableId: string;
  type: 'table' | 'player' | 'session' | 'result' | 'buyIn';
  _etag?: string;
}

export interface TableDocument extends BaseDocument {
  type: 'table';
  tableId: string;
  name: string;
  createdAt: string;
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

export type PokerDocument =
  | TableDocument
  | PlayerDocument
  | SessionDocument
  | ResultDocument
  | BuyInDocument;

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

export function publicDocument<T extends PokerDocument>(
  document: T,
): Omit<T, 'id' | 'type' | '_etag'> {
  return Object.fromEntries(
    Object.entries(document).filter(
      ([key]) => key !== 'id' && key !== 'type' && !key.startsWith('_'),
    ),
  ) as Omit<T, 'id' | 'type' | '_etag'>;
}
