// The deterministic part. The model never decides a category: it only hands back facts with quotes.
// Every step here cites the rule it applies (see RULES below and README "How it decides").

export const CATEGORIES = ['LEAD', 'GRR', 'UNKNOWN', 'NON_LEAD'];
export const CAT_LABEL = { LEAD: 'Lead', GRR: 'Galvanized requiring replacement', UNKNOWN: 'Lead status unknown', NON_LEAD: 'Non-lead' };
export const CONNECTOR_LABEL = { LEAD: 'Lead connector', NOT_LEAD: 'Non-lead connector', UNKNOWN: 'No connector record' };

export const RULES = {
  R01: { title: 'Any lead portion makes the whole line Lead', cite: '40 CFR 141.2, "lead service line"' },
  R02: { title: 'Two sides combine into one category (Lead > GRR > Unknown > Non-lead)', cite: '40 CFR 141.84(d)(6)(iii)(A), table 2' },
  R03: { title: 'Lead-lined galvanized counts as Lead', cite: '40 CFR 141.2, "lead service line"' },
  R04: { title: 'A lead connector (gooseneck, pigtail, up to 3 ft) is not part of the service line', cite: '40 CFR 141.2, "connector"; 141.84(a)(2)(ii)' },
  R05: { title: 'Galvanized that is or ever was downstream of lead, or is downstream of unknown, is GRR', cite: '40 CFR 141.2, "galvanized requiring replacement"' },
  R06: { title: 'Galvanized with no proof it was never downstream of lead is presumed GRR', cite: '40 CFR 141.2, "galvanized requiring replacement"' },
  R07: { title: 'Galvanized with proof of a never-lead upstream is Non-lead', cite: 'EPA 815-F-25-005 p.4; EPA 816-B-22-001 p.6-5' },
  R08: { title: 'Non-lead needs an evidence-based record; no evidence means Unknown', cite: '40 CFR 141.84(a)(3)(iii)-(iv)' },
  R09: { title: 'A record of installation after the lead ban date makes that side Non-lead', cite: '40 CFR 141.84(b)(5)(i)' },
  R10: { title: 'Unresolved conflicting records: Lead if any source says lead, otherwise Unknown', cite: 'EPA 816-B-22-001 p.6-5 (EPA recommendation)' },
  R11: { title: 'An unknown side keeps the line Unknown until it is identified', cite: '40 CFR 141.84(b)(1)(i); table 2' },
  R12: { title: 'Staff memory, customer reports and predictive models count only if the state approved them', cite: 'EPA 815-F-25-005 p.1, p.3' },
};

// Document kinds the utility files records under. The basis is set by the file type, not by the model.
export const DOC_BASIS = {
  tap_card: 'record', permit: 'record', work_order: 'record', meter_record: 'record', gis: 'record', main_record: 'record',
  field_check: 'field_check', ordinance: 'ordinance',
  staff_statement: 'needs_approval', customer_report: 'needs_approval', prediction: 'needs_approval',
};

export const MATERIALS = ['lead', 'lead_lined_galvanized', 'galvanized', 'copper', 'plastic', 'iron', 'brass', 'not_lead', 'unknown'];
const NON_LEAD_MATS = new Set(['copper', 'plastic', 'iron', 'brass', 'not_lead']);

export const DEFAULT_SETTINGS = { ban_date: '1988-06-19', ban_label: 'Federal (June 19, 1988)', approved_other_sources: false };

// ---------- dates ----------
// A date is kept as {lo, hi}: the earliest and latest day it could mean. "1987" = 1987-01-01..1987-12-31.
export function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { lo: t, hi: t, text: t };
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return { lo: `${m[1]}-${m[2]}-01`, hi: `${m[1]}-${m[2]}-31`, text: t };
  m = t.match(/^(\d{4})$/);
  if (m && +m[1] > 1850 && +m[1] < 2100) return { lo: `${m[1]}-01-01`, hi: `${m[1]}-12-31`, text: t };
  return null;
}
const surelyAfter = (d, iso) => d && d.lo > iso;
const sortKey = (d) => (d ? d.lo : '0000');

// ---------- the classifier ----------
/**
 * facts: checked facts (see verify.js), each {doc, part, material, event, date, quote, basis, eff}
 * settings: {ban_date, ban_label, approved_other_sources}
 * returns {category, connector, sides, steps, todo, counted, ignored}
 */
