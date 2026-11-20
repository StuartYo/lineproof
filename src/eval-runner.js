// Runs the same Gemma 4 E2B three ways on each case: as LineProof's reader, as a plain judge,
// and as a judge with every rule pasted in. Raw replies are returned untouched; scoring is in Node.
// The laptop GPU is shared, so a lost device is caught, the model reloaded and the call retried.
import { loadModel, ask, resetModel, MODEL_ID } from './llm.js';
import { extractPrompt, baselinePlainPrompt, baselineRulesPrompt, EXTRACT_SCHEMA, BASELINE_SCHEMA } from './core/prompts.js';
import { presetOf } from './core/presets.js';

const log = (s) => { document.getElementById('log').textContent += '\n' + s; console.log(s); };
const load = () => loadModel((p) => { if (p.progress === 1) log(p.text); }, { worker: false });

async function tryAsk(prompt, opts) {
  for (let i = 0; i < 4; i++) {
    try { await load(); return await ask(prompt, opts); }
    catch (e) { log(`retry ${i + 1}: ${String(e?.message || e).slice(0, 80)}`); await resetModel(); await new Promise((r) => setTimeout(r, 3000)); }
  }
  throw new Error('gave up after 4 tries');
}

window.runEval = async (items, arms = ['extract', 'plain', 'rules']) => {
  const out = [];
  for (const it of items) {
    const s = presetOf(it);
    const r = { id: it.id };
    if (arms.includes('extract')) r.extract = await tryAsk(extractPrompt(it.docs), { maxTokens: 900, schema: EXTRACT_SCHEMA });
    if (arms.includes('plain')) r.plain = await tryAsk(baselinePlainPrompt(it.docs, s), { maxTokens: 300, schema: BASELINE_SCHEMA });
    if (arms.includes('rules')) r.rules = await tryAsk(baselineRulesPrompt(it.docs, s), { maxTokens: 300, schema: BASELINE_SCHEMA });
    out.push(r);
    log(`${it.id} ` + arms.map((a) => `${a} ${r[a]?.ms}ms`).join(' '));
  }
  return { model: MODEL_ID, at: new Date().toISOString(), ua: navigator.userAgent, results: out };
};
window.__ready = true;
