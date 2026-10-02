import {
  assertZeroSum,
  buyInDocumentId,
  MEMBER_THRESHOLD,
  nowIso,
  playerDocumentId,
  publicDocument,
  resultDocumentId,
  sessionDocumentId,
  tableDocumentId,
  uid,
  type BuyInDocument,
  type PlayerDocument,
  type PokerDocument,
  type ResultDocument,
  type ResultInput,
  type SessionDocument,
  type TableDocument,
} from './domain.js';
import {
  queryDocuments,
  readDocument,
  runBatch,
  type BatchOperation,
} from './store.js';

type Body = Record<string, unknown>;

function requiredString(body: Body, field: string): string {
  const value = String(body[field] ?? '').trim();
  if (!value) throw new Error(`${field} is required.`);
  return value;
}

function resultsFrom(body: Body): ResultInput[] {
  return Array.isArray(body.results) ? (body.results as ResultInput[]) : [];
}

async function tableDocuments<T>(
  tableId: string,
  type: string,
  extra = '',
  parameters: {
    name: string;
    value: string | number | boolean | null;
  }[] = [],
): Promise<T[]> {
  return queryDocuments(
    {
      query: `SELECT * FROM c WHERE c.tableId = @tableId AND c.type = @type${extra}`,
      parameters: [
        { name: '@tableId', value: tableId },
        { name: '@type', value: type },
        ...parameters,
      ],
    },
    tableId,
  ) as Promise<T[]>;
}

interface TableState {
  players: PlayerDocument[];
  sessions: SessionDocument[];
  results: ResultDocument[];
  buyIns: BuyInDocument[];
}

async function loadTableState(tableId: string): Promise<TableState> {
  const documents = await queryDocuments<PokerDocument>(
    {
      query: 'SELECT * FROM c WHERE c.tableId = @tableId',
      parameters: [{ name: '@tableId', value: tableId }],
    },
    tableId,
  );
  return {
    players: documents.filter(
      (document): document is PlayerDocument => document.type === 'player',
    ),
    sessions: documents.filter(
      (document): document is SessionDocument => document.type === 'session',
    ),
    results: documents.filter(
      (document): document is ResultDocument => document.type === 'result',
    ),
    buyIns: documents.filter(
      (document): document is BuyInDocument => document.type === 'buyIn',
    ),
  };
}

function requireSession(
  sessions: SessionDocument[],
  sessionId: string,
): SessionDocument {
  const session = sessions.find(
    (candidate) => candidate.sessionId === sessionId,
  );
  if (!session) throw new Error('Session not found.');
  return session;
}

async function findBuyIn(buyInId: string): Promise<BuyInDocument> {
  const documents = await queryDocuments<BuyInDocument>({
    query: 'SELECT * FROM c WHERE c.type = "buyIn" AND c.buyInId = @buyInId',
    parameters: [{ name: '@buyInId', value: buyInId }],
  });
  if (documents.length !== 1) throw new Error('Buy-in not found.');
  return documents[0];
}

async function statusOperations(
  tableId: string,
  resultDocuments: ResultDocument[],
  players?: PlayerDocument[],
): Promise<BatchOperation[]> {
  const allPlayers =
    players ?? (await tableDocuments<PlayerDocument>(tableId, 'player'));
  const sessionsByPlayer = new Map<string, Set<string>>();
  for (const result of resultDocuments) {
    const sessions = sessionsByPlayer.get(result.playerId) ?? new Set<string>();
    sessions.add(result.sessionId);
    sessionsByPlayer.set(result.playerId, sessions);
  }

  return allPlayers.flatMap((player) => {
    const nextStatus =
      (sessionsByPlayer.get(player.playerId)?.size ?? 0) >= MEMBER_THRESHOLD
        ? 'member'
        : 'guest';
    if (nextStatus === player.status) return [];
    return [
      {
        operationType: 'Replace',
        id: player.id,
        resourceBody: { ...player, status: nextStatus },
        ifMatch: player._etag,
      } satisfies BatchOperation,
    ];
  });
}

