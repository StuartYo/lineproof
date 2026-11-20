// Prompts for the reader (LineProof) and for the two plain-model comparisons.
import { MATERIALS } from './rules.js';

const docsBlock = (docs) => docs.map((d) => `[${d.id}] ${d.title}${d.date ? ` (${d.date})` : ''}\n${d.text}`).join('\n\n');

export const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          doc: { type: 'string' },
          part: { type: 'string', enum: ['system', 'customer', 'whole', 'connector', 'building'] },
          material: { type: 'string', enum: MATERIALS },
          event: { type: 'string', enum: ['present', 'installed', 'removed'] },
          date: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['doc', 'part', 'material', 'event', 'date', 'quote'],
      },
    },
  },
  required: ['facts'],
};

/** The reader: copy facts out of the records. No classification. */
export function extractPrompt(docs) {
  return `You read water utility records about ONE water service line and copy facts out of them. Do not decide whether the line is lead.

Return one JSON object: {"facts": [ ... ]}. One fact per pipe material, installation, removal or building date you find.
Each fact:
- "doc": the record id, like "D1"
- "part": "system" = utility side, from the water main to the curb stop or meter (tap cards, curb box, utility side).
          "customer" = property side, from the curb stop or meter to the building (plumbing permits, house side, basement, meter-to-house).
          "whole" = the record says it covers the whole line, main to house.
          "connector" = a gooseneck, pigtail or connector at the main.
          "building" = the house or building itself (when it was built), not the pipe.
- "material": one of ${MATERIALS.join(', ')}. "galv", "G.I." and "steel" mean galvanized. "Cu", "type K" mean copper. "PE", "poly", "PEX", "PVC" mean plastic. Use "not_lead" when the record only says the pipe is not lead. Use "unknown" when the record gives a date but no material.
- "event": "present" = the record says the pipe is this material; "installed" = the pipe was put in (new or as a replacement); "removed" = this pipe was taken out.
- "date": the date of that event as YYYY or YYYY-MM-DD if the record gives it, else "".
- "quote": words copied EXACTLY from the record, 3 to 20 words, that show this fact.
If a record says lead was replaced with copper, give two facts: the lead "removed" and the copper "installed".
If a record says "no lead", the material is not_lead, never lead.

Records:
${docsBlock(docs)}`;
}

export const BASELINE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['LEAD', 'GRR', 'NON_LEAD', 'UNKNOWN'] },
    connector: { type: 'string', enum: ['LEAD', 'NOT_LEAD', 'UNKNOWN'] },
    reason: { type: 'string' },
  },
  required: ['category', 'connector', 'reason'],
};

const settingsLine = (s) => `State settings: lead ban date for service lines = ${s.ban_date} (${s.ban_label}). Staff statements, customer reports and predictive models approved by the state as evidence: ${s.approved_other_sources ? 'yes' : 'no'}.`;

const ASK = `Answer with one JSON object: {"category": "LEAD" or "GRR" or "NON_LEAD" or "UNKNOWN", "connector": "LEAD" or "NOT_LEAD" or "UNKNOWN", "reason": "one or two sentences"}
LEAD = lead service line. GRR = galvanized requiring replacement. NON_LEAD = non-lead. UNKNOWN = lead status unknown.
connector = the gooseneck or pigtail, UNKNOWN if no record mentions one.`;

/** Comparison A: the same model, asked straight. */
export function baselinePlainPrompt(docs, settings) {
  return `You help a US water utility build its EPA Lead Service Line Inventory (Lead and Copper Rule Improvements). Classify this one service line from its records.
${settingsLine(settings)}

${ASK}

Records:
${docsBlock(docs)}`;
}

/** Comparison B: the same model with every rule LineProof uses pasted in. */
export const RULES_TEXT = `Rules (from 40 CFR 141.2, 141.84 and EPA guidance):
1. If any portion of the service line (utility side or customer side) is lead, the line is LEAD.
2. Lead-lined galvanized pipe counts as lead.
3. A lead connector (gooseneck or pigtail, up to 3 feet) is NOT part of the service line. Record it as connector LEAD; it does not make the line LEAD or GRR.
4. A galvanized customer side that is now or ever was downstream of a lead utility side, or is downstream of an unknown utility side, is GRR.
5. If the utility cannot show that a galvanized customer side was never downstream of lead, it is GRR. Proof that it was never downstream of lead: the original installation record of the utility side names a non-lead pipe; or the utility side was installed after the lead ban date; or a local rule allowed only non-lead pipe when the utility side was installed. A field check that sees copper today is NOT such proof, because it may have replaced lead.
6. A galvanized utility side is non-lead.
7. Non-lead needs an evidence-based record (tap card, permit, work order, meter record, field check). No material evidence means UNKNOWN.
8. A record that a side was installed after the lead ban date makes that side non-lead, even with no material named. The building's construction date is NOT the pipe's date. A year that is not clearly after the ban date does not count.
9. If records about the same side disagree and there is no replacement record explaining it, the side is lead if any record says lead, otherwise unknown. A newer record of a replacement (new pipe installed) overrides older records.
10. Combine the two sides: LEAD beats GRR beats UNKNOWN beats NON_LEAD.
11. Staff statements, customer reports and predictive model results only count if the state approved them; otherwise ignore them.`;

export function baselineRulesPrompt(docs, settings) {
  return `You help a US water utility build its EPA Lead Service Line Inventory. Classify this one service line from its records, following the rules exactly.
${settingsLine(settings)}

${RULES_TEXT}

${ASK}

Records:
${docsBlock(docs)}`;
}

export function parseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
