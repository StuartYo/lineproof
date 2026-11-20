import './style.css';
import devCases from '../eval/dev.json';
import extCases from '../eval/external.json';
import holdCases from '../eval/holdout.json';
import recorded from './recorded.json';
import results from '../results.json';
import { decide } from './core/pipeline.js';
import { parseJSON } from './core/prompts.js';
import { PRESETS } from './core/presets.js';
import { CAT_LABEL, CONNECTOR_LABEL, RULES } from './core/rules.js';
import { keywordFacts } from './core/keyword.js';
import { plainError } from './errors.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SETS = { dev: devCases, external: extCases, holdout: holdCases };
const MEANING = {
  LEAD: 'Part of this line is lead. It goes on the replacement list.',
  GRR: 'Galvanized pipe that is or may have been downstream of lead. It must be replaced like a lead line.',
  UNKNOWN: 'The records do not settle it. The line must be identified before the replacement deadline.',
  NON_LEAD: 'Records show neither side is lead or galvanized requiring replacement.',
};
const KIND_LABEL = {
  tap_card: 'Tap card', permit: 'Plumbing permit', work_order: 'Work order', meter_record: 'Meter record', gis: 'Inventory / GIS',
  main_record: 'Main record', field_check: 'Field check', ordinance: 'Local rule', staff_statement: 'Staff statement',
  customer_report: 'Customer report', prediction: 'Prediction model',
};
const PRESET_LABEL = { federal: 'Federal ban date (June 19, 1988)', california: 'California (Jan 1, 1986)', vermont: 'Vermont (July 1, 1989)' };

const state = {
  mode: 'recorded', set: 'dev', id: devCases[0].id,
  over: {}, // per case: {skip:Set, preset, approved}
  live: null, // {item, reply}
};

function caseOver(c) {
  if (!state.over[c.id]) {
    const p = typeof c.settings === 'string' ? c.settings : 'federal';
    state.over[c.id] = { skip: new Set(), preset: p === 'federal_approved' ? 'federal' : p, approved: p === 'federal_approved' };
  }
  return state.over[c.id];
}
function settingsFor(o) { return { ...PRESETS[o.preset], approved_other_sources: o.approved }; }
function run(c, reply) {
  const o = caseOver(c);
  return decide(c, reply, settingsFor(o), o.skip);
}
const rec = (id) => recorded.results?.[id] || {};
const keywordCat = (c) => decide(c, JSON.stringify(keywordFacts(c.docs)), settingsFor(caseOver(c))).category;
const RECORDED_NOTE = 'Saved replies: every model output on this tab is what Gemma 4 E2B returned in the test run on November 20, 2026. Nothing is generated while you click; the quote checker and the rules run live. To run the model yourself, use the second tab.';

// ---------- left column ----------
function renderList() {
  const cases = SETS[state.set];
  const counts = { LEAD: [0, 0], GRR: [0, 0], UNKNOWN: [0, 0], NON_LEAD: [0, 0] };
  let missed = 0;
  $('#linelist').innerHTML = cases.map((c) => {
    const r = run(c, rec(c.id).extract);
    const plain = parseJSON(rec(c.id).plain)?.category;
    if (counts[plain]) counts[plain][0]++;
    counts[r.category][1]++;
    if (plain === 'NON_LEAD' && (c.label.category === 'LEAD' || c.label.category === 'GRR')) missed++;
    return `<li><button data-id="${c.id}" aria-current="${state.mode === 'recorded' && c.id === state.id}">
      <span class="addr">${esc(c.title)}<small>${c.docs.length} record${c.docs.length > 1 ? 's' : ''}</small></span>
      <span class="cat ${r.category}">${shortCat(r.category)}</span></button></li>`;
  }).join('');
  $('#tally').innerHTML = `<table><thead><tr><th>Category</th><th>Gemma</th><th>LineProof</th></tr></thead><tbody>
    ${Object.keys(counts).map((k) => `<tr><td><span class="cat ${k}">${shortCat(k)}</span></td><td>${counts[k][0]}</td><td>${counts[k][1]}</td></tr>`).join('')}
    <tr class="sum"><td>Lead or GRR called non-lead</td><td>${missed}</td><td>${cases.filter((c) => run(c, rec(c.id).extract).category === 'NON_LEAD' && ['LEAD', 'GRR'].includes(c.label.category)).length}</td></tr>
    </tbody></table>`;
  document.querySelectorAll('.filter .chipbtn').forEach((b) => b.classList.toggle('on', b.dataset.set === state.set));
}
const shortCat = (k) => ({ LEAD: 'Lead', GRR: 'GRR', UNKNOWN: 'Unknown', NON_LEAD: 'Non-lead' }[k] || k);

