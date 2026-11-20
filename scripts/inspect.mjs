// Prints each case: label, LineProof, the two plain-model arms, and the facts kept/dropped.
// usage: node scripts/inspect.mjs dev [onlyWrong]
import fs from 'node:fs';
import { decide } from '../src/core/pipeline.js';
import { presetOf } from '../src/core/presets.js';
import { parseJSON } from '../src/core/prompts.js';
const [set, only] = process.argv.slice(2);
const cases = Object.fromEntries(JSON.parse(fs.readFileSync(`eval/${set}.json`, 'utf8')).map((c) => [c.id, c]));
const run = JSON.parse(fs.readFileSync(`eval/runs/${set}.json`, 'utf8'));
for (const r of run.results) {
  const c = cases[r.id]; const d = decide(c, r.extract.text, presetOf(c));
  if (only && d.category === c.label.category) continue;
  console.log(r.id, 'want', c.label.category, '| LP', d.category, '| plain', parseJSON(r.plain.text)?.category, '| rules', parseJSON(r.rules.text)?.category);
  console.log('  kept', d.kept.map((f) => `${f.doc}:${f.part}:${f.material}:${f.event}:${f.date}`).join(' | '));
  if (d.dropped.length) console.log('  drop', d.dropped.map((f) => `${f.doc}:${f.material}:"${String(f.quote).slice(0, 40)}"/${f.why}`).join(' | '));
}
