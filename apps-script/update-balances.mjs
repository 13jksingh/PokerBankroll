/**
 * Update already-uploaded JAcK nights in place so their results match the
 * re-balanced (multiples-of-10) values in history-data.json. Matches each live
 * session by date + player set, then calls editSession.
 *
 *   node apps-script/update-balances.mjs <PIN> [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PIN = args.find((a) => /^\d{4}$/.test(a));
if (!PIN) {
  console.error('Provide the 4-digit PIN: node update-balances.mjs 1234');
  process.exit(1);
}

function readEnv() {
  const text = readFileSync(join(root, '.env'), 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.startsWith('VITE_API_URL='));
  if (!line) throw new Error('VITE_API_URL not found in .env');
  return line.slice('VITE_API_URL='.length).trim();
}

const API = readEnv();
const data = JSON.parse(readFileSync(join(__dirname, 'history-data.json'), 'utf8'));
const norm = (s) => String(s).trim().toLowerCase();

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

async function main() {
  console.log(DRY ? '— DRY RUN —' : '— LIVE UPDATE —');
  const boot = await get({ action: 'bootstrap' });
  const table = boot.tables.find((t) => norm(t.name) === norm(data.tableName));
  if (!table) throw new Error(`Table "${data.tableName}" not found.`);
  const tableId = table.tableId;

  const players = boot.players.filter((p) => p.tableId === tableId);
  const idByName = new Map(players.map((p) => [norm(p.name), p.playerId]));
  const nameById = new Map(players.map((p) => [p.playerId, norm(p.name)]));

  const resultsBySession = new Map();
  for (const r of boot.results.filter((r) => r.tableId === tableId)) {
    if (!resultsBySession.has(r.sessionId)) resultsBySession.set(r.sessionId, []);
    resultsBySession.get(r.sessionId).push(r);
  }

  // Map signature (date|sorted names) -> live session row.
  // Live dates are stored as UTC midnight-IST (…T18:30:00Z), so convert back
  // to the IST calendar date before comparing.
  const istDate = (v) =>
    new Date(new Date(v).getTime() + 330 * 60000).toISOString().slice(0, 10);
  const liveBySig = new Map();
  for (const s of boot.sessions.filter((s) => s.tableId === tableId)) {
    const names = (resultsBySession.get(s.sessionId) || [])
      .map((r) => nameById.get(r.playerId))
      .sort()
      .join(',');
    liveBySig.set(`${istDate(s.date)}|${names}`, s);
  }

  let updated = 0;
  let missing = 0;
  for (const s of data.sessions) {
    const sig = `${s.date}|${s.results.map((r) => norm(r[0])).sort().join(',')}`;
    const live = liveBySig.get(sig);
    if (!live) {
      console.log(`  NO MATCH: ${s.date} ${s.notes || ''}`);
      missing++;
      continue;
    }
    const sum = s.results.reduce((a, r) => a + r[1], 0);
    if (sum !== 0) throw new Error(`${s.date} not zero-sum (${sum})`);
    const results = s.results.map(([name, net]) => {
      const pid = idByName.get(norm(name));
      if (!pid) throw new Error(`Player not found live: ${name}`);
      return { playerId: pid, net };
    });
    if (DRY) {
      console.log(`  would update ${s.date} → ${live.sessionId}`);
      updated++;
      continue;
    }
    await post({
      action: 'editSession',
      pin: PIN,
      tableId,
      sessionId: live.sessionId,
      date: s.date,
      location: live.location || '',
      notes: live.notes || s.notes || '',
      results,
    });
    console.log(`  updated ${s.date} → ${live.sessionId}`);
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${missing} unmatched.`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
