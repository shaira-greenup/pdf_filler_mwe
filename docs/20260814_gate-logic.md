# Gate logic: reading a form's own gating rules instead of guessing them

Date: 2026-08-14

## What happened

Two real bugs surfaced while adding `abs-study`, both from trusting a field's
*label* instead of the form's actual logic:

1. The citizenship gate (`Q2`) had its Yes/No polarity backwards in
   `mapping.ts` - guessed from the label ("Date of citizenship (if not born
   in Australia)") rather than the form's own logic.
2. `sample-data.json` had `Q44: "No"` ("no vehicles") while `44.Asset.0`,
   `44.Make.0`, etc. were still filled with placeholder text - and this was
   *initially misattributed to the wrong gate* (`Q43`, a different, unrelated
   question) before being re-verified directly against the real data.

## Root cause

Both fields carry a Calculate action (`/AA /C`) - JavaScript Acrobat runs to
derive a value, never executed by pdf-lib, but readable as plain text off the
field dict, the same way `/AA /F`/`/AA /K` (Format/Keystroke) were already
being read for date-format detection. `DummyCalcQ2`'s Calculate action reads:

```
lockUnlockNoYes(this.getField("Q2"), "Yes", "Q2Details");
```

This turned out to be a real, common government-form-authoring convention,
not something specific to one field: **72 rules across 55 fields in
`abs-study`**, and **48 rules in `income-and-assets`** - the original,
"fully mapped" reference form - carry this exact pattern. Both forms use the
identical helper function, found as a document-level script named
"LockUnlock" in the PDF's `/Names/JavaScript` catalog entry (a place nothing
in this codebase had read before):

```js
function lockUnlockNoYes(NoYesField, UnlockValue, FieldsToLockUnlock) {
  var ArrayToLockUnlock = FieldsToLockUnlock.split(",");
  if (NoYesField.value == UnlockValue) { ReadonlyVal = false; } else { ReadonlyVal = true; }
  for (i = 0; i < ArrayToLockUnlock.length; i++) {
    var FieldInArray = this.getField(ArrayToLockUnlock[i]);
    if (ReadonlyVal) {
      FieldInArray.display = display.hidden;
      if (FieldInArray.type=="text") FieldInArray.value = "";
      else if (FieldInArray.type=="checkbox") FieldInArray.value = "Off";
    } else {
      FieldInArray.display = display.visible;
    }
  }
}
```

Confirmed by reading this source directly, not inferred from call-site
examples:

- The target list (`FieldsToLockUnlock`) is **exact field names**, looked up
  via `this.getField(...)` - including non-terminal parent names (e.g.
  `"44"`, `"Q2Details"`) whose children cascade automatically in Acrobat's
  field-display model.
- Acrobat **enforces "hidden implies blank" live**, every time a gate's
  answer changes, by blanking the target's value the instant it hides it.
  pdf-lib never runs this JS, so nothing enforces that invariant when data is
  filled outside Acrobat - which is exactly how bug 2 could exist silently.
- pdf-lib's public API (`PDFForm.getFields()`/`getField(name)`) never exposes
  non-terminal field nodes (confirmed by reading `PDFAcroForm.js`/
  `PDFForm.js` - `convertToPDFField` silently drops `PDFAcroNonTerminal`). So
  a target like `"44"` can't be looked up directly - it has to be resolved by
  matching terminal field names that equal it or start with `"44."`.

## Options considered

