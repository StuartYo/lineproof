// The "no model" comparison: the same checker and rules, fed by keyword matching instead of Gemma.
// It shows what the model adds. Part comes from the record type and a few words; dates from the record header.
const MAT = [
  ['lead_lined_galvanized', /lead.{0,12}lined/i], ['lead', /\blead\b|\bpb\b/i], ['galvanized', /galv|\bg\.i\.|steel/i],
  ['copper', /copper|\bcu\b|type [kl]\b|\bk copper/i], ['plastic', /plastic|\bpex\b|\bpvc\b|\bpoly|\bpe\b|hdpe/i],
  ['iron', /cast iron|ductile/i], ['brass', /brass/i],
];
export function keywordFacts(docs) {
  const facts = [];
  for (const d of docs) {
    for (const sent of d.text.split(/(?<=[.;:])\s+/)) {
      const s = sent.trim();
      let part = /main to house|entire service|whole service/i.test(s) ? 'whole'
        : /gooseneck|pigtail|connector/i.test(s) ? 'connector'
        : /customer|house side|meter to (the )?house|basement|meter to building|into house|at entry/i.test(s) ? 'customer'
        : /utility|curb|main to|tap/i.test(s) ? 'system'
        : d.kind === 'permit' ? 'customer' : 'system';
      if (/year built|built \d{4}/i.test(s)) part = 'building';
      const event = /removed/i.test(s) ? 'removed' : /install|replac|new |laid|set /i.test(s) ? 'installed' : 'present';
      const hit = MAT.find(([, re]) => re.test(s));
      if (!hit && event !== 'installed') continue;
      facts.push({ doc: d.id, part, material: hit ? hit[0] : 'unknown', event, date: (s.match(/\b(19|20)\d{2}\b/) || [''])[0], quote: s.replace(/[.;:]$/, '') });
    }
  }
  return { facts };
}
