// Usage: node scripts/run-eval.mjs <run-name> eval/dev.json [eval/external.json ...]
// Needs the built site served on port 5179: `npx vite build` then `npx vite preview --port 5179`.
// Drives the installed Chrome (WebGPU on the laptop GPU) in small batches and resumes after a crash.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [name, ...files] = process.argv.slice(2);
const items = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const out = `eval/runs/${name}.json`;
const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { results: [] };
const done = new Set(res.results.map((r) => r.id));
const todo = items.filter((x) => !done.has(x.id));
const BATCH = Number(process.env.LP_BATCH || 4);
const PROFILE = process.env.LP_PROFILE || 'E:/_tmp_claude/hf26w2/profile';

for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: process.env.LP_HEADED ? false : true,
    args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--window-size=700,500'],
  });
  try {
    const page = await ctx.newPage();
    page.on('console', (m) => { const t = m.text(); if (!/powerPreference|404/.test(t)) console.log('>', t.slice(0, 160)); });
    await page.goto('http://localhost:5179/eval.html');
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const r = await Promise.race([
      page.evaluate(async (items) => await window.runEval(items), chunk),
      new Promise((_, no) => setTimeout(() => no(new Error('batch took over 20 minutes')), 20 * 60 * 1000)),
    ]);
    Object.assign(res, { model: r.model, ua: r.ua, at: res.at || r.at });
    res.results.push(...r.results);
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
  } catch (e) {
    console.log('batch failed, will retry on next run:', e.message.split('\n')[0]);
  } finally {
    await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
    try { ctx.browser()?.close(); } catch {}
  }
}
console.log('wrote', out, res.results.length, 'of', items.length);
