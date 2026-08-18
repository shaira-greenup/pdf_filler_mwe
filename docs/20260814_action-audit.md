# Calculate-action audit: what the gate extractor was still missing

Date: 2026-08-14

## What happened

After building the gate-graph extractor ([[20260814_gate-logic]]) and generating
a "gate-consistent" sample, two spot-checks against actual rendered pages
surfaced real, structural gaps beyond the two categories already documented
(`Q2` polarity, `Q44`/`Q43` misattribution, `Q1`'s hard eligibility stop):

1. **`Q1`** ("Aboriginal/Torres Strait Islander", answer "No" → "You are not
   eligible for ABSTUDY") - a hard stop with *no JS at all* behind it. Already
   documented in [[20260814_gate-logic]].
2. **Question 4, "Student's name"** - `Mr` selected, but the free-text
   "Other" title box still held placeholder text. Not a `lockUnlockNoYes`
   gate at all - a different mechanism entirely (see below).

Rather than hand-patch each newly-screenshotted field - which wouldn't
generalize to a form nobody has looked at yet - the brief was: audit every
action key actually present in the PDF (both field-level and widget-level
dicts), plus every document-level script, plus the AcroForm's own `/CO`
(calculation order) array as an independent cross-check, and find every
convention that exists, not just the one already found.

## Root cause / findings

Only five action keys exist anywhere in either form: `/C`, `/F`, `/K`, `/V`,
`/Bl`. No `/Fo`, `/D`, `/U`, `/E`, `/X` anywhere in either form - this bounds
the problem to a known, finite set.

1. **A real bug in `getActionJS` itself, not a coverage assumption.**
   Cross-checking `extractGateGraph`'s coverage against the AcroForm's own
   `/CO` array (its authoritative list of calculated fields - 58 entries in
   `abs-study`) against what `getActionJS`-based extraction found (55)
   surfaced a genuine 3-field gap. Cause: `getActionJS` only ever read `/JS`
   when it was an inline `PDFString`/`PDFHexString` - never when the PDF
   writer stored it as a stream (`PDFRawStream`) instead, which is legal per
   spec for longer scripts and silently returns `undefined` with no error.
   Two of the three missed fields carry substantial, previously entirely
   invisible `lockUnlockNoYes` logic:
   - `DummyCalcQ12`: 7 calls (marital status → date/skip branching per option)
   - `DummyCalcQ20`: 11 calls (a 10-option selector + "Other", each routing
     to a different skip point)

   This is a pure infrastructure bug in shared code, not a per-field gap -
   fixing it benefits every field, every form, with no new pattern-matching
   needed.

2. **A second real, repeatable convention: Blur-based "clear the Other box."**
   `Title1` → `TitleOther1` and `Board.Title` → `Board.TitleOther` both carry
   the *identical* per-widget `/Bl` (Blur) action, confirmed byte-for-byte
   the same shape (only the field name substituted):

   ```js
   TitleOther = this.getField("TitleOther1");
   if (event.target.value != "Off" && TitleOther.value != "") {
       TitleOther.value = "";
   }
   ```

   This is Acrobat's own interactive cleanup: leaving a real title checkbox
   selected clears the paired free-text field live. pdf-lib never runs it, so
   a mechanically-filled `TitleOther1` sits there with stale text forever -
   exactly what the Question 4 screenshot showed. Structurally different from
   `lockUnlockNoYes`: it's a single paired field (not a target list), the
   condition is "gate ≠ Off" rather than "gate == specific trigger value",
   and it lives at the *widget* level, never the field level.

3. **One genuinely bespoke case, not safely auto-parseable.** `DummyCalcQ67_1`
   is hand-written JS, not a call to the shared `lockUnlockNoYes` helper: an
   OR-condition across three trigger values, toggling three different
   fields' visibility, plus a `this.resetForm("Button")` call whose exact
   field-matching semantics aren't safe to assume without executing it.
   Writing a general parser for arbitrary hand-written conditionals is a
   qualitatively bigger problem than matching one known function call's call
   sites. The generalizable response isn't "understand this field" - it's
   "always report when a Calculate action matches neither the `lockUnlockNoYes`
   pattern nor the Blur-pair pattern", so a case like this is visible instead
   of silently missed, in any form, not just this one.

4. **Related, out of scope for gating specifically:** 38 fields (`abs-study`)
   and 85 fields (`income-and-assets`) carry `/V` (Validate) actions - mostly
   real regex/range constraints (e.g. exactly 10 digits for a phone number)
   that `buildGenericSchema` does not enforce today. Noted as a follow-up
   opportunity of the same shape (mine the PDF's own JS instead of guessing a
   schema), not addressed by this change.

5. `income-and-assets` carries a second document-level script,
   `ACRO_breakpoints`. Read directly rather than assumed relevant: it turned
   out to be an Acrobat IDE debugger breakpoint left over from someone
   debugging the `LockUnlock` script (`fileName:"Document-Level:LockUnlock",
   lineNum:20`) - tooling metadata, not business logic. No action needed.

## Fix applied

Three generalized changes, all reusable by any form, none of them a
per-field patch:

1. `scripts/genericFields.ts`: `getActionJS` now delegates to a new
   `getDictActionJS(dict, actionKey)`, which reads `/JS` from a
   `PDFRawStream` (decoded the same way `extractAppearanceFontSize` already
   decodes other raw streams in this file) in addition to
   `PDFString`/`PDFHexString`, and works against *any* dict - not just a
   field's own - so widget-level actions (`/Bl` on one option of a
   multi-widget checkbox) are readable too, not just field-level ones.
2. `scripts/lib/gateGraph.ts`: a second extractor, `extractBlurPairRules`,
   for the Blur-based clear-sibling-field pattern. It produces the same
   `GateRule` shape as `lockUnlockNoYes` rules (using the checkbox's literal
   `"Off"` state as the trigger value), so it feeds into the same
   `findGateViolations` logic rather than a parallel check.
3. `scripts/lib/gateGraph.ts` (`findUnclassifiedActions`) / `inspectForm.ts`:
   any Calculate or Blur action that matches neither known pattern is now
   reported explicitly - a new `Unclassified action:` line in `fields.txt` -
   rather than silently producing zero rules and looking identical to a
   field with no gating logic at all.

Verified: `bunx tsc --noEmit` clean, `bun test` → 43 pass / 0 fail (up from
37), including new coverage for the stream-backed `DummyCalcQ12`/`DummyCalcQ20`
rules, both Blur-pair rules, and `findUnclassifiedActions`' exhaustive-
partition check (no field reported by `extractGateGraph` is *also* reported
as unclassified, and vice versa).

Confirmed counts, reconciling exactly with the predictions above:

| | before | after |
|---|---|---|
| `abs-study` unique gate-carrying fields | 55 | 59 (+`DummyCalcQ12`, `DummyCalcQ20`, `Title1`, `Board.Title`) |
| `abs-study` total rules | 72 | 92 |
| `abs-study` unclassified actions | (invisible) | 1 (`DummyCalcQ67_1`) |
| `income-and-assets` unique gate-carrying fields | 39 | 39 (unaffected - no stream-backed `/JS`, no Blur-pair convention) |
| `income-and-assets` total rules | 48 | 48 |
| `income-and-assets` unclassified actions | (invisible) | 0 |

## Day-to-day implications

This audit sharpens the trust model behind [[20260814_gate-logic]]'s
extractor into three distinct categories, not two:

1. **Encoded and understood** (`lockUnlockNoYes` calls, Blur-pairs) -
   `extractGateGraph`/`findGateViolations` cover these fully and
   automatically, for any form, with no per-field work. This is the
   generator's genuine "second line of defense": it catches inconsistencies
   *within* whatever the PDF's own JS actually encodes.
2. **Encoded, but not auto-parseable** (`DummyCalcQ67_1` - hand-written
   conditionals, `resetForm` calls, anything not matching a known call
   shape) - `findUnclassifiedActions` makes these visible in `fields.txt`
   rather than silently indistinguishable from "no gating here", but does
   not check them. A human has to read the flagged snippet and decide what
   it means, per field, per form.
3. **Not encoded in the PDF at all** (`Q1`'s "not eligible" hard stop - pure
   printed instruction text, zero Calculate action, zero JS) - fully
   invisible to any extractor, no matter how complete. Only the person
   authoring or reviewing that form's `sample-data.json`/`schema.ts` can
   catch this class, by actually reading the form.

Categories 2 and 3 are why `findGateViolations` staying a warning (not a
hard fail - see [[20260814_gate-logic]]'s "Options considered") is a
structural necessity, not just caution about pre-existing bad sample data:
no matter how many conventions get added to the extractor, categories 2 and
3 mean it can never be a complete, closed-world check on its own. The
generation/review step (the "first line of defense") is load-bearing for
every form, permanently - not a gap this tooling is expected to eventually
close to zero.

## Files

- `scripts/genericFields.ts` - `getActionJS` stream fix.
- `scripts/lib/gateGraph.ts` - new Blur-pair extractor, unclassified-action
  reporting.
- `scripts/lib/inspectForm.ts` - reporting wiring.
- `scripts/lib/gateGraph.test.ts` - coverage for both new behaviors.