function makeResultDocuments(
  tableId: string,
  sessionId: string,
  results: ResultInput[],
): ResultDocument[] {
  return results.map((result) => ({
    id: resultDocumentId(sessionId, result.playerId),
    type: 'result',
    tableId,
    sessionId,
    playerId: result.playerId,
    net: Number(result.net) || 0,
    chips: result.chips == null ? null : Number(result.chips),
  }));
}

export async function bootstrap(tableId?: string) {
  const filter = tableId ? ' AND c.tableId = @tableId' : '';
  const parameters = tableId ? [{ name: '@tableId', value: tableId }] : [];
  const documents = await queryDocuments<PokerDocument>({
    query: `SELECT * FROM c WHERE IS_DEFINED(c.type)${filter}`,
    parameters,
  });

  return {
    tables: documents
      .filter(
        (document): document is TableDocument => document.type === 'table',
      )
      .map(publicDocument),
    players: documents
      .filter(
        (document): document is PlayerDocument => document.type === 'player',
      )
      .map(publicDocument),
    sessions: documents
      .filter(
        (document): document is SessionDocument => document.type === 'session',
      )
      .map(publicDocument),
    results: documents
      .filter(
        (document): document is ResultDocument => document.type === 'result',
      )
      .map(publicDocument),
    buyIns: documents
      .filter(
        (document): document is BuyInDocument => document.type === 'buyIn',
      )
      .map(publicDocument),
  };
}

export async function createTable(body: Body) {
  const name = requiredString(body, 'name');
  const tableId = uid('t');
  const document: TableDocument = {
    id: tableDocumentId(tableId),
    type: 'table',
    tableId,
    name,
    createdAt: nowIso(),
  };
  await runBatch(tableId, [
    { operationType: 'Create', resourceBody: document },
  ]);
  return { tableId };
}

export async function addPlayer(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const name = requiredString(body, 'name');
  const playerId = uid('p');
  const document: PlayerDocument = {
    id: playerDocumentId(playerId),
    type: 'player',
    tableId,
    playerId,
    name,
    status: 'guest',
    createdAt: nowIso(),
  };
  await runBatch(tableId, [
    { operationType: 'Create', resourceBody: document },
  ]);
  return { playerId };
}

export async function renamePlayer(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const playerId = requiredString(body, 'playerId');
  const name = requiredString(body, 'name');
  const player = await readDocument<PlayerDocument>(
    playerDocumentId(playerId),
    tableId,
  );
  await runBatch(tableId, [
    {
      operationType: 'Replace',
      id: player.id,
      resourceBody: { ...player, name },
      ifMatch: player._etag,
    },
  ]);
  return { ok: true };
}

export async function addSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const results = resultsFrom(body);
  assertZeroSum(results);
  const sessionId = uid('s');
  const session: SessionDocument = {
    id: sessionDocumentId(sessionId),
    type: 'session',
    tableId,
    sessionId,
    date: String(body.date || nowIso().slice(0, 10)),
    location: String(body.location || ''),
    notes: String(body.notes || ''),
    createdAt: nowIso(),
    status: 'closed',
  };
  const newResults = makeResultDocuments(tableId, sessionId, results);
  const existingResults = await tableDocuments<ResultDocument>(
    tableId,
    'result',
  );
  const statusChanges = await statusOperations(tableId, [
    ...existingResults,
    ...newResults,
  ]);

  await runBatch(tableId, [
    { operationType: 'Create', resourceBody: session },
    ...newResults.map(
      (result) =>
        ({
          operationType: 'Create',
          resourceBody: result,
        }) satisfies BatchOperation,
    ),
    ...statusChanges,
  ]);
  return { sessionId };
}

function makeBuyInDocument(
  tableId: string,
  sessionId: string,
  playerId: string,
  amount: unknown,
  remark: unknown,
): BuyInDocument {
  const numericAmount = amount == null ? 1000 : Number(amount);
  if (!(numericAmount > 0)) throw new Error('Buy-in amount must be positive.');
  const buyInId = uid('b');
  return {
    id: buyInDocumentId(buyInId),
    type: 'buyIn',
    tableId,
    sessionId,
    playerId: String(playerId || ''),
    buyInId,
    amount: numericAmount,
    remark: String(remark || ''),
    createdAt: nowIso(),
  };
}