export function classify(facts, settings = DEFAULT_SETTINGS) {
  const steps = [];
  const todo = [];
  const step = (rule, text) => steps.push({ rule, text });

  const counted = [];
  const ignored = [];
  for (const f of facts) {
    if (f.basis === 'needs_approval' && !settings.approved_other_sources) {
      ignored.push({ ...f, why: 'R12' });
    } else counted.push(f);
  }
  if (ignored.length) step('R12', `${ignored.length} fact(s) from staff memory, customer reports or a prediction are set aside: this state has not approved those sources.`);

  // Building dates are never service line dates.
  const building = counted.filter((f) => f.part === 'building');
  if (building.length) step('R09', `The building date (${building[0].date || building[0].eff?.text || 'given'}) is not the service line's date, so it is not used.`);

  // Expand "whole line" facts to both sides.
  const bySide = { system: [], customer: [] };
  for (const f of counted) {
    if (f.basis === 'ordinance') continue;
    if (f.part === 'system' || f.part === 'whole') bySide.system.push(f);
    if (f.part === 'customer' || f.part === 'whole') bySide.customer.push(f);
  }
  const ordinances = counted.filter((f) => f.basis === 'ordinance');

  // Connector (R04)
  const conn = counted.filter((f) => f.part === 'connector' && f.material !== 'unknown' && f.event !== 'removed');
  let connector = 'UNKNOWN';
  if (conn.length) {
    const latest = conn.slice().sort((a, b) => sortKey(b.eff).localeCompare(sortKey(a.eff)))[0];
    connector = latest.material === 'lead' ? 'LEAD' : 'NOT_LEAD';
    step('R04', connector === 'LEAD'
      ? 'A lead connector is recorded. It is listed on its own and does not make the service line Lead; it must be replaced when found.'
      : 'The connector on record is not lead.');
  }

  // A local rule that banned lead pipe counts as a ban date too (R09: "or after the compliance date of a State or local law").
  const localBans = ordinances.filter((o) => o.eff && (NON_LEAD_MATS.has(o.material) || o.material === 'galvanized'));
  if (localBans.length) {
    const first = localBans.slice().sort((a, b) => a.eff.hi.localeCompare(b.eff.hi))[0];
    if (first.eff.hi < settings.ban_date) {
      settings = { ...settings, ban_date: first.eff.hi, ban_label: `local rule of ${first.eff.text}` };
      step('R09', `A local rule from ${first.eff.text} allowed only non-lead pipe ("${short(first.quote)}"). Installations after it count as after the ban.`);
    }
  }

  const sides = {};
  for (const side of ['system', 'customer']) sides[side] = sideStatus(side, bySide[side], settings, step, todo);

  // Galvanized customer side: R05 / R06 / R07
  for (const side of ['customer', 'system']) {
    const s = sides[side];
    if (s.status !== 'GALV') continue;
    if (side === 'system') {
      s.status = 'NON_LEAD';
      step('R05', 'The system side is galvanized. Nothing upstream of it is a service line, so it is Non-lead.');
      continue;
    }
    const up = sides.system;
    if (up.status === 'LEAD' || up.everLead) {
      s.status = 'GRR';
      step('R05', up.status === 'LEAD' ? 'The customer side is galvanized and sits downstream of a lead system side: GRR.' : 'The customer side is galvanized and the system side was lead at some point: GRR.');
    } else if (up.status === 'UNKNOWN') {
      s.status = 'GRR';
      step('R05', 'The customer side is galvanized and the system side is unknown: GRR.');
      todo.push('Identify the system side. If it is shown to have never been lead, the galvanized customer side can become Non-lead.');
    } else {
      const proof = neverLeadProof(up, ordinances, settings);
      if (proof) {
        s.status = 'NON_LEAD';
        step('R07', `The customer side is galvanized, and ${proof}. Non-lead.`);
      } else {
        s.status = 'GRR';
        step('R06', 'The customer side is galvanized. The system side is not lead today, but no record shows it was never lead, so the galvanized side is presumed GRR.');
        todo.push('Find the original installation record for the system side (or a local rule that only allowed non-lead pipe). That would move the line to Non-lead.');
      }
    }
  }

  // Combine (R02, R01, R11)
  const order = ['LEAD', 'GRR', 'UNKNOWN', 'NON_LEAD'];
  const sys = sides.system.status, cus = sides.customer.status;
  const category = order[Math.min(order.indexOf(sys), order.indexOf(cus))];
  const rule = category === 'LEAD' ? 'R01' : category === 'UNKNOWN' ? 'R11' : 'R02';
  step(rule, `System side ${CAT_LABEL[sys]}, customer side ${CAT_LABEL[cus]}: the line is ${CAT_LABEL[category]}.`);

  if (ignored.length && category !== 'LEAD') todo.push('Ask the state primacy agency whether staff statements, customer reports or the prediction model can be used; they are set aside for now.');
  return { category, connector, sides, steps, todo: [...new Set(todo)], counted, ignored };
}

