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
}

export interface Result {
  tableId: string;
  sessionId: string;
  playerId: string;
  net: number;
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
