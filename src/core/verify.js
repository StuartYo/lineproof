// Checks every fact the model hands back before the rules see it.
// A fact is thrown out when its quote is not in the named document, when the quote does not
// mention the material it claims, or when a "lead" quote actually says the opposite ("no lead").
import { DOC_BASIS, MATERIALS, parseDate } from './rules.js';

const PARTS = ['system', 'customer', 'whole', 'connector', 'building'];
const EVENTS = ['present', 'installed', 'removed'];

export const norm = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9"'./#-]+/g, ' ').trim();

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
const NEGATED_LEAD = /\b(no|not|non|without|free of)[- ]+lead\b|lead[- ]?free|nonlead/;

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
    const q = norm(f.quote);
    if (q.length < 3 || !norm(doc.text).includes(q)) { drop('quote is not in the document'); continue; }
    if (f.material !== 'unknown') {
      const words = MAT_WORDS[f.material];
      if (words && !words.test(q)) { drop(`quote does not mention ${f.material.replace(/_/g, ' ')}`); continue; }
      if ((f.material === 'lead' || f.material === 'lead_lined_galvanized') && NEGATED_LEAD.test(q)) { drop('quote says there is no lead'); continue; }
    }
    // Dates: the year must appear in the quote or the document header; otherwise fall back to the document date.
    let date = parseDate(f.date);
    if (date) {
      const y = date.lo.slice(0, 4);
      if (!q.includes(y) && !norm(doc.text).includes(y) && !String(doc.date || '').includes(y)) date = null;
    }
    const docDate = parseDate(doc.date);
    kept.push({
      doc: f.doc, part: f.part, material: f.material, event: EVENTS.includes(f.event) ? f.event : 'present',
      date: date ? date.text : '', quote: String(f.quote), basis: DOC_BASIS[doc.kind] || 'record',
      eff: date || docDate,
    });
  }
  return { kept, dropped };
}
