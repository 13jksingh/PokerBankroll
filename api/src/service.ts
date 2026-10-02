import { createHash } from 'node:crypto';
import {
  assertZeroSum,
  assertPositiveInteger,
  buyInDocumentId,
  chipsToMoneyPaise,
  commandDocumentId,
  MEMBER_THRESHOLD,
  moneyPaiseToChips,
  nowIso,
  playerDocumentId,
  publicDocument,
  resultDocumentId,
  sessionDocumentId,
  tableDocumentId,
  uid,
  walletDocumentId,
  walletTransactionDocumentId,
  type BuyInDocument,
  type CommandDocument,
  type PlayerDocument,
  type PokerDocument,
  type ResultDocument,
  type ResultInput,
  type SessionDocument,
  type TableDocument,
  type WalletDocument,
  type WalletTransactionDocument,
  type WalletTransactionType,
} from './domain.js';
import {
  deletePartition,
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
  tables: TableDocument[];
  players: PlayerDocument[];
  sessions: SessionDocument[];
  results: ResultDocument[];
  buyIns: BuyInDocument[];
  wallets: WalletDocument[];
  walletTransactions: WalletTransactionDocument[];
  commands: CommandDocument[];
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
    tables: documents.filter(
      (document): document is TableDocument => document.type === 'table',
    ),
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
    wallets: documents.filter(
      (document): document is WalletDocument => document.type === 'wallet',
    ),
    walletTransactions: documents.filter(
      (document): document is WalletTransactionDocument =>
        document.type === 'walletTransaction',
    ),
    commands: documents.filter(
      (document): document is CommandDocument => document.type === 'command',
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

function requireTable(state: TableState, tableId: string): TableDocument {
  const table = state.tables.find((candidate) => candidate.tableId === tableId);
  if (!table) throw new Error('Table not found.');
  if (table.deleting) throw new Error('Table deletion is in progress.');
  return table;
}

function tableGuardOperation(table: TableDocument): BatchOperation {
  return {
    operationType: 'Replace',
    id: table.id,
    resourceBody: table,
    ifMatch: table._etag,
  };
}

function isWalletTable(table: TableDocument): boolean {
  return table.mode === 'wallet';
}

function requireWalletTable(state: TableState, tableId: string): TableDocument {
  const table = requireTable(state, tableId);
  if (!isWalletTable(table)) {
    throw new Error('Wallets are not enabled for this table.');
  }
  return table;
}

function requireWallet(state: TableState, playerId: string): WalletDocument {
  const wallet = state.wallets.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!wallet) throw new Error('Player wallet not found.');
  return wallet;
}

function walletTransaction(
  tableId: string,
  playerId: string,
  transactionType: WalletTransactionType,
  chips: number,
  options: {
    moneyPaise?: number | null;
    sessionId?: string | null;
    buyInId?: string | null;
    remark?: string;
  } = {},
): WalletTransactionDocument {
  const transactionId = uid('wtx');
  return {
    id: walletTransactionDocumentId(transactionId),
    type: 'walletTransaction',
    tableId,
    transactionId,
    playerId,
    transactionType,
    chips,
    moneyPaise: options.moneyPaise ?? null,
    sessionId: options.sessionId ?? null,
    buyInId: options.buyInId ?? null,
    remark: String(options.remark || ''),
    createdAt: nowIso(),
  };
}

function walletUpdate(wallet: WalletDocument, delta: number): WalletDocument {
  const balance = wallet.balance + delta;
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(balance)) {
    throw new Error('Wallet chip amount is invalid.');
  }
  if (balance < 0) {
    throw new Error(
      `Insufficient wallet balance (available ${wallet.balance} chips).`,
    );
  }
  return { ...wallet, balance, updatedAt: nowIso() };
}

function walletReplaceOperation(wallet: WalletDocument): BatchOperation {
  return {
    operationType: 'Replace',
    id: wallet.id,
    resourceBody: wallet,
    ifMatch: wallet._etag,
  };
}

