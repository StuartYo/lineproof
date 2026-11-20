// Checks every fact the model hands back before the rules see it.
// A fact is thrown out when its quote is not in the named document, when the quote does not
// mention the material it claims, or when a "lead" quote actually says the opposite ("no lead").
import { DOC_BASIS, MATERIALS, parseDate } from './rules.js';

const PARTS = ['system', 'customer', 'whole', 'connector', 'building'];
const EVENTS = ['present', 'installed', 'removed'];

export const norm = (s) => String(s || '').toLowerCase().replace(/["'‘’“”]/g, '').replace(/[^a-z0-9./#-]+/g, ' ').trim();
const sentences = (t) => String(t).split(/(?<=[.;:!?])\s+/).map((x) => x.trim()).filter(Boolean);

const MAT_WORDS = {
  lead: /\blead\b|\bpb\b|\blead-?lined\b|\bleaded\b/,
  lead_lined_galvanized: /lead.{0,12}lined|lined.{0,12}lead/,
  galvanized: /galv|\bg\.?i\.?\b|\bgis\b|steel/,
  copper: /copper|\bcu\b|type ?[kl]\b|\b[kl] ?copper/,
  plastic: /plastic|\bpex\b|\bpvc\b|\bpoly|hdpe|\bpe\b|\bcts\b/,
  iron: /cast iron|ductile|\bc\.?i\.?\b|\bd\.?i\.?\b|\biron\b/,
  brass: /brass/,
  not_lead: /not lead|non-?lead|no lead|lead ?free|lead-free|nonlead/,
};
const SIDE_WORDS = {
  connector: /gooseneck|goose neck|pigtail|connector/,
  whole: /main to (the )?(house|building|home)|entire (service|line)|whole (service|line)|full replacement/,
  customer: /meter( pit)? to (the )?(house|building|home|basement)|house side|customer side|cust\.? side|property side|private side|basement|into (the )?house|at entry|enters? (the )?(house|basement)/,
  system: /main to (the )?(curb|meter)|utility side|utility-owned|utility owned|system side|public side/,
};
const KIND_SIDE = { tap_card: 'system', permit: 'customer' };
const NO_RECORD = /no (tap card|record|card|records)/;
const BUILT = /\b(year built|built|constructed|construction)\b/;
const INSTALL = /install|tap(ped)?\b|tap made|tapped|\blaid\b|\bset\b|new service|put in|replac/;
const NEGATED_LEAD =/\b(no|not|non|without|free of)[- ]+lead\b|lead[- ]?free|nonlead/;

export function checkFacts(rawFacts, docs) {
  const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
  const kept = [];
  const dropped = [];
  for (const f of Array.isArray(rawFacts) ? rawFacts : []) {
    const doc = byId[f?.doc];
    const drop = (why) => dropped.push({ ...f, why });
    if (!doc) { drop('names a document that does not exist'); continue; }
    if (!PARTS.includes(f.part)) { drop('unknown pipe part'); continue; }
    if (!MATERIALS.includes(f.material)) { drop('unknown material'); continue; }
    let quote = String(f.quote || '');
    let q = norm(quote);
    let material = f.material;
    let note = '';
    const hay = norm(`${doc.title || ''} ${doc.date || ''} ${doc.text}`);
    if (q.length < 3 || !hay.includes(q)) { drop('quote is not in the document'); continue; }
    if (material !== 'unknown') {
      const words = MAT_WORDS[material];
      if (words && !words.test(q)) {
        // Quote repair: if exactly one sentence of this record names the material, quote that sentence.
        const hits = sentences(doc.text).filter((s) => words.test(norm(s)) && !(material === 'lead' && NEGATED_LEAD.test(norm(s))));
        if (hits.length === 1) { quote = hits[0]; q = norm(quote); note = 'quote moved to the sentence that names the material'; }
        else if (INSTALL.test(q)) { material = 'unknown'; note = 'material not in the quote; kept only as an installation date'; }
        else { drop(`quote does not mention ${material.replace(/_/g, ' ')}`); continue; }
      }
      if ((material === 'lead' || material === 'lead_lined_galvanized') && NEGATED_LEAD.test(q)) { drop('quote says there is no lead'); continue; }
    }
    // The side named in the quote wins over the model's label ("meter to house" is the customer side).
    // If the quote names no side, a tap card covers the system side and a plumbing permit the customer side.
    let part = f.part;
    const named = Object.entries(SIDE_WORDS).filter(([, re]) => re.test(q)).map(([k]) => k);
    if (named.length === 1 && named[0] !== part && part !== 'building') part = named[0];
    else if (!named.length && KIND_SIDE[doc.kind] && ['system', 'customer', 'whole'].includes(part)) part = KIND_SIDE[doc.kind];
    if (part === 'connector' && !SIDE_WORDS.connector.test(q)) {
      // Not a connector after all: fall back to the side the record type covers, or drop it.
      const side = KIND_SIDE[doc.kind];
      if (side) part = side; else { drop('quote does not mention a gooseneck, pigtail or connector'); continue; }
    }
    // A building's construction date is not the pipe's date (EPA 816-B-22-001 p. 3-6).
    let event = EVENTS.includes(f.event) ? f.event : 'present';
    if (material === 'unknown' && BUILT.test(q) && !INSTALL.test(q)) part = 'building';
    // A date with no material only helps if the quote says the pipe was put in then.
    if (material === 'unknown' && part !== 'building') {
      // Fix after the frozen run (ext04): the year must be in the quote itself, and "no tap card" is not an installation.
      if (!/\b(1[89]|20)\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(q) || NO_RECORD.test(q)) { drop('no installation date in the quote'); continue; }
      if (INSTALL.test(q)) event = 'installed';
      else { drop('gives a date but does not say the pipe was installed then'); continue; }
    }
    // Dates: the year must appear in the quote or the document header; otherwise fall back to the document date.
    let date = parseDate(f.date);
    if (date) {
      const y = date.lo.slice(0, 4);
      if (!q.includes(y) && !norm(doc.text).includes(y) && !String(doc.date || '').includes(y)) date = null;
    }
    const docDate = parseDate(doc.date);
    kept.push({
      doc: f.doc, part, material, event, model_part: f.part, model_material: f.material, note,
      date: date ? date.text : '', quote, basis: DOC_BASIS[doc.kind] || 'record',
      eff: date || docDate,
    });
  }
  return { kept, dropped };
}
