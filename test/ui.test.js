import { describe, it, expect } from 'vitest';
import { plainError } from '../src/errors.js';
import { decide } from '../src/core/pipeline.js';
import { keywordFacts } from '../src/core/keyword.js';
import { presetOf } from '../src/core/presets.js';
import dev from '../eval/dev.json';
import hold from '../eval/holdout.json';
import devRun from '../eval/runs/dev.json';
import holdRun from '../eval/runs/holdout.json';

describe('plain error messages', () => {
  it('names storage, network and GPU problems in plain words', () => {
    expect(plainError(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }))).toMatch(/storage space/);
    expect(plainError(new TypeError('Failed to fetch'))).toMatch(/network drop/);
    expect(plainError(new Error('Device was lost'))).toMatch(/graphics card/);
    expect(plainError(Object.assign(new Error('This browser has no WebGPU.'), { kind: 'gpu' }))).toMatch(/Chrome or Edge/);
  });
});

// The two cases the site points to as "where the model matters", checked on the saved model replies.
describe('model vs keywords on the saved replies', () => {
  const both = (cases, run, id) => {
    const c = cases.find((x) => x.id === id);
    const reply = run.results.find((x) => x.id === id).extract.text;
    return { want: c.label.category, gemma: decide(c, reply, presetOf(c)).category, kw: decide(c, JSON.stringify(keywordFacts(c.docs)), presetOf(c)).category };
  };
  it('"Lead inspector" fools keywords, not Gemma (dev24)', () => {
    const r = both(dev, devRun, 'dev24');
    expect(r.gemma).toBe(r.want);
    expect(r.kw).not.toBe(r.want);
  });
  it('lead pipe and lead gooseneck in one sentence (hold03)', () => {
    const r = both(hold, holdRun, 'hold03');
    expect(r.gemma).toBe(r.want);
    expect(r.kw).not.toBe(r.want);
  });
});