// ---------- middle column ----------
function highlight(text, marks) {
  // marks: [{quote, cls}] ; find each quote case-insensitively and wrap it.
  const spans = [];
  const low = text.toLowerCase();
  for (const m of marks) {
    const q = m.quote.toLowerCase().trim();
    if (!q) continue;
    const i = low.indexOf(q);
    if (i >= 0 && !spans.some((s) => i < s.e && i + q.length > s.b)) spans.push({ b: i, e: i + q.length, cls: m.cls });
  }
  spans.sort((a, b) => a.b - b.b);
  let out = '', at = 0;
  for (const s of spans) { out += esc(text.slice(at, s.b)) + `<mark class="${s.cls}">${esc(text.slice(s.b, s.e))}</mark>`; at = s.e; }
  return out + esc(text.slice(at));
}

function renderDocs(c, r) {
  const o = caseOver(c);
  $('#rec-title').textContent = c.title;
  $('#rec-sub').textContent = state.mode === 'live' ? 'Your records' : ({ external: 'Records restating a published example', holdout: 'Made-up records, written blind' }[state.set] || 'Made-up records');
  $('#docs').innerHTML = c.docs.map((d) => {
    const marks = [
      ...r.kept.map((f, i) => (f.doc === d.id ? { quote: f.quote, cls: o.skip.has(i) ? 'off' : '' } : null)).filter(Boolean),
      ...r.dropped.filter((f) => f.doc === d.id && f.quote).map((f) => ({ quote: String(f.quote), cls: 'dropped' })),
    ];
    return `<article class="doc"><div class="doc-head"><span><b>${d.id}</b> ${esc(d.title)}</span><span class="kind">${esc(KIND_LABEL[d.kind] || d.kind)}${d.date ? ' · ' + esc(d.date) : ''}</span></div>
      <div class="doc-body">${highlight(d.text, marks)}</div></article>`;
  }).join('');
}

// ---------- right column ----------
function pipeSvg(r) {
  const col = { LEAD: '#A1271B', GRR: '#A15C07', UNKNOWN: '#8C96A0', NON_LEAD: '#1F6B3A' };
  const s = r.sides.system.status, cu = r.sides.customer.status;
  const conn = r.connector === 'LEAD' ? '#A1271B' : r.connector === 'NOT_LEAD' ? '#1F6B3A' : '#C9CDD1';
  return `<svg class="pipe" viewBox="0 0 560 96" role="img" aria-label="System side ${CAT_LABEL[s]}, customer side ${CAT_LABEL[cu]}, connector ${CONNECTOR_LABEL[r.connector]}">
    <rect x="4" y="22" width="18" height="44" rx="3" fill="#3E4C57"/><text x="13" y="86" text-anchor="middle">Main</text>
    <rect x="22" y="38" width="40" height="12" fill="${conn}"/><text x="42" y="16" text-anchor="middle">Connector</text>
    <rect x="62" y="36" width="210" height="16" rx="2" fill="${col[s]}"/><text x="167" y="16" text-anchor="middle" class="seglabel">System side: ${shortCat(s)}</text>
    <rect x="270" y="28" width="22" height="32" rx="3" fill="#FFFFFF" stroke="#3E4C57" stroke-width="2"/><text x="281" y="86" text-anchor="middle">Curb stop / meter</text>
    <rect x="292" y="36" width="210" height="16" rx="2" fill="${col[cu]}"/><text x="397" y="16" text-anchor="middle" class="seglabel">Customer side: ${shortCat(cu)}</text>
    <path d="M504 62 L504 30 L530 14 L556 30 L556 62 Z" fill="#FFFFFF" stroke="#3E4C57" stroke-width="2"/><text x="530" y="86" text-anchor="middle">House</text>
  </svg>`;
}