export async function startSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const players = Array.isArray(body.players)
    ? (body.players as Array<Record<string, unknown>>)
    : [];
  if (players.length < 2)
    throw new Error('A session needs at least two players.');
  const sessionId = uid('s');
  const session: SessionDocument = {
    id: sessionDocumentId(sessionId),
    type: 'session',
    tableId,
    sessionId,
    date: String(body.date || nowIso().slice(0, 10)),
    location: String(body.location || ''),
    notes: String(body.notes || ''),
    createdAt: nowIso(),
    status: 'open',
  };
  const buyIns = players.map((player) =>
    makeBuyInDocument(
      tableId,
      sessionId,
      requiredString(player, 'playerId'),
      player.amount,
      player.remark,
    ),
  );
  await runBatch(tableId, [
    { operationType: 'Create', resourceBody: session },
    ...buyIns.map(
      (buyIn) =>
        ({
          operationType: 'Create',
          resourceBody: buyIn,
        }) satisfies BatchOperation,
    ),
  ]);
  return { sessionId };
}

export async function addBuyIn(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const session = await readDocument<SessionDocument>(
    sessionDocumentId(sessionId),
    tableId,
  );
  if (session.status !== 'open') throw new Error('Session is already closed.');
  const buyIn = makeBuyInDocument(
    tableId,
    sessionId,
    requiredString(body, 'playerId'),
    body.amount,
    body.remark,
  );
  await runBatch(tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: session,
      ifMatch: session._etag,
    },
    { operationType: 'Create', resourceBody: buyIn },
  ]);
  return { buyInId: buyIn.buyInId };
}

export async function editBuyIn(body: Body) {
  const buyInId = requiredString(body, 'buyInId');
  const buyIn = await findBuyIn(buyInId);
  const session = await readDocument<SessionDocument>(
    sessionDocumentId(buyIn.sessionId),
    buyIn.tableId,
  );
  if (session.status !== 'open') throw new Error('Session is already closed.');
  const amount = body.amount == null ? buyIn.amount : Number(body.amount);
  if (!(amount > 0)) throw new Error('Buy-in amount must be positive.');
  await runBatch(buyIn.tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: session,
      ifMatch: session._etag,
    },
    {
      operationType: 'Replace',
      id: buyIn.id,
      resourceBody: {
        ...buyIn,
        amount,
        remark: body.remark == null ? buyIn.remark : String(body.remark),
      },
      ifMatch: buyIn._etag,
    },
  ]);
  return { ok: true };
}

export async function deleteBuyIn(body: Body) {
  const buyIn = await findBuyIn(requiredString(body, 'buyInId'));
  const session = await readDocument<SessionDocument>(
    sessionDocumentId(buyIn.sessionId),
    buyIn.tableId,
  );
  if (session.status !== 'open') throw new Error('Session is already closed.');
  await runBatch(buyIn.tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: session,
      ifMatch: session._etag,
    },
    { operationType: 'Delete', id: buyIn.id, ifMatch: buyIn._etag },
  ]);
  return { ok: true };
}

export async function closeSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const chips = resultsFrom(body);
  if (chips.length < 2)
    throw new Error('A session needs at least two players.');
  const state = await loadTableState(tableId);
  const session = requireSession(state.sessions, sessionId);
  const buyIns = state.buyIns.filter((buyIn) => buyIn.sessionId === sessionId);
  const previousResults = state.results.filter(
    (result) => result.sessionId === sessionId,
  );
  const totals = new Map<string, number>();
  for (const buyIn of buyIns) {
    totals.set(
      buyIn.playerId,
      (totals.get(buyIn.playerId) || 0) + buyIn.amount,
    );
  }
  const results: ResultInput[] = chips.map((entry) => {
    const chipCount = Number(entry.chips) || 0;
    return {
      playerId: entry.playerId,
      chips: chipCount,
      net: chipCount - (totals.get(entry.playerId) || 0),
    };
  });
  assertZeroSum(results);
  const documents = makeResultDocuments(tableId, sessionId, results);
  const withoutSession = state.results.filter(
    (result) => result.sessionId !== sessionId,
  );
  const statusChanges = await statusOperations(
    tableId,
    [...withoutSession, ...documents],
    state.players,
  );
  const updatedSession = {
    ...session,
    date: body.date ? String(body.date) : session.date,
    location: body.location == null ? session.location : String(body.location),
    notes: body.notes == null ? session.notes : String(body.notes),
    status: 'closed' as const,
  };

  await runBatch(tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: updatedSession,
      ifMatch: session._etag,
    },
    ...previousResults.map(
      (result) =>
        ({
          operationType: 'Delete',
          id: result.id,
          ifMatch: result._etag,
        }) satisfies BatchOperation,
    ),
    ...documents.map(
      (result) =>
        ({
          operationType: 'Create',
          resourceBody: result,
        }) satisfies BatchOperation,
    ),
    ...statusChanges,
  ]);
  return { ok: true };
}

