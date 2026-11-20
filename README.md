# LineProof

Sort water service lines into the EPA lead inventory categories from a utility's old records, and show the record and the rule behind every step.

Under the Lead and Copper Rule Improvements, every US community water system has to file a baseline service line inventory by November 1, 2027, with each line marked **Lead**, **Galvanized requiring replacement (GRR)**, **Non-lead** or **Lead status unknown**. EPA's latest survey counts about 4 million lead service lines, and 1 million of those are lines utilities reported as "unknown" that EPA predicts are lead ([EPA, 7th DWINSA fact sheet, Nov 2025](https://www.epa.gov/system/files/documents/2025-11/fact-sheet-2025-7th-dwinsa-update.pdf)). Most systems are small: about 81% serve 3,300 people or fewer ([EPA LCRI economic analysis, 2024, p. 3-15](https://www.epa.gov/system/files/documents/2024-10/508_lcri_final-ea_10-21-2024.pdf)). For them the work is reading tap cards, permits and field notes, one address at a time.

LineProof does that reading with a small model and leaves every decision to code you can check.

- **Gemma 4 E2B reads, in your browser.** It runs on your GPU through [WebLLM](https://github.com/mlc-ai/web-llm). It returns facts only: side of the line, material, installed or removed, date, and the exact words from the record. Output is held to a JSON schema.
- **Code checks every fact.** A quote that is not in the record is dropped. A quote that does not name the material it claims is dropped. A "lead" fact whose quote says "no lead" is dropped. Staff memory, customer reports and prediction models are set aside unless the state approved them.
- **Twelve rules decide.** They come from 40 CFR 141.2 and 141.84 and EPA's inventory guidance, and each one is a few lines in `src/core/rules.js`. Each step on screen names its rule and source. When records conflict, it takes the cautious answer EPA recommends and lists what would settle it.

Records, addresses and the water district in the demo are made up.

## Try it

`npm install`, then `npm run dev` and open http://localhost:5179.

- **Sample district** (default): 24 made-up service lines and 12 cases restating published EPA and state examples. Gemma's real outputs are saved, and the checker and rules run live on them. Switch a fact off, or change the state's lead ban date, and the category follows.
- **Paste your own records**: runs Gemma 4 E2B on your GPU (Chrome or Edge with WebGPU; first load downloads about 2.8 GB, then works offline). Nothing leaves the page.

## Test results

Every row uses the same model, Gemma 4 E2B (4-bit), with temperature 0. "Missed lead" counts lines whose answer is Lead or GRR but were called Non-lead, the mistake that leaves a lead pipe in the ground.

<!-- results:start -->
| Correct category (Lead or GRR called Non-lead) | District sample (24) | EPA & state examples (12) | Blind holdout (16) |
|---|---|---|---|
| Gemma 4 E2B alone | 10 (1) | 4 (1) | 7 (1) |
| Gemma 4 E2B with all 11 rules in the prompt | 13 (2) | 4 (2) | 9 (2) |
| No model: keyword reader + LineProof rules | 15 (0) | 9 (0) | 11 (0) |
| **LineProof**: Gemma reads, code checks and decides | 21 (0) | 11 (0) | 12 (0) |
<!-- results:end -->

The code was frozen at commit `e7b9bd7` before the EPA/state and holdout runs. Under that code LineProof scored 9/12 (one missed lead) and 13/16. The EPA/state run exposed two bugs (a removal record didn't retire the older lead record; a record's own date was taken as an installation date). The table shows the fixed code on the same saved model replies; the frozen scores are in `results.json` under `frozen`.

- **District sample** (`eval/dev.json`): written by me to cover each rule. I used it while building, so it flatters LineProof.
- **EPA & state examples** (`eval/external.json`): each case restates a worked example from EPA or a state agency, and the expected answer is the one that document gives (source in each case).
- **Blind holdout** (`eval/holdout.json`): written by a separate agent that saw only `eval/LABELING_GUIDE.md`, run once after the code was frozen.

Numbers are produced by `node scripts/score.mjs` from the saved runs in `eval/runs/` and written to `results.json`; the site, this table and the write-up read from that file. `npm test` runs the positive control: hand-written facts for the hardest cases must produce the expected category.

To re-run the model: `npx vite build`, `npx vite preview --port 5179`, then `node scripts/run-eval.mjs <name> eval/dev.json` (drives your installed Chrome with Playwright).

## Limits

- Twelve rules cover the federal text and EPA's recommendations. States add their own: ban dates, pipe-size cutoffs, which sources count. LineProof has settings for the ban date and for approved sources only.
- It reads typed records. Handwritten scans would need an OCR step first.
- It prepares an inventory for staff and state review. It does not replace a field check, and it is not legal advice.

## License

MIT
