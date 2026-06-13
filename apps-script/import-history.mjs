/**
 * One-time historical import for the JAcK poker table.
 *
 * Reads the validated dataset in history-data.json and posts each night to the
 * deployed Apps Script web app. Each night's balanced (true zero-sum) nets are
 * uploaded via the normal addSession path. Players that don't exist yet are
 * created automatically.
 *
 * Usage (from the project root):
 *   node apps-script/import-history.mjs --dry-run   # preview, posts nothing
 *   node apps-script/import-history.mjs             # actually upload
 *
 * Prerequisites:
 *   - VITE_API_URL must be set in .env (already is).
 *
 * Safe to re-run: it skips any night whose (date + player set) already exists
 * in the table, so it won't create duplicates.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

function readEnv() {
  const text = readFileSync(join(root, '.env'), 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.startsWith('VITE_API_URL='));
  if (!line) throw new Error('VITE_API_URL not found in .env');
  return line.slice('VITE_API_URL='.length).trim();
}

const API = readEnv();
const data = JSON.parse(readFileSync(join(__dirname, 'history-data.json'), 'utf8'));

async function get(params) {
  const url = new URL(API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { method: 'GET' });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'GET failed');
  return body.data;
}

async function post(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'POST failed');
  return body.data;
}

const norm = (s) => String(s).trim().toLowerCase();

async function main() {
  console.log(DRY ? '— DRY RUN (nothing will be uploaded) —' : '— LIVE UPLOAD —');

  const boot = await get({ action: 'bootstrap' });
  const table = boot.tables.find((t) => norm(t.name) === norm(data.tableName));
  if (!table) throw new Error(`Table "${data.tableName}" not found.`);
  const tableId = table.tableId;
  console.log(`Table "${data.tableName}" → ${tableId}`);

  // Build a name → playerId map for this table; create missing players.
  const playerId = new Map();
  for (const p of boot.players.filter((p) => p.tableId === tableId)) {
    playerId.set(norm(p.name), p.playerId);
  }

  const wantedNames = [...new Set(data.sessions.flatMap((s) => s.results.map((r) => r[0])))];
  for (const name of wantedNames) {
    if (playerId.has(norm(name))) continue;
    if (DRY) {
      console.log(`  would create player: ${name}`);
      playerId.set(norm(name), `DRY_${name}`);
    } else {
      const { playerId: pid } = await post({ action: 'addPlayer', tableId, name });
      playerId.set(norm(name), pid);
      console.log(`  created player: ${name} → ${pid}`);
    }
  }

  // Existing session signatures (date + sorted player names) to avoid dupes.
  const existing = new Set();
  const nameById = new Map(
    boot.players.filter((p) => p.tableId === tableId).map((p) => [p.playerId, norm(p.name)]),
  );
  const resultsBySession = new Map();
  for (const r of boot.results.filter((r) => r.tableId === tableId)) {
    if (!resultsBySession.has(r.sessionId)) resultsBySession.set(r.sessionId, []);
    resultsBySession.get(r.sessionId).push(r);
  }
  for (const s of boot.sessions.filter((s) => s.tableId === tableId)) {
    const names = (resultsBySession.get(s.sessionId) || [])
      .map((r) => nameById.get(r.playerId))
      .sort()
      .join(',');
    existing.add(`${String(s.date).slice(0, 10)}|${names}`);
  }

  let uploaded = 0;
  let skipped = 0;
  for (const s of data.sessions) {
    const sig = `${s.date}|${s.results.map((r) => norm(r[0])).sort().join(',')}`;
    if (existing.has(sig)) {
      console.log(`  skip (already present): ${s.date} ${s.notes || ''}`);
      skipped++;
      continue;
    }
    const sum = s.results.reduce((a, r) => a + r[1], 0);
    if (Math.abs(sum) > 0.01) {
      throw new Error(`${s.date} does not balance to zero (sum ${sum}). Re-run gen-history.`);
    }
    const payload = {
      action: 'addSession',
      tableId,
      date: s.date,
      location: '',
      notes: s.notes || '',
      results: s.results.map(([name, net]) => ({ playerId: playerId.get(norm(name)), net })),
    };
    if (DRY) {
      console.log(`  would upload: ${s.date} (${s.results.length} players, sum ${sum}) ${s.notes || ''}`);
      uploaded++;
    } else {
      const { sessionId } = await post(payload);
      console.log(`  uploaded: ${s.date} → ${sessionId} (sum ${sum})`);
      uploaded++;
    }
  }

  console.log(`\nDone. ${uploaded} night(s) ${DRY ? 'to upload' : 'uploaded'}, ${skipped} skipped.`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
