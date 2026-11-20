import { parseJSON } from './prompts.js';
import { checkFacts } from './verify.js';
import { classify, DEFAULT_SETTINGS } from './rules.js';

/** Model reply text -> checked facts -> category. `skip` is a set of fact indexes the user switched off. */
export function decide(item, replyText, settings = item.settings || DEFAULT_SETTINGS, skip = new Set()) {
  const raw = parseJSON(replyText);
  const facts = raw?.facts || [];
  const { kept, dropped } = checkFacts(facts, item.docs);
  const used = kept.filter((_, i) => !skip.has(i));
  const result = classify(used, settings);
  return { ...result, kept, dropped, parsed: !!raw };
}