function renderVerdict(c, r, extra) {
  const o = caseOver(c);
  const plain = parseJSON(extra.plain)?.category;
  const rules = parseJSON(extra.rules)?.category;
  const want = c.label?.category;
  const mark = (v) => !want ? '' : v === want ? '<span class="mark ok">matches expected</span>' : `<span class="mark bad">${v ? 'does not match' : 'no answer'}</span>`;
  const kw = state.mode === 'live' ? null : keywordCat(c);
  const compare = state.mode === 'live' ? '' : `<div class="compare">
      <div><span class="lbl">Gemma 4 alone</span>${plain ? `<span class="cat ${plain}">${shortCat(plain)}</span>` : '<span class="muted">no answer</span>'}${mark(plain)}</div>
      <div><span class="lbl">Gemma with all rules pasted</span>${rules ? `<span class="cat ${rules}">${shortCat(rules)}</span>` : '<span class="muted">no answer</span>'}${mark(rules)}</div>
      <div><span class="lbl">No model: keywords + same rules</span><span class="cat ${kw}">${shortCat(kw)}</span>${mark(kw)}</div>
      <div><span class="lbl">Expected</span><span class="cat ${want}">${shortCat(want)}</span>${c.source ? `<span class="src">${linkify(c.source)}</span>` : '<span class="src">From the labeling guide</span>'}</div>
    </div>`;
  const facts = r.kept.length ? `<table class="facts"><thead><tr><th>Use</th><th>Side</th><th>Fact</th><th>Quote</th><th class="doccol">Record</th></tr></thead><tbody>
      ${r.kept.map((f, i) => `<tr class="${o.skip.has(i) ? 'off' : ''}"><td><input type="checkbox" data-fact="${i}" ${o.skip.has(i) ? '' : 'checked'} aria-label="Use this fact"></td>
        <td>${esc(f.part)}</td><td>${esc(f.material.replace(/_/g, ' '))}, ${esc(f.event)}${f.date ? ' ' + esc(f.date) : ''}${f.basis === 'needs_approval' ? ' <span class="muted">(needs state approval)</span>' : ''}${f.note ? `<br><span class="muted">Checker: ${esc(f.note)}</span>` : ''}${f.model_part !== f.part ? `<br><span class="muted">Checker: side set from the record (model said ${esc(f.model_part)})</span>` : ''}</td>
        <td class="q">"${esc(f.quote)}"</td><td class="doccol">${esc(f.doc)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">The model returned no usable facts.</p>';
  const dropped = r.dropped.length ? `<ul class="dropped">${r.dropped.map((f) => `<li>Dropped "${esc(f.quote || '')}" (${esc(f.material || '?')}): ${esc(f.why)}</li>`).join('')}</ul>` : '';
  $('#verdict').innerHTML = `<div class="verdict-body">
    <div class="big"><span class="cat ${r.category}">${CAT_LABEL[r.category]}</span><p>${MEANING[r.category]}${r.connector === 'LEAD' ? ' A lead connector is recorded and must be replaced when found.' : ''}</p></div>
    ${pipeSvg(r)}
    ${compare}
    <div class="sect"><h3>How LineProof got there</h3><ol class="steps">${r.steps.map((s) => `<li><span class="rid" title="${esc(RULES[s.rule]?.title)}">${s.rule}</span><span>${esc(s.text)}<span class="cite">${esc(RULES[s.rule]?.cite || '')}</span></span></li>`).join('')}</ol></div>
    ${r.todo.length ? `<div class="sect"><h3>What would settle it</h3><ul class="todo">${r.todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="sect"><h3>Facts the model pulled out${state.mode === 'live' ? '' : ' (saved reply)'}</h3>${facts}${dropped}</div>
    <div class="settings" role="group" aria-label="State rules">
      <label>Lead ban date <select id="preset">${Object.entries(PRESET_LABEL).map(([k, v]) => `<option value="${k}" ${o.preset === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="approved" ${o.approved ? 'checked' : ''}> State accepts staff statements, customer reports and predictions</label>
    </div>
  </div>`;
  $('#verdict').querySelectorAll('input[data-fact]').forEach((el) => el.addEventListener('change', () => {
    const i = +el.dataset.fact;
    el.checked ? o.skip.delete(i) : o.skip.add(i);
    refresh();
  }));
  $('#preset').addEventListener('change', (e) => { o.preset = e.target.value; refresh(); });
  $('#approved').addEventListener('change', (e) => { o.approved = e.target.checked; refresh(); });
}
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">source</a>');

function refresh() {
  if (state.mode === 'live') {
    if (!state.live) { $('#docs').innerHTML = ''; $('#verdict').innerHTML = '<p class="empty">Fill in the records on the left, then press "Read the records". The result shows up here.</p>'; return; }
    const r = run(state.live.item, state.live.reply);
    renderDocs(state.live.item, r);
    renderVerdict(state.live.item, r, {});
    return;
  }
  const c = SETS[state.set].find((x) => x.id === state.id) || SETS[state.set][0];
  state.id = c.id;
  const r = run(c, rec(c.id).extract);
  renderList();
  renderDocs(c, r);
  renderVerdict(c, r, rec(c.id));
}

// ---------- results ----------
function renderResults() {
  const sets = results.sets || {};
  const order = ['dev', 'external', 'holdout'].filter((k) => sets[k]);
  const head = { dev: 'District sample', external: 'EPA & state examples', holdout: 'Blind holdout' };
  const arms = ['plain', 'rules', 'keyword', 'lineproof'];
  const name = { plain: 'Gemma 4 E2B alone', rules: 'Gemma 4 E2B, all rules pasted in the prompt', keyword: 'No model: keyword reader + same rules', lineproof: 'LineProof: Gemma reads, code checks and decides' };
  if (!order.length) { $('#results-table').innerHTML = '<p class="muted">No scored runs yet.</p>'; return; }
  $('#results-sub').textContent = `Correct category out of each set, and how many Lead or GRR lines were called Non-lead (the mistake that leaves lead in the ground). Same model (${results.model}) in every row. Numbers come from results.json.`;
  $('#results-table').innerHTML = `<table class="rtable"><thead><tr><th>Method</th>${order.map((k) => `<th>${head[k]} (${sets[k].n})</th>`).join('')}</tr></thead><tbody>
    ${arms.map((a) => `<tr class="${a === 'lineproof' ? 'us' : ''}"><td>${name[a]}</td>${order.map((k) => {
      const v = sets[k].accuracy[a];
      return `<td>${v.category} / ${sets[k].n} <small>· ${v.missed_lead} missed lead</small></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
  const fz = results.frozen?.sets || {};
  const frozen = ['external', 'holdout'].filter((k) => fz[k] && sets[k]).map((k) => `${head[k]} ${fz[k].lineproof.category}/${sets[k].n} (${fz[k].lineproof.missed_lead} missed lead) frozen, ${sets[k].accuracy.lineproof.category}/${sets[k].n} fixed`).join('; ');
  $('#results-note').textContent = order.map((k) => `${head[k]}: ${sets[k].note}.`).join(' ')
    + (frozen ? ` The code was frozen at commit ${results.frozen.commit} before the EPA & state and holdout runs. The EPA & state run exposed two bugs, fixed afterwards; the table shows the fixed code on the same saved replies. LineProof, frozen vs fixed: ${frozen}.` : '')
    + " The holdout's labeling guide and the rules code are the same person's reading of the regulation, so the holdout tests how well records are read, not whether that reading of the rules is right; the EPA & state set is the check on that.";
}
function renderRules() {
  $('#rule-table').innerHTML = `<table class="rtable"><thead><tr><th>Rule</th><th style="text-align:left">What it says</th><th style="text-align:left">Source</th></tr></thead><tbody>
    ${Object.entries(RULES).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:left;font-family:var(--sans)">${esc(v.title)}</td><td style="text-align:left;font-family:var(--sans)"><small>${esc(v.cite)}</small></td></tr>`).join('')}</tbody></table>`;
}

// ---------- CSV ----------
function exportCsv() {
  const cases = SETS[state.set];
  const rows = [['id', 'address', 'category', 'system_side', 'customer_side', 'connector', 'rules_applied', 'evidence_quotes', 'to_settle']];
  for (const c of cases) {
    const r = run(c, rec(c.id).extract);
    rows.push([c.id, c.title, CAT_LABEL[r.category], CAT_LABEL[r.sides.system.status] || r.sides.system.status, CAT_LABEL[r.sides.customer.status] || r.sides.customer.status, CONNECTOR_LABEL[r.connector],
      [...new Set(r.steps.map((s) => s.rule))].join(' '), r.kept.map((f) => `${f.doc}: ${f.quote}`).join(' | '), r.todo.join(' | ')]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `lineproof-${state.set}.csv` });
  a.click();
}

// ---------- live mode ----------
const LIVE_DEFAULT = [
  { kind: 'tap_card', date: '1949', text: 'Svc to 18 Larkspur. 3/4 Pb main to curb. Set 1949.' },
  { kind: 'work_order', date: '2021-05-11', text: 'Replaced utility side LSL w/ 1" type K Cu, main to curb stop. Cust side not touched.' },
  { kind: 'field_check', date: '2024-09-03', text: 'Basement entry: house side is galv, threaded. Photo 3.' },
];
function renderLiveForm() {
  const f = $('#live-form');
  f.hidden = false;
  f.innerHTML = `${LIVE_DEFAULT.map((d, i) => `<div class="live-doc">
      <label class="muted" for="k${i}">Record D${i + 1}</label><span></span>
      <select id="k${i}" aria-label="Record type">${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input type="text" id="t${i}" value="${d.date}" aria-label="Record date" placeholder="Year or YYYY-MM-DD">
      <textarea id="x${i}" rows="2" aria-label="Record text">${esc(d.text)}</textarea></div>`).join('')}
    <div class="live-actions"><button class="primary" id="go">Read the records with Gemma 4</button><span class="stage" id="stage">Runs on your GPU. First time downloads about 2.8 GB.</span></div>`;
  $('#go').addEventListener('click', runLive);
}
async function runLive() {
  const btn = $('#go'), stage = $('#stage');
  const docs = [0, 1, 2].map((i) => ({ id: `D${i + 1}`, kind: $(`#k${i}`).value, title: KIND_LABEL[$(`#k${i}`).value], date: $(`#t${i}`).value.trim(), text: $(`#x${i}`).value.trim() })).filter((d) => d.text);
  if (!docs.length) { stage.textContent = 'Type at least one record first.'; stage.classList.add('err'); return; }
  btn.disabled = true; stage.classList.remove('err');
  try {
    stage.textContent = 'Checking for WebGPU...';
    const { webgpuStatus, loadModel, ask } = await import('./llm.js');
    const { extractAll } = await import('./core/prompts.js');
    const g = await webgpuStatus();
    if (!g.ok) throw Object.assign(new Error(g.why), { kind: 'gpu' });
    await loadModel((p) => { stage.textContent = `Loading Gemma 4: ${Math.round((p.progress || 0) * 100)}%`; });
    stage.textContent = 'Reading the records...';
    const out = await extractAll(ask, docs);
    stage.textContent = `Read in ${(out.ms / 1000).toFixed(1)} s. Quotes checked and rules applied below.`;
    const item = { id: 'live', title: 'Your service line', docs, settings: 'federal', label: {} };
    delete state.over.live;
    state.live = { item, reply: out.text };
    refresh();
  } catch (e) {
    stage.innerHTML = `${esc(plainError(e))} <a href="#desk" id="to-sample">See the test cases</a>, which show saved runs of the same model.`;
    stage.classList.add('err');
    $('#to-sample').addEventListener('click', (ev) => { ev.preventDefault(); setMode('recorded'); $('#desk').scrollIntoView(); });
  } finally { btn.disabled = false; }
}

function setMode(m) {
  state.mode = m;
  $('#tab-recorded').classList.toggle('on', m === 'recorded'); $('#tab-recorded').setAttribute('aria-selected', m === 'recorded');
  $('#tab-live').classList.toggle('on', m === 'live'); $('#tab-live').setAttribute('aria-selected', m === 'live');
  $('#modenote').textContent = m === 'live'
    ? 'Live: Gemma 4 E2B runs on your GPU through WebLLM (Chrome or Edge with WebGPU). Your records stay on this page. A small model can read the same words differently when the wording or record type changes; the checker drops any fact it cannot verify.'
    : RECORDED_NOTE;
  $('#desk .lines').hidden = m === 'live';
  if (m === 'live') { renderLiveForm(); $('#rec-title').textContent = 'Your records'; $('#rec-sub').textContent = ''; }
  else $('#live-form').hidden = true;
  $('#desk').style.gridTemplateColumns = m === 'live' ? 'minmax(0,1fr) minmax(0,1.12fr)' : '';
  refresh();
}

// ---------- wire up ----------
$('#linelist').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  state.id = b.dataset.id;
  refresh();
  if (window.innerWidth < 760) $('#verdict').scrollIntoView({ behavior: 'smooth' });
});
document.querySelectorAll('.filter .chipbtn').forEach((b) => b.addEventListener('click', () => { state.set = b.dataset.set; state.id = SETS[state.set][0].id; refresh(); }));
$('#export').addEventListener('click', exportCsv);
$('#tab-recorded').addEventListener('click', () => setMode('recorded'));
$('#tab-live').addEventListener('click', () => setMode('live'));
function openLine(id) {
  const s = Object.keys(SETS).find((k) => SETS[k].some((c) => c.id === id));
  if (!s) return false;
  state.set = s; state.id = id;
  return true;
}
document.querySelectorAll('#callout a[data-line]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  if (state.mode !== 'recorded') setMode('recorded');
  openLine(a.dataset.line); refresh();
  $(window.innerWidth < 760 ? '#verdict' : '#desk').scrollIntoView({ behavior: 'smooth' });
}));
$('#modenote').textContent = RECORDED_NOTE;
const deep = new URLSearchParams(location.search).get('line');
if (deep) openLine(deep);
renderResults();
renderRules();
refresh();