| Option | Verdict |
|---|---|
| Validate gating in `schema.ts` via `.superRefine()` per gate | Right for fields already hand-promoted to the business schema (e.g. `citizenship`), but only 1 of 55+48 gates across both forms has been promoted. Doesn't cover the rest without a lot of manual authoring. |
| Post-fill check: "no field should be Hidden and hold a value" | Tested directly and found useless: `applyGenericData` already unconditionally unhides anything it writes a value to (a pre-existing, deliberate policy for whole-form generic coverage), so by the time this check would run, the evidence is already gone. |
| Generic extractor reading the form's own Calculate-action JS, checked against the *gate's actual value* (not the Hidden flag) | **Chosen.** Doesn't depend on Hidden-flag state, works for any gate whether or not it's been hand-promoted, and generalized immediately - it found the same class of issue in `income-and-assets` too, unprompted. |
| Hard-fail `fill` on any violation | Rejected for now. Only 1 of 100+ discovered gates across both forms has been hand-verified; a hard fail would immediately break both forms' `fill` command over pre-existing, not-yet-cleaned-up sample data rather than catching a new regression. Explicitly a deliberate later step, once sample data is cleaned up - not assumed. |

## Fix applied

- `scripts/genericFields.ts`: widened `getActionJS`'s `actionKey` type to
  include `"C"` (Calculate) alongside the existing `"F"`/`"K"` - the
  implementation was already generic over the key string.
- `scripts/lib/gateGraph.ts` (new): `extractGateGraph(form)` parses every
  `lockUnlockNoYes(gate, trigger, targets)` call site out of each field's
  Calculate action (a field can carry more than one call - e.g. one per
  possible answer - matched globally, not just the first) and resolves each
  target to real terminal fields via the dotted-name-prefix rule above.
  `findGateViolations(form)` uses that graph to check every rule whose gate's
  *current* value doesn't match the trigger (the "locked" branch) for any
  target still holding a non-blank value.
- `scripts/lib/inspectForm.ts`: `fields.txt` now prints a `Gate logic:` line
  under whichever field carries the Calculate action, listing the resolved
  targets - purely additive, doesn't touch the SHA-256 hash line.
- `scripts/lib/fillForm.ts`: after the existing read-back verification, calls
  `findGateViolations` against the reloaded, saved PDF and `console.warn`s
  each violation. Does not throw; `fill` still succeeds and writes the PDF.
- Not wired into `scripts/lib/smokeTest.ts` - the smoke test deliberately
  fills and unhides every field regardless of gating, so violations there
  are expected noise, not signal.

One implementation pitfall worth recording: the first version of the
blank-check treated any dropdown/combobox with `getSelected().length > 0` as
non-blank, which flagged the *pristine, untouched* `abs-study` template
itself (`27.Per.0` etc. - a "per Day/Week/Fortnight/..." picker) as already
violating its own gates. The actual cause: some dropdowns ship with a
whitespace-string placeholder option (`"     "`) always pre-selected, since
a dropdown widget can't have a truly empty selection the way a text field
can. Fixed by treating whitespace-only values as blank across all field
types, not just checking for `""`.

## Day-to-day implications

- Running `fill` on either form today prints a large number of `Gate
  warning:` lines - this is real, previously invisible signal, not a
  regression. Both forms' `sample-data.json` were originally seeded
  mechanically (every fillable field gets *some* synthesized value,
  regardless of gating), so almost none of the 100+ discovered gates across
  both forms have had their downstream sections cleaned up to respect the
  gate's actual answer yet. `citizenship`/`Q2` in `abs-study` is the only
  exception, hand-verified this session.
- Cleaning up that sample data (per gate, per form) is a separate, larger
  piece of work this change does not attempt - it only makes the problem
  visible everywhere at once instead of being found by chance.
- Escalating `findGateViolations` from a warning to a hard failure is a
  deliberate future step, once a form's sample data has actually been
  brought in line with its own gates - not something to silently flip on.
- This convention (`lockUnlockNoYes` / the "LockUnlock" document script) is
  opportunistic, like `AFDate_FormatEx` detection for dates: a form that
  doesn't use it simply produces an empty gate graph and no warnings, not an
  error.

## Files

- `scripts/lib/gateGraph.ts` - the extractor and violation-checker.
- `scripts/lib/gateGraph.test.ts` - asserts the known rule shapes in both
  forms, and both the violating and consistent cases of `findGateViolations`.
- `scripts/genericFields.ts`, `scripts/lib/inspectForm.ts`,
  `scripts/lib/fillForm.ts` - widened/wired as described above.