function transactionCreateOperation(
  transaction: WalletTransactionDocument,
): BatchOperation {
  return { operationType: 'Create', resourceBody: transaction };
}

function operationIdFromBody(body: Body, required: boolean): string {
  const supplied = String(body.operationId || '');
  const operationId = supplied || (required ? '' : `legacy_${uid('op')}`);
  if (!operationId) throw new Error('operationId is required.');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(operationId)) {
    throw new Error('operationId is invalid.');
  }
  return operationId;
}

function commandFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function replayedCommand<T extends Record<string, unknown>>(
  state: TableState,
  operationId: string,
  action: CommandDocument['action'],
  fingerprint: string,
): T | null {
  const existing = state.commands.find(
    (command) => command.operationId === operationId,
  );
  if (!existing) return null;
  if (existing.action !== action || existing.fingerprint !== fingerprint) {
    throw new Error('operationId was already used for a different request.');
  }
  return existing.result as T;
}

async function executeCommand<T extends Record<string, unknown>>(
  state: TableState,
  tableId: string,
  operationId: string,
  action: CommandDocument['action'],
  fingerprint: string,
  result: T,
  operations: BatchOperation[],
): Promise<T> {
  const existing = replayedCommand<T>(state, operationId, action, fingerprint);
  if (existing) return existing;

  const command: CommandDocument = {
    id: commandDocumentId(operationId),
    type: 'command',
    tableId,
    operationId,
    action,
    fingerprint,
    result,
    createdAt: nowIso(),
  };
  try {
    await runBatch(tableId, [
      { operationType: 'Create', resourceBody: command },
      ...operations,
    ]);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('(409)')) {
      const committed = await readDocument<CommandDocument>(
        command.id,
        tableId,
      );
      if (
        committed.action === action &&
        committed.fingerprint === fingerprint
      ) {
        return committed.result as T;
      }
    }
    throw error;
  }
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
  const deletingTableIds = new Set(
    documents
      .filter(
        (document): document is TableDocument =>
          document.type === 'table' && document.deleting === true,
      )
      .map((table) => table.tableId),
  );
  const visibleDocuments = documents.filter(
    (document) => !deletingTableIds.has(document.tableId),
  );

  return {
    tables: visibleDocuments
      .filter(
        (document): document is TableDocument => document.type === 'table',
      )
      .map(publicDocument),
    players: visibleDocuments
      .filter(
        (document): document is PlayerDocument => document.type === 'player',
      )
      .map(publicDocument),
    sessions: visibleDocuments
      .filter(
        (document): document is SessionDocument => document.type === 'session',
      )
      .map(publicDocument),
    results: visibleDocuments
      .filter(
        (document): document is ResultDocument => document.type === 'result',
      )
      .map(publicDocument),
    buyIns: visibleDocuments
      .filter(
        (document): document is BuyInDocument => document.type === 'buyIn',
      )
      .map(publicDocument),
  };
}

export async function walletBootstrap(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const state = await loadTableState(tableId);
  requireWalletTable(state, tableId);
  return {
    wallets: state.wallets.map(publicDocument),
    walletTransactions: state.walletTransactions.map(publicDocument),
  };
}

export async function createTable(body: Body) {
  const name = requiredString(body, 'name');
  const tableId = uid('t');
  const mode = body.mode === 'wallet' ? 'wallet' : 'legacy';
  const chipsPerRupee =
    mode === 'wallet'
      ? assertPositiveInteger(body.chipsPerRupee, 'Chips per rupee')
      : undefined;
  const defaultBuyIn =
    mode === 'wallet'
      ? assertPositiveInteger(body.defaultBuyIn, 'Default buy-in')
      : undefined;
  const document: TableDocument = {
    id: tableDocumentId(tableId),
    type: 'table',
    tableId,
    name,
    createdAt: nowIso(),
    mode,
    ...(mode === 'wallet'
      ? {
          currency: 'INR' as const,
          chipsPerRupee,
          defaultBuyIn,
        }
      : {}),
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
  const table = await readDocument<TableDocument>(
    tableDocumentId(tableId),
    tableId,
  );
  if (table.deleting) throw new Error('Table deletion is in progress.');
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
    { operationType: 'Create', resourceBody: document },
  ];
  if (isWalletTable(table)) {
    const wallet: WalletDocument = {
      id: walletDocumentId(playerId),
      type: 'wallet',
      tableId,
      playerId,
      balance: 0,
      updatedAt: nowIso(),
    };
    operations.push({ operationType: 'Create', resourceBody: wallet });
  }
  await runBatch(tableId, operations);
  return { playerId };
}

