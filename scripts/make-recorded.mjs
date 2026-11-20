// Copies the saved model replies for the two demo sets into src/recorded.json for the site.
import fs from 'node:fs';
const out = { model: null, at: null, results: {} };
for (const f of ['eval/runs/dev.json', 'eval/runs/external.json']) {
  if (!fs.existsSync(f)) continue;
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  out.model = run.model; out.at = out.at || run.at;
  for (const r of run.results) out.results[r.id] = { extract: r.extract?.text, plain: r.plain?.text, rules: r.rules?.text, ms: r.extract?.ms };
}
fs.writeFileSync('src/recorded.json', JSON.stringify(out, null, 1));
console.log('recorded', Object.keys(out.results).length);
