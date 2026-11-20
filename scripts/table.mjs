// Rewrites the results table between the markers in README.md (and any file given) from results.json.
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const order = ['dev', 'external', 'holdout'].filter((k) => r.sets[k]);
const head = { dev: 'District sample', external: 'EPA & state examples', holdout: 'Blind holdout' };
const name = { plain: 'Gemma 4 E2B alone', rules: 'Gemma 4 E2B with all 11 rules in the prompt', keyword: 'No model: keyword reader + LineProof rules', lineproof: '**LineProof**: Gemma reads, code checks and decides' };
const lines = [
  `| Correct category (Lead or GRR called Non-lead) | ${order.map((k) => `${head[k]} (${r.sets[k].n})`).join(' | ')} |`,
  `|---|${order.map(() => '---|').join('')}`,
  ...['plain', 'rules', 'keyword', 'lineproof'].map((a) => `| ${name[a]} | ${order.map((k) => `${r.sets[k].accuracy[a].category} (${r.sets[k].accuracy[a].missed_lead})`).join(' | ')} |`),
];
const block = `<!-- results:start -->\n${lines.join('\n')}\n<!-- results:end -->`;
for (const f of ['README.md', ...process.argv.slice(2)]) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, s.replace(/<!-- results:start -->[\s\S]*?<!-- results:end -->/, block));
  console.log('table ->', f);
}