export async function renamePlayer(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const playerId = requiredString(body, 'playerId');
  const name = requiredString(body, 'name');
  const table = await readDocument<TableDocument>(
    tableDocumentId(tableId),
    tableId,
  );
  if (table.deleting) throw new Error('Table deletion is in progress.');
  const player = await readDocument<PlayerDocument>(
    playerDocumentId(playerId),
    tableId,
  );
  await runBatch(tableId, [
    tableGuardOperation(table),
    {
      operationType: 'Replace',
      id: player.id,
      resourceBody: { ...player, name },
      ifMatch: player._etag,
    },
  ]);
  return { ok: true };
}

export async function deleteTable(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const confirmationName = requiredString(body, 'confirmationName');
  const state = await loadTableState(tableId);
  const table = state.tables.find((candidate) => candidate.tableId === tableId);
  if (!table) return { ok: true };
  if (confirmationName !== table.name) {
    throw new Error('Table name confirmation does not match.');
  }
  if (!table.deleting) {
    await runBatch(tableId, [
      {
        operationType: 'Replace',
        id: table.id,
        resourceBody: { ...table, deleting: true },
        ifMatch: table._etag,
      },
    ]);
  }
  await deletePartition(tableId);
  return { ok: true };
}

export async function topUpWallet(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const playerId = requiredString(body, 'playerId');
  const operationId = operationIdFromBody(body, true);
  const fingerprint = commandFingerprint({
    playerId,
    moneyPaise: Number(body.moneyPaise),
    remark: String(body.remark || ''),
  });
  const state = await loadTableState(tableId);
  const table = requireWalletTable(state, tableId);
  const replay = replayedCommand<{
    transactionId: string;
    balance: number;
  }>(state, operationId, 'topUpWallet', fingerprint);
  if (replay) return replay;
  const chipsPerRupee = table.chipsPerRupee!;
  const moneyPaise = assertPositiveInteger(body.moneyPaise, 'Money amount');
  const chips = moneyPaiseToChips(moneyPaise, chipsPerRupee);
  const wallet = requireWallet(state, playerId);
  const updatedWallet = walletUpdate(wallet, chips);
  const transaction = walletTransaction(tableId, playerId, 'top_up', chips, {
    moneyPaise,
    remark: String(body.remark || ''),
  });
  const result = {
    transactionId: transaction.transactionId,
    balance: updatedWallet.balance,
  };
  return executeCommand(
    state,
    tableId,
    operationId,
    'topUpWallet',
    fingerprint,
    result,
    [
      tableGuardOperation(table),
      walletReplaceOperation(updatedWallet),
      transactionCreateOperation(transaction),
    ],
  );
}

export async function cashOutWallet(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const playerId = requiredString(body, 'playerId');
  const operationId = operationIdFromBody(body, true);
  const fingerprint = commandFingerprint({
    playerId,
    chips: Number(body.chips),
    remark: String(body.remark || ''),
  });
  const state = await loadTableState(tableId);
  const table = requireWalletTable(state, tableId);
  const replay = replayedCommand<{
    transactionId: string;
    balance: number;
    moneyPaise: number;
  }>(state, operationId, 'cashOutWallet', fingerprint);
  if (replay) return replay;
  const chips = assertPositiveInteger(body.chips, 'Chip amount');
  const moneyPaise = chipsToMoneyPaise(chips, table.chipsPerRupee!);
  const wallet = requireWallet(state, playerId);
  const updatedWallet = walletUpdate(wallet, -chips);
  const transaction = walletTransaction(tableId, playerId, 'cash_out', -chips, {
    moneyPaise,
    remark: String(body.remark || ''),
  });
  const result = {
    transactionId: transaction.transactionId,
    balance: updatedWallet.balance,
    moneyPaise,
  };
  return executeCommand(
    state,
    tableId,
    operationId,
    'cashOutWallet',
    fingerprint,
    result,
    [
      tableGuardOperation(table),
      walletReplaceOperation(updatedWallet),
      transactionCreateOperation(transaction),
    ],
  );
}