function sideStatus(side, facts, settings, step, todo) {
  const name = side === 'system' ? 'System side' : 'Customer side';
  const mats = facts.filter((f) => f.material !== 'unknown' && f.part !== 'building');
  const everLead = mats.some((f) => f.material === 'lead' || f.material === 'lead_lined_galvanized');
  // A later record that a pipe was removed retires older records of that material (fix after the frozen run, ext02).
  const kindOf = (m) => (m === 'lead' || m === 'lead_lined_galvanized' ? 'lead' : m === 'galvanized' ? 'galv' : 'non');
  const removals = mats.filter((f) => f.event === 'removed');
  const current = mats.filter((f) => f.event !== 'removed' && !removals.some((r) => kindOf(r.material) === kindOf(f.material) && sortKey(r.eff) > sortKey(f.eff)));
  const out = { status: 'UNKNOWN', everLead, current: null, installDate: null, origin: null, facts };

  // Install dates (with or without material) for R09 and R07.
  const dated = facts.filter((f) => f.event === 'installed' && f.eff);
  if (dated.length) out.installDate = dated.map((f) => f.eff).sort((a, b) => a.lo.localeCompare(b.lo)).at(-1);

  if (!current.length) {
    // No material on record. A post-ban installation record still settles it (R09).
    if (dated.length) {
      const d = out.installDate;
      if (surelyAfter(d, settings.ban_date)) {
        out.status = 'NON_LEAD';
        out.origin = 'date';
        step('R09', `${name}: installed ${d.text}, after the lead ban date (${settings.ban_label}). Non-lead.`);
        return out;
      }
      step('R09', `${name}: installed ${d.text}, which is not clearly after the lead ban date (${settings.ban_label}), so the date alone does not settle it.`);
    }
    if (everLead) {
      out.status = 'UNKNOWN';
      step('R08', `${name}: lead was removed, but no record says what replaced it. Unknown.`);
      todo.push(`${name}: find the replacement work order or check the pipe on site.`);
      return out;
    }
    step('R08', `${name}: no record of the pipe material. Unknown.`);
    todo.push(`${name}: a tap card, permit, work order or field check naming the material would settle it.`);
    return out;
  }

  // Order by date. A newer installation replaces what came before; a newer observation that disagrees
  // with an older record without a replacement record is a conflict (R10).
  const sorted = current.slice().sort((a, b) => sortKey(a.eff).localeCompare(sortKey(b.eff)));
  const groups = [];
  for (const f of sorted) {
    const g = groups.at(-1);
    if (g && sortKey(g.key) === sortKey(f.eff)) g.items.push(f);
    else groups.push({ key: f.eff, items: [f] });
  }
  const latest = groups.at(-1);
  const kind = (m) => (m === 'lead' || m === 'lead_lined_galvanized' ? 'lead' : m === 'galvanized' ? 'galv' : 'non');
  const latestKinds = new Set(latest.items.map((f) => kind(f.material)));
  const replacement = latest.items.some((f) => f.event === 'installed');
  const olderKinds = new Set(groups.slice(0, -1).flatMap((g) => g.items.map((f) => kind(f.material))));

  let conflict = latestKinds.size > 1;
  if (!conflict && !replacement) {
    const k = [...latestKinds][0];
    for (const o of olderKinds) if (o !== k) conflict = true;
  }
  // Removed-lead record followed by a newer material is a replacement, not a conflict.
  const removedLead = facts.some((f) => f.event === 'removed' && kind(f.material) === 'lead');
  if (conflict && removedLead && !latestKinds.has('lead') && latestKinds.size === 1) conflict = false;

  if (conflict) {
    const all = new Set([...latestKinds, ...olderKinds]);
    if (all.has('lead')) {
      out.status = 'LEAD';
      step('R10', `${name}: the records disagree and one of them says lead. Until it is resolved, the conservative answer is Lead.`);
    } else {
      out.status = 'UNKNOWN';
      step('R10', `${name}: the records disagree about the material and none says lead. Unknown until resolved.`);
    }
    todo.push(`${name}: the records conflict. A field check at the curb stop or meter would resolve it.`);
    return out;
  }

  const f = latest.items[0];
  out.current = f.material;
  out.origin = sorted[0].event === 'installed' && !everLead && groups.length >= 1 ? 'install-record' : 'observed';
  // The earliest record is an installation record of a non-lead pipe: that shows the original material.
  out.originalNonLead = sorted[0].event === 'installed' && kind(sorted[0].material) !== 'lead' && !everLead;
  if (kind(f.material) === 'lead') {
    out.status = 'LEAD';
    step(f.material === 'lead_lined_galvanized' ? 'R03' : 'R01', `${name}: ${f.material === 'lead_lined_galvanized' ? 'lead-lined galvanized' : 'lead'} ("${short(f.quote)}").`);
  } else if (kind(f.material) === 'galv') {
    out.status = 'GALV';
  } else {
    out.status = 'NON_LEAD';
    step('R08', `${name}: ${f.material.replace('_', '-')} on record ("${short(f.quote)}").${everLead ? ' It replaced a lead pipe.' : ''}`);
  }
  return out;
}

function neverLeadProof(up, ordinances, settings) {
  if (up.originalNonLead) return 'the system side\'s original installation record names a non-lead pipe';
  if (up.installDate && surelyAfter(up.installDate, settings.ban_date) && !up.everLead) return `the system side was installed ${up.installDate.text}, after the lead ban`;
  for (const o of ordinances) {
    if (NON_LEAD_MATS.has(o.material) || o.material === 'galvanized') {
      if (!o.eff) return null;
      if (up.installDate && up.installDate.lo >= o.eff.hi) return `a local rule from ${o.eff.text} allowed only non-lead pipe and the system side went in after it`;
    }
  }
  return null;
}

const short = (q) => (q.length > 70 ? q.slice(0, 67) + '...' : q);
