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

/** The reader: one call per record, copy facts out of it. No classification. */
export function extractPrompt(doc) {
  return `You copy facts out of ONE water utility record about a water service line. Do not decide whether the line is lead.

Return one JSON object: {"facts": [...]}, one fact per pipe material, installation, removal or building date in the record.
- "part": "system" = utility side, from the water main to the curb stop or meter. Tap cards describe this side unless they say otherwise.
          "customer" = property side, from the curb stop or meter to the building. Plumbing permits describe this side unless they say otherwise.
          "whole" = the record says it covers main to house, or the entire service.
          "connector" = a gooseneck, pigtail or connector at the main.
          "building" = the house itself, for example the year it was built.
- "material": ${MATERIALS.join(', ')}. galv, G.I., steel = galvanized. Cu, type K, type L = copper. PE, poly, PEX, PVC = plastic. Pb = lead. Use "not_lead" if the record only says the pipe is not lead. Use "unknown" if the record gives a date for the pipe but no material.
- "event": "present" = the pipe is this material; "installed" = the pipe was put in (new or as a replacement); "removed" = this pipe was taken out.
- "date": YYYY or YYYY-MM-DD for that event if known, else "".
- "quote": 3 to 15 words copied EXACTLY from the record text that show this fact.

Example record (Field note, 2023): "Dug at curb box: utility side 3/4 galv. House was built 1950. Old lead gooseneck still at the main."
{"facts": [{"part": "system", "material": "galvanized", "event": "present", "date": "2023", "quote": "utility side 3/4 galv."}, {"part": "building", "material": "unknown", "event": "present", "date": "1950", "quote": "House was built 1950"}, {"part": "connector", "material": "lead", "event": "present", "date": "", "quote": "Old lead gooseneck still at the main"}]}

Example record (Work order, 2011): "Pulled lead svc from main to meter and put in 1 in. PE. No lead on house side, it's copper."
{"facts": [{"part": "system", "material": "lead", "event": "removed", "date": "2011", "quote": "Pulled lead svc from main to meter"}, {"part": "system", "material": "plastic", "event": "installed", "date": "2011", "quote": "put in 1 in. PE"}, {"part": "customer", "material": "copper", "event": "present", "date": "", "quote": "No lead on house side, it's copper"}]}

Record (${doc.title}${doc.date ? ', ' + doc.date : ''}): "${doc.text}"
`;
}

/** Runs the reader on every record and joins the facts, tagging each with its record id. */
export async function extractAll(ask, docs) {
  const facts = [];
  let ms = 0;
  const raw = [];
  for (const d of docs) {
    const r = await ask(extractPrompt(d), { maxTokens: 500, grammar: EXTRACT_GRAMMAR });
    ms += r.ms;
    raw.push(r.text);
    for (const f of parseJSON(r.text)?.facts || []) facts.push({ doc: d.id, ...f });
  }
  return { text: JSON.stringify({ facts }), ms, raw };
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

// Grammars keep the output to exact JSON with no room for runaway whitespace (the JSON-schema mode let
// Gemma pad one reply with blank lines until it hit the token limit).
const alt = (xs) => xs.map((x) => `"\\"${x}\\""`).join(' | ');
export const EXTRACT_GRAMMAR = String.raw`root ::= "{\"facts\": [" facts "]}"
facts ::= "" | fact (", " fact)*
fact ::= "{\"part\": " part ", \"material\": " mat ", \"event\": " ev ", \"date\": " date ", \"quote\": " str "}"
date ::= "\"\"" | "\"" [12] [0-9] [0-9] [0-9] ("-" [01] [0-9] "-" [0-3] [0-9])? "\""
str ::= "\"" chr+ "\""
chr ::= [^"\\\n] | "\\" ["\\/nt]
part ::=` + alt(['system', 'customer', 'whole', 'connector', 'building']) + `
mat ::= ` + alt(MATERIALS) + `
ev ::= ` + alt(['present', 'installed', 'removed']) + '\n';

export const BASELINE_GRAMMAR = String.raw`root ::= "{\"category\": " cat ", \"connector\": " con ", \"reason\": " str "}"
str ::= "\"" chr+ "\""
chr ::= [^"\\\n] | "\\" ["\\/nt]
cat ::=` + alt(['LEAD', 'GRR', 'NON_LEAD', 'UNKNOWN']) + `
con ::= ` + alt(['LEAD', 'NOT_LEAD', 'UNKNOWN']) + '\n';