export async function addSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const table = await readDocument<TableDocument>(
    tableDocumentId(tableId),
    tableId,
  );
  if (table.deleting) throw new Error('Table deletion is in progress.');
  if (isWalletTable(table)) {
    throw new Error('Wallet tables must record nights through Live Night.');
  }
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
    tableGuardOperation(table),
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
  const numericAmount = assertPositiveInteger(
    amount == null ? 1000 : amount,
    'Buy-in amount',
  );
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
  const state = await loadTableState(tableId);
  const table = requireTable(state, tableId);
  const operationId = operationIdFromBody(body, isWalletTable(table));
  const fingerprint = commandFingerprint({
    date: String(body.date || ''),
    location: String(body.location || ''),
    notes: String(body.notes || ''),
    players: players.map((player) => ({
      playerId: String(player.playerId || ''),
      amount: Number(player.amount ?? 1000),
      remark: String(player.remark || ''),
    })),
  });
  const replay = replayedCommand<{ sessionId: string }>(
    state,
    operationId,
    'startSession',
    fingerprint,
  );
  if (replay) return replay;
  if (players.length < 2)
    throw new Error('A session needs at least two players.');
  if (
    new Set(players.map((player) => player.playerId)).size !== players.length
  ) {
    throw new Error('A player can only be added once.');
  }
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
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
    { operationType: 'Create', resourceBody: session },
    ...buyIns.map(
      (buyIn) =>
        ({
          operationType: 'Create',
          resourceBody: buyIn,
        }) satisfies BatchOperation,
    ),
  ];
  if (isWalletTable(table)) {
    for (const buyIn of buyIns) {
      const wallet = requireWallet(state, buyIn.playerId);
      const updatedWallet = walletUpdate(wallet, -buyIn.amount);
      const transaction = walletTransaction(
        tableId,
        buyIn.playerId,
        'buy_in',
        -buyIn.amount,
        {
          sessionId,
          buyInId: buyIn.buyInId,
          remark: buyIn.remark,
        },
      );
      operations.push(
        walletReplaceOperation(updatedWallet),
        transactionCreateOperation(transaction),
      );
    }
  }
  return executeCommand(
    state,
    tableId,
    operationId,
    'startSession',
    fingerprint,
    { sessionId },
    operations,
  );
}

export async function addBuyIn(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const state = await loadTableState(tableId);
  const table = requireTable(state, tableId);
  const operationId = operationIdFromBody(body, isWalletTable(table));
  const fingerprint = commandFingerprint({
    sessionId,
    playerId: String(body.playerId || ''),
    amount: Number(body.amount ?? 1000),
    remark: String(body.remark || ''),
  });
  const replay = replayedCommand<{ buyInId: string }>(
    state,
    operationId,
    'addBuyIn',
    fingerprint,
  );
  if (replay) return replay;
  const session = requireSession(state.sessions, sessionId);
  if (session.status !== 'open') throw new Error('Session is already closed.');
  const buyIn = makeBuyInDocument(
    tableId,
    sessionId,
    requiredString(body, 'playerId'),
    body.amount,
    body.remark,
  );
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: session,
      ifMatch: session._etag,
    },
    { operationType: 'Create', resourceBody: buyIn },
  ];
  if (isWalletTable(table)) {
    const wallet = requireWallet(state, buyIn.playerId);
    const updatedWallet = walletUpdate(wallet, -buyIn.amount);
    const transaction = walletTransaction(
      tableId,
      buyIn.playerId,
      'buy_in',
      -buyIn.amount,
      {
        sessionId,
        buyInId: buyIn.buyInId,
        remark: buyIn.remark,
      },
    );
    operations.push(
      walletReplaceOperation(updatedWallet),
      transactionCreateOperation(transaction),
    );
  }
  return executeCommand(
    state,
    tableId,
    operationId,
    'addBuyIn',
    fingerprint,
    { buyInId: buyIn.buyInId },
    operations,
  );
}

