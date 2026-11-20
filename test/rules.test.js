// Positive control: hand-written facts for the hardest cases must give the labeled category.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { decide } from '../src/core/pipeline.js';
import { presetOf } from '../src/core/presets.js';

const all = [...JSON.parse(fs.readFileSync('eval/dev.json', 'utf8')), ...JSON.parse(fs.readFileSync('eval/external.json', 'utf8'))];
const byId = Object.fromEntries(all.map((c) => [c.id, c]));
const F = (doc, part, material, event, date, quote) => ({ doc, part, material, event, date, quote });

const GOLD = {
  dev02: [F('D1', 'system', 'lead', 'present', '1927', '5/8 lead, main to curb'), F('D2', 'system', 'lead', 'removed', '2016', 'Removed lead from main to curb stop'), F('D2', 'system', 'copper', 'installed', '2016', 'installed 1" copper'), F('D2', 'customer', 'galvanized', 'present', '2016', 'Customer side galvanized')],
  dev03: [F('D1', 'connector', 'lead', 'installed', '1962', 'Lead gooseneck at main'), F('D1', 'system', 'copper', 'installed', '1962', 'then 3/4 K copper to curb stop'), F('D2', 'customer', 'copper', 'installed', '1962', 'meter to house 3/4 copper')],
  dev05: [F('D1', 'system', 'unknown', 'installed', '1991', 'Tap made 7/11/1991 for 903 Elm'), F('D2', 'customer', 'plastic', 'installed', '1991', 'meter pit to house, 1" PEX')],
  dev06: [F('D1', 'system', 'unknown', 'installed', '1987', 'Tap and curb stop installed 1987'), F('D2', 'customer', 'copper', 'present', '1987', 'meter to building, 3/4 copper')],
  dev07: [F('D1', 'system', 'unknown', 'installed', '1987', 'Tap and curb stop installed 1987'), F('D2', 'customer', 'copper', 'present', '1987', 'meter to building, 3/4 copper')],
  dev08: [F('D1', 'system', 'lead', 'present', '1940', '3/4 lead to curb'), F('D2', 'system', 'copper', 'present', '2023', 'Pipe at curb stop is copper'), F('D3', 'customer', 'copper', 'installed', '1998', 'replaced with 3/4 copper')],
  dev09: [F('D1', 'system', 'galvanized', 'present', '1955', '3/4 galv. main to curb'), F('D2', 'system', 'copper', 'present', '1990', 'Inlet pipe copper'), F('D3', 'customer', 'copper', 'present', '1955', 'Meter to house 3/4 copper tubing')],
  dev10: [F('D1', 'system', 'copper', 'present', '', 'Every utility service we put in up there was copper'), F('D2', 'customer', 'copper', 'installed', '1973', 'meter to house 3/4 copper')],
  dev11: [F('D1', 'system', 'copper', 'present', '', 'Every utility service we put in up there was copper'), F('D2', 'customer', 'copper', 'installed', '1973', 'meter to house 3/4 copper')],
  dev14: [F('D1', 'system', 'copper', 'present', '2022', 'Utility side is copper'), F('D2', 'customer', 'galvanized', 'present', '2022', 'galvanized steel, threaded')],
  dev15: [F('D1', 'system', 'copper', 'installed', '1964', '3/4 K copper from main to curb stop'), F('D2', 'customer', 'galvanized', 'present', '2022', 'galvanized steel, threaded')],
  dev16: [F('D1', 'system', 'not_lead', 'present', '2024', 'no lead found'), F('D1', 'system', 'copper', 'present', '2024', 'pipe is copper on utility side'), F('D2', 'customer', 'plastic', 'installed', '2001', 'meter to house with 1" PE')],
  dev19: [F('D1', 'system', 'lead', 'present', '1938', '3/4 lead. 1938'), F('D2', 'whole', 'lead', 'removed', '2004', 'Removed old lead service'), F('D2', 'whole', 'plastic', 'installed', '2004', 'main to house with 1" PE')],
  dev20: [F('D1', 'whole', 'copper', 'present', '1946', 'only copper or galvanized pipe permitted'), F('D2', 'system', 'unknown', 'installed', '1958', 'Tap made 1958'), F('D3', 'customer', 'galvanized', 'present', '1958', 'Meter to house, 3/4 galvanized')],
  dev23: [F('D1', 'connector', 'lead', 'installed', '1960', 'lead pigtail at main'), F('D1', 'system', 'copper', 'installed', '1960', 'then 3/4 copper to curb stop'), F('D2', 'customer', 'galvanized', 'present', '1960', 'Meter to house 3/4 galvanized')],
  ext06: [F('D1', 'connector', 'lead', 'installed', '1948', 'Lead gooseneck at main'), F('D1', 'system', 'galvanized', 'installed', '1948', '3/4 galvanized main to curb stop'), F('D2', 'customer', 'galvanized', 'present', '1948', 'Meter to house 3/4 galvanized')],
  ext08: [F('D1', 'whole', 'unknown', 'installed', '1993', 'New service installed 5/18/1993, main to house')],
  ext09: [F('D1', 'whole', 'unknown', 'installed', '1986-08-14', 'water service installed 8/14/1986, main to house')],
  ext10: [F('D1', 'system', 'copper', 'present', '2024', 'Utility side at curb stop is copper'), F('D2', 'customer', 'galvanized', 'present', '2024', 'Customer side at entry is galvanized')],
  ext11: [F('D1', 'system', 'lead_lined_galvanized', 'present', '1921', '3/4 lead-lined galvanized, main to curb'), F('D2', 'customer', 'copper', 'present', '1988', 'Meter to house 3/4 copper')],
  ext12: [F('D1', 'system', 'copper', 'present', '', 'All the ones I dug up were copper or plastic')],
};

describe('rules on hand-written facts', () => {
  for (const [id, facts] of Object.entries(GOLD)) {
    it(`${id} -> ${byId[id].label.category}`, () => {
      const r = decide(byId[id], JSON.stringify({ facts }), presetOf(byId[id]));
      expect(r.dropped.map((d) => d.why)).toEqual([]);
      expect(r.category).toBe(byId[id].label.category);
      expect(r.connector).toBe(byId[id].label.connector);
    });
  }
});

describe('checker', () => {
  it('drops a lead claim whose quote says no lead', () => {
    const r = decide(byId.dev16, JSON.stringify({ facts: [F('D1', 'system', 'lead', 'present', '', 'no lead found')] }));
    expect(r.kept.length).toBe(0);
    expect(r.dropped[0].why).toMatch(/no lead/);
  });
  it('drops a quote that is not in the record', () => {
    const r = decide(byId.dev01, JSON.stringify({ facts: [F('D1', 'system', 'copper', 'present', '', 'copper service main to curb')] }));
    expect(r.dropped[0].why).toMatch(/not in the document/);
  });
});
