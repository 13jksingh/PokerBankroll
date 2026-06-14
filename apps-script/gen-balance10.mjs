/**
 * Re-balance every night so the imbalance is distributed in multiples of 10
 * (all real poker scores are multiples of 10). Rewrites history-data.json's
 * `results` from `rawResults`, keeping every night zero-sum.
 *
 *   node apps-script/gen-balance10.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = join(__dirname, 'history-data.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

/**
 * Given raw nets (each a multiple of 10) that sum to rawSum (a multiple of 10),
 * return balanced nets (multiples of 10) summing to exactly 0. The leftover
 * imbalance is shared in 10-unit steps as evenly as possible; any extra units
 * are taken from / given to the biggest winners first.
 */
function balanceTo10(raw) {
  for (const r of raw) {
    if (r[1] % 10 !== 0) throw new Error(`raw not multiple of 10: ${r}`);
  }
  const sum = raw.reduce((a, r) => a + r[1], 0);
  if (sum % 10 !== 0) throw new Error(`rawSum not multiple of 10: ${sum}`);
  const units = sum / 10; // total 10-unit chunks to remove (may be negative)
  const n = raw.length;
  const base = Math.floor(units / n);
  let rem = units - base * n; // 0 .. n-1

  // Biggest winners absorb the extra chunk first.
  const order = raw
    .map((r, i) => ({ i, net: r[1] }))
    .sort((a, b) => b.net - a.net);

  const adj = new Array(n).fill(base);
  for (let k = 0; k < rem; k++) adj[order[k].i] += 1;

  const balanced = raw.map((r, i) => [r[0], r[1] - adj[i] * 10]);
  const check = balanced.reduce((a, r) => a + r[1], 0);
  if (check !== 0) throw new Error(`balance failed, sum ${check}`);
  return balanced;
}

let changed = 0;
for (const s of data.sessions) {
  const raw = s.rawResults || s.results;
  const balanced = balanceTo10(raw);
  const before = JSON.stringify(s.results);
  s.results = balanced;
  s.rawSum = raw.reduce((a, r) => a + r[1], 0);
  if (JSON.stringify(s.results) !== before) changed++;
  const adjStr = balanced
    .map((r, i) => `${r[0]} ${raw[i][1]}→${r[1]}`)
    .join(', ');
  console.log(`${s.date} (rawSum ${s.rawSum}): ${adjStr}`);
}

data.note =
  "Extracted from 'WhatsApp Chat with JAcK.txt'. The original hand-recorded " +
  'nightly tallies did not sum to zero, so each night\u2019s leftover imbalance ' +
  'has been distributed among that night\u2019s players in multiples of 10 ' +
  '(all scores are multiples of 10) to make every night a true zero-sum game. ' +
  "'results' are the balanced nets that get uploaded; 'rawResults' preserves " +
  'the exact numbers from the chat for audit. 13 Jun is intentionally omitted ' +
  '(already in the system).';

writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const grand = data.sessions
  .flatMap((s) => s.results)
  .reduce((a, r) => a + r[1], 0);
console.log(`\nRewrote ${changed} night(s). Grand total = ${grand}`);