export async function editBuyIn(body: Body) {
  const buyInId = requiredString(body, 'buyInId');
  const buyIn = await findBuyIn(buyInId);
  const state = await loadTableState(buyIn.tableId);
  const table = requireTable(state, buyIn.tableId);
  const session = requireSession(state.sessions, buyIn.sessionId);
  if (session.status !== 'open') throw new Error('Session is already closed.');
  const amount = body.amount == null ? buyIn.amount : Number(body.amount);
  assertPositiveInteger(amount, 'Buy-in amount');
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
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
  ];
  if (isWalletTable(table) && amount !== buyIn.amount) {
    const delta = buyIn.amount - amount;
    const wallet = requireWallet(state, buyIn.playerId);
    const updatedWallet = walletUpdate(wallet, delta);
    const transaction = walletTransaction(
      buyIn.tableId,
      buyIn.playerId,
      'buy_in_adjustment',
      delta,
      {
        sessionId: buyIn.sessionId,
        buyInId,
        remark: `Buy-in changed from ${buyIn.amount} to ${amount}`,
      },
    );
    operations.push(
      walletReplaceOperation(updatedWallet),
      transactionCreateOperation(transaction),
    );
  }
  await runBatch(buyIn.tableId, operations);
  return { ok: true };
}

export async function deleteBuyIn(body: Body) {
  const buyIn = await findBuyIn(requiredString(body, 'buyInId'));
  const state = await loadTableState(buyIn.tableId);
  const table = requireTable(state, buyIn.tableId);
  const session = requireSession(state.sessions, buyIn.sessionId);
  if (session.status !== 'open') throw new Error('Session is already closed.');
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
    {
      operationType: 'Replace',
      id: session.id,
      resourceBody: session,
      ifMatch: session._etag,
    },
    { operationType: 'Delete', id: buyIn.id, ifMatch: buyIn._etag },
  ];
  if (isWalletTable(table)) {
    const wallet = requireWallet(state, buyIn.playerId);
    const updatedWallet = walletUpdate(wallet, buyIn.amount);
    const transaction = walletTransaction(
      buyIn.tableId,
      buyIn.playerId,
      'buy_in_reversal',
      buyIn.amount,
      {
        sessionId: buyIn.sessionId,
        buyInId: buyIn.buyInId,
        remark: 'Buy-in removed',
      },
    );
    operations.push(
      walletReplaceOperation(updatedWallet),
      transactionCreateOperation(transaction),
    );
  }
  await runBatch(buyIn.tableId, operations);
  return { ok: true };
}

export async function closeSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const chips = resultsFrom(body);
  if (chips.length < 2)
    throw new Error('A session needs at least two players.');
  const state = await loadTableState(tableId);
  const table = requireTable(state, tableId);
  const session = requireSession(state.sessions, sessionId);
  if (session.status !== 'open') throw new Error('Session is already closed.');
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
  if (isWalletTable(table)) {
    const participantIds = new Set(buyIns.map((buyIn) => buyIn.playerId));
    const resultIds = new Set(results.map((result) => result.playerId));
    if (
      resultIds.size !== results.length ||
      participantIds.size !== resultIds.size ||
      [...participantIds].some((playerId) => !resultIds.has(playerId))
    ) {
      throw new Error('Final chips are required for every session player.');
    }
  }
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

  const operations: BatchOperation[] = [
    tableGuardOperation(table),
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
  ];
  if (isWalletTable(table)) {
    for (const result of results) {
      const chipCount = Number(result.chips) || 0;
      if (!Number.isSafeInteger(chipCount) || chipCount < 0) {
        throw new Error('Final chips must be a non-negative whole number.');
      }
      const wallet = requireWallet(state, result.playerId);
      const updatedWallet = walletUpdate(wallet, chipCount);
      const transaction = walletTransaction(
        tableId,
        result.playerId,
        'buy_out',
        chipCount,
        {
          sessionId,
          remark: 'Final chips credited',
        },
      );
      operations.push(
        walletReplaceOperation(updatedWallet),
        transactionCreateOperation(transaction),
      );
    }
  }
  await runBatch(tableId, operations);
  return { ok: true };
}

