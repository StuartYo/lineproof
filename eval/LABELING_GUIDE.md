# Labeling guide

Written before any system output was produced. Every case is one service line with 1 to 5 utility records. All records, addresses, people and utilities are made up.

## Labels

`category`, one of:

- `LEAD`: any portion is lead or lead-lined galvanized (40 CFR 141.2).
- `GRR`: the customer side is galvanized, and the system side is lead now, was lead before, is unknown, or there is no record showing it was never lead (40 CFR 141.2).
- `NON_LEAD`: both sides are shown not to be lead or GRR by a record, a field check, or an installation date after the lead ban (40 CFR 141.84(a)(3)(iii), (b)(5)(i)).
- `UNKNOWN`: anything else (40 CFR 141.84(a)(3)(iv)).

`connector`: `LEAD`, `NOT_LEAD`, or `UNKNOWN` when no record mentions a gooseneck, pigtail or connector. A lead connector never changes `category` (40 CFR 141.2, "connector").

## How to read the records

1. Tap cards, curb box notes and "main to meter" describe the system side. Plumbing permits, "meter to house" and basement notes describe the customer side. "Main to house" or "entire service" covers both.
2. A later record of a replacement (new pipe installed) overrides older records of that side. If lead was ever on the system side, a galvanized customer side is GRR.
3. Records that disagree with no replacement record in between: lead if any of them says lead, otherwise unknown (EPA 816-B-22-001, p. 6-5).
4. Install date with no material: non-lead only if the date is surely after the ban date in the case settings (a bare year counts only if the whole year is after it). A local rule that banned lead moves the ban date earlier. The building's construction date is never the pipe's date.
5. Staff statements, customer reports and predictive model results only count when the case settings say the state approved them.
6. A galvanized customer side is non-lead only when the system side's original installation record names a non-lead pipe, or the system side went in after the ban. A copper pipe seen today is not proof; it may have replaced lead.

## Sets

- `dev.json` (24): written by me to cover each rule and the traps I expected. Used while building.
- `external.json` (12): each case restates a worked example published by EPA or a state agency, with the expected answer that source gives. The record wording is mine; the answer and the source are in each case's `source` field.
- `holdout.json` (16): written by a separate agent that saw only this guide. Run once, after the code was frozen.
