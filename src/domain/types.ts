export type PlayerStatus = 'guest' | 'member';

export interface Table {
  tableId: string;
  name: string;
  createdAt: string;
}

export interface Player {
  tableId: string;
  playerId: string;
  name: string;
  status: PlayerStatus;
  createdAt: string;
}

export interface Session {
  tableId: string;
  sessionId: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
  status?: 'open' | 'closed';
}

export interface Result {
  tableId: string;
  sessionId: string;
  playerId: string;
  net: number;
  chips?: number | null;
}

export interface BuyIn {
  tableId: string;
  sessionId: string;
  playerId: string;
  buyInId: string;
  amount: number;
  remark: string;
  createdAt: string;
}

export interface Standing {
  playerId: string;
  name: string;
  status: PlayerStatus;
  gamesPlayed: number;
  cumulativeNet: number;
}

/** A session with its per-player results joined to player names. */
export interface SessionDetail extends Session {
  entries: Array<{ playerId: string; name: string; net: number }>;
  playerCount: number;
}

/** Everything the app needs in one payload. */
export interface Bootstrap {
  tables: Table[];
  players: Player[];
  sessions: Session[];
  results: Result[];
  buyIns: BuyIn[];
}

export interface NewResultInput {
  playerId: string;
  net: number;
}

export interface NewSessionInput {
  tableId: string;
  date: string;
  location: string;
  notes: string;
  results: NewResultInput[];
}

/** Per-player buy-in rollup for a live session. */
export interface PlayerBuyInSummary {
  playerId: string;
  name: string;
  count: number;
  totalBuyIn: number;
  entries: BuyIn[];
}

export interface StartSessionPlayerInput {
  playerId: string;
  amount?: number;
  remark?: string;
}

export interface StartSessionInput {
  tableId: string;
  date: string;
  location: string;
  notes: string;
  players: StartSessionPlayerInput[];
}

export interface CloseSessionInput {
  tableId: string;
  sessionId: string;
  results: Array<{ playerId: string; chips: number }>;
}

/** One player's settlement line when closing a live night. */
export interface SettlementLine {
  playerId: string;
  chips: number;
  totalBuyIn: number;
  net: number;
}