export async function reopenSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const state = await loadTableState(tableId);
  const table = requireTable(state, tableId);
  const session = requireSession(state.sessions, sessionId);
  if (session.status !== 'closed') throw new Error('Session is already open.');
  const sessionResults = state.results.filter(
    (result) => result.sessionId === sessionId,
  );
  const statusChanges = await statusOperations(
    tableId,
    state.results.filter((result) => result.sessionId !== sessionId),
    state.players,
  );
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
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
  ];
  if (isWalletTable(table)) {
    const buyOutNet = new Map<string, number>();
    for (const transaction of state.walletTransactions) {
      if (
        transaction.sessionId === sessionId &&
        (transaction.transactionType === 'buy_out' ||
          transaction.transactionType === 'buy_out_reversal')
      ) {
        buyOutNet.set(
          transaction.playerId,
          (buyOutNet.get(transaction.playerId) || 0) + transaction.chips,
        );
      }
    }
    for (const [playerId, creditedChips] of buyOutNet) {
      if (creditedChips === 0) continue;
      const wallet = requireWallet(state, playerId);
      const delta = -creditedChips;
      const updatedWallet = walletUpdate(wallet, delta);
      const transaction = walletTransaction(
        tableId,
        playerId,
        'buy_out_reversal',
        delta,
        {
          sessionId,
          remark: 'Session reopened',
        },
      );
      operations.push(
        walletReplaceOperation(updatedWallet),
        transactionCreateOperation(transaction),
      );
    }
  }
  await runBatch(tableId, operations);
  return { ok: true };
}

export async function editSession(body: Body) {
  const tableId = requiredString(body, 'tableId');
  const sessionId = requiredString(body, 'sessionId');
  const results = resultsFrom(body);
  assertZeroSum(results);
  const state = await loadTableState(tableId);
  const table = requireTable(state, tableId);
  if (isWalletTable(table)) {
    throw new Error('Wallet session results cannot be edited directly.');
  }
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
    tableGuardOperation(table),
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
  const table = requireTable(state, tableId);
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
  const operations: BatchOperation[] = [
    tableGuardOperation(table),
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
  ];
  if (isWalletTable(table)) {
    const sessionNet = new Map<string, number>();
    for (const transaction of state.walletTransactions) {
      if (transaction.sessionId === sessionId) {
        sessionNet.set(
          transaction.playerId,
          (sessionNet.get(transaction.playerId) || 0) + transaction.chips,
        );
      }
    }
    for (const [playerId, netChips] of sessionNet) {
      if (netChips === 0) continue;
      const wallet = requireWallet(state, playerId);
      const delta = -netChips;
      const updatedWallet = walletUpdate(wallet, delta);
      const transaction = walletTransaction(
        tableId,
        playerId,
        'session_reversal',
        delta,
        {
          sessionId,
          remark: 'Session deleted',
        },
      );
      operations.push(
        walletReplaceOperation(updatedWallet),
        transactionCreateOperation(transaction),
      );
    }
  }
  await runBatch(tableId, operations);
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
    case 'deleteTable':
      return deleteTable(body);
    case 'walletBootstrap':
      return walletBootstrap(body);
    case 'topUpWallet':
      return topUpWallet(body);
    case 'cashOutWallet':
      return cashOutWallet(body);
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
