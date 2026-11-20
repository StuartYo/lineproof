// Scores saved runs and writes results.json, the single source for every number on the site, README and write-up.
// Usage: node scripts/score.mjs            (scores eval/runs/{dev,external,holdout}.json if present)
import fs from 'node:fs';
import { decide } from '../src/core/pipeline.js';
import { parseJSON } from '../src/core/prompts.js';
import { presetOf } from '../src/core/presets.js';
import { keywordFacts } from '../src/core/keyword.js';

const SETS = [
  { key: 'dev', cases: 'eval/dev.json', run: 'eval/runs/dev.json', note: 'written by me, used while building' },
  { key: 'external', cases: 'eval/external.json', run: 'eval/runs/external.json', note: 'answers from EPA and state agency worked examples' },
  { key: 'holdout', cases: 'eval/holdout.json', run: 'eval/runs/holdout.json', note: 'written blind by a separate agent from the labeling guide, first run after the code froze' },
];
const ARMS = {
  plain: 'Gemma 4 E2B alone, asked for the category',
  rules: 'Gemma 4 E2B with all 11 rules pasted into the prompt',
  keyword: 'No model: keyword matching + the same checker and rules',
  lineproof: 'LineProof: Gemma reads, code checks quotes and applies the rules',
};

const out = { generated: new Date().toISOString(), model: null, arms: ARMS, sets: {} };
for (const set of SETS) {
  if (!fs.existsSync(set.run) || !fs.existsSync(set.cases)) continue;
  const cases = JSON.parse(fs.readFileSync(set.cases, 'utf8'));
  const run = JSON.parse(fs.readFileSync(set.run, 'utf8'));
  out.model = run.model;
  const byId = Object.fromEntries(run.results.map((r) => [r.id, r]));
  const rows = [];
  for (const c of cases) {
    const r = byId[c.id];
    if (!r) continue;
    const s = presetOf(c);
    const lp = decide(c, r.extract?.text, s);
    const kw = decide(c, JSON.stringify(keywordFacts(c.docs)), s);
    const pl = parseJSON(r.plain?.text) || {};
    const ru = parseJSON(r.rules?.text) || {};
    rows.push({
      id: c.id, label: c.label.category, label_connector: c.label.connector,
      plain: pl.category || 'NO_ANSWER', rules: ru.category || 'NO_ANSWER', keyword: kw.category, lineproof: lp.category,
      plain_connector: pl.connector || 'NO_ANSWER', rules_connector: ru.connector || 'NO_ANSWER', keyword_connector: kw.connector, lineproof_connector: lp.connector,
      facts_kept: lp.kept.length, facts_dropped: lp.dropped.length, ms: r.extract?.ms,
    });
  }
  const acc = {};
  for (const a of Object.keys(ARMS)) {
    acc[a] = {
      category: rows.filter((x) => x[a] === x.label).length,
      connector: rows.filter((x) => x[`${a}_connector`] === x.label_connector).length,
      // The costly mistake: calling a line Non-lead when it is Lead or GRR.
      missed_lead: rows.filter((x) => x[a] === 'NON_LEAD' && (x.label === 'LEAD' || x.label === 'GRR')).length,
    };
  }
  const kept = rows.reduce((n, x) => n + x.facts_kept, 0), dropped = rows.reduce((n, x) => n + x.facts_dropped, 0);
  out.sets[set.key] = { n: rows.length, note: set.note, run_at: run.at, accuracy: acc, facts: { kept, dropped }, median_ms: median(rows.map((x) => x.ms).filter(Boolean)), rows };
}
// Scores of the same saved replies under the code frozen before the external and holdout runs (commit e7b9bd7).
const FROZEN = 'eval/runs/results_frozen_e7b9bd7.json';
if (fs.existsSync(FROZEN)) {
  const f = JSON.parse(fs.readFileSync(FROZEN, 'utf8'));
  out.frozen = { commit: 'e7b9bd7', sets: Object.fromEntries(Object.entries(f.sets).map(([k, v]) => [k, v.accuracy])) };
}
fs.writeFileSync('results.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.sets)) {
  if (out.frozen?.sets[k]) console.log(`${k} frozen lineproof ${out.frozen.sets[k].lineproof.category}/${v.n} miss ${out.frozen.sets[k].lineproof.missed_lead}`);
  console.log(`${k} (${v.n})  ` + Object.keys(ARMS).map((a) => `${a} ${v.accuracy[a].category}/${v.n} miss ${v.accuracy[a].missed_lead}`).join(' | '));
}
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
