import { readFile } from 'node:fs/promises';
import { CosmosClient } from '@azure/cosmos';

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error('Usage: node scripts/import-bootstrap.mjs <bootstrap.json>');
}

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
if (!endpoint || !key) {
  throw new Error('COSMOS_ENDPOINT and COSMOS_KEY are required.');
}

const parsed = JSON.parse(await readFile(inputPath, 'utf8'));
if (parsed.ok === false) {
  throw new Error(parsed.error || 'The Apps Script export reports failure.');
}
const data = parsed.data ?? parsed;
for (const collection of [
  'tables',
  'players',
  'sessions',
  'results',
  'buyIns',
]) {
  if (!Array.isArray(data[collection])) {
    throw new Error(`The export is missing the ${collection} collection.`);
  }
}
const tables = data.tables;
const players = data.players;
const sessions = data.sessions;
const results = data.results;
const buyIns = data.buyIns;
const tableIds = new Set(tables.map((table) => table.tableId));

function assertUnique(values, label) {
  const unique = new Set(values);
  if (unique.size !== values.length) {
    throw new Error(`${label} contains duplicate identifiers.`);
  }
}

function assertKnownTables(records, label) {
  const orphan = records.find((record) => !tableIds.has(record.tableId));
  if (orphan) {
    throw new Error(`${label} references unknown table ${orphan.tableId}.`);
  }
}

assertUnique(
  tables.map((table) => table.tableId),
  'Tables',
);
assertUnique(
  players.map((player) => player.playerId),
  'Players',
);
assertUnique(
  sessions.map((session) => session.sessionId),
  'Sessions',
);
assertUnique(
  buyIns.map((buyIn) => buyIn.buyInId),
  'Buy-ins',
);
assertUnique(
  results.map((result) => `${result.sessionId}:${result.playerId}`),
  'Results',
);
assertKnownTables(players, 'Players');
assertKnownTables(sessions, 'Sessions');
assertKnownTables(results, 'Results');
assertKnownTables(buyIns, 'Buy-ins');

const playerTables = new Map(
  players.map((player) => [player.playerId, player.tableId]),
);
const sessionTables = new Map(
  sessions.map((session) => [session.sessionId, session.tableId]),
);
for (const result of results) {
  if (
    playerTables.get(result.playerId) !== result.tableId ||
    sessionTables.get(result.sessionId) !== result.tableId
  ) {
    throw new Error(
      `Result has a cross-table or unknown reference: ${result.sessionId}.`,
    );
  }
}
for (const buyIn of buyIns) {
  if (
    playerTables.get(buyIn.playerId) !== buyIn.tableId ||
    sessionTables.get(buyIn.sessionId) !== buyIn.tableId
  ) {
    throw new Error(
      `Buy-in has a cross-table or unknown reference: ${buyIn.buyInId}.`,
    );
  }
}

const resultSums = new Map();
for (const result of results) {
  resultSums.set(
    result.sessionId,
    (resultSums.get(result.sessionId) ?? 0) + Number(result.net || 0),
  );
}
for (const session of sessions) {
  if (
    session.status !== 'open' &&
    Math.abs(resultSums.get(session.sessionId) ?? 0) > 0.01
  ) {
    throw new Error(`Session ${session.sessionId} does not balance to zero.`);
  }
}

const documents = [
  ...tables.map((table) => ({
    ...table,
    id: `table:${table.tableId}`,
    type: 'table',
  })),
  ...players.map((player) => ({
    ...player,
    id: `player:${player.playerId}`,
    type: 'player',
  })),
  ...sessions.map((session) => ({
    ...session,
    status: session.status === 'open' ? 'open' : 'closed',
    id: `session:${session.sessionId}`,
    type: 'session',
  })),
  ...results.map((result) => ({
    ...result,
    net: Number(result.net || 0),
    chips:
      result.chips == null || result.chips === '' ? null : Number(result.chips),
    id: `result:${result.sessionId}:${result.playerId}`,
    type: 'result',
  })),
  ...buyIns.map((buyIn) => ({
    ...buyIn,
    amount: Number(buyIn.amount || 0),
    id: `buyIn:${buyIn.buyInId}`,
    type: 'buyIn',
  })),
];

const client = new CosmosClient({ endpoint, key });
const container = client.database('pokerbankroll').container('data');
const byTable = Map.groupBy(documents, (document) => document.tableId);

for (const [tableId, tableDocuments] of byTable) {
  for (let offset = 0; offset < tableDocuments.length; offset += 100) {
    const chunk = tableDocuments.slice(offset, offset + 100);
    const response = await container.items.batch(
      chunk.map((document) => ({
        operationType: 'Upsert',
        resourceBody: document,
      })),
      tableId,
    );
    const status = response.code ?? 500;
    if (status < 200 || status >= 300) {
      throw new Error(`Import batch for ${tableId} failed with ${status}.`);
    }
  }
}

console.log(
  JSON.stringify({
    imported: documents.length,
    tables: tables.length,
    players: players.length,
    sessions: sessions.length,
    results: results.length,
    buyIns: buyIns.length,
  }),
);