export async function reopenSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const state = await loadTableState(tableId);
  const session = requireSession(state.sessions, sessionId);
  const sessionResults = state.results.filter(
    (result) => result.sessionId === sessionId,
  );
  const statusChanges = await statusOperations(
    tableId,
    state.results.filter((result) => result.sessionId !== sessionId),
    state.players,
  );
  await runBatch(tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: { ...session, status: 'open' },
      ifMatch: session._etag,
    },
    ...sessionResults.map(
      (result) =>
        ({
          operationType: 'Delete',
          id: result.id,
          ifMatch: result._etag,
        }) satisfies BatchOperation,
    ),
    ...statusChanges,
  ]);
  return { ok: true };
}

export async function editSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const results = resultsFrom(body);
  assertZeroSum(results);
  const state = await loadTableState(tableId);
  const session = requireSession(state.sessions, sessionId);
  const previousResults = state.results.filter(
    (result) => result.sessionId === sessionId,
  );
  const documents = makeResultDocuments(tableId, sessionId, results);
  const statusChanges = await statusOperations(
    tableId,
    [
      ...state.results.filter((result) => result.sessionId !== sessionId),
      ...documents,
    ],
    state.players,
  );
  await runBatch(tableId, [
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: {
        ...session,
        date: String(body.date || session.date),
        location: String(body.location || ''),
        notes: String(body.notes || ''),
      },
      ifMatch: session._etag,
    },
    ...previousResults.map(
      (result) =>
        ({
          operationType: 'Delete',
          id: result.id,
          ifMatch: result._etag,
        }) satisfies BatchOperation,
    ),
    ...documents.map(
      (result) =>
        ({
          operationType: 'Create',
          resourceBody: result,
        }) satisfies BatchOperation,
    ),
    ...statusChanges,
  ]);
  return { ok: true };
}

export async function deleteSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const state = await loadTableState(tableId);
  const session = requireSession(state.sessions, sessionId);
  const results = state.results.filter(
    (result) => result.sessionId === sessionId,
  );
  const buyIns = state.buyIns.filter((buyIn) => buyIn.sessionId === sessionId);
  const statusChanges = await statusOperations(
    tableId,
    state.results.filter((result) => result.sessionId !== sessionId),
    state.players,
  );
  await runBatch(tableId, [
    { operationType: 'Delete', id: session.id, ifMatch: session._etag },
    ...results.map(
      (result) =>
        ({
          operationType: 'Delete',
          id: result.id,
          ifMatch: result._etag,
        }) satisfies BatchOperation,
    ),
    ...buyIns.map(
      (buyIn) =>
        ({
          operationType: 'Delete',
          id: buyIn.id,
          ifMatch: buyIn._etag,
        }) satisfies BatchOperation,
    ),
    ...statusChanges,
  ]);
  return { ok: true };
}

export async function dispatch(action: string, body: Body) {
  switch (action) {
    case 'verifyPin':
      return { ok: true };
    case 'createTable':
      return createTable(body);
    case 'addPlayer':
      return addPlayer(body);
    case 'renamePlayer':
      return renamePlayer(body);
    case 'addSession':
      return addSession(body);
    case 'startSession':
      return startSession(body);
    case 'addBuyIn':
      return addBuyIn(body);
    case 'editBuyIn':
      return editBuyIn(body);
    case 'deleteBuyIn':
      return deleteBuyIn(body);
    case 'closeSession':
      return closeSession(body);
    case 'reopenSession':
      return reopenSession(body);
    case 'editSession':
      return editSession(body);
    case 'deleteSession':
      return deleteSession(body);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
