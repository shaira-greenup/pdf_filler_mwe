import {
  PDFForm,
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from "pdf-lib";
import { getActionJS, isFillable } from "../genericFields";

export interface GateRule {
  sourceField: string;
  gateField: string;
  triggerValue: string;
  rawTargets: string[];
  affectedFields: string[];
}

// Matches a government-form-authoring convention (a document-level helper
// script, confirmed by reading its actual source off this form's own
// /Names/JavaScript catalog entry): lockUnlockNoYes(gateField, triggerValue,
// "target1, target2") reveals the named targets when gateField's value
// equals triggerValue, and hides + blanks them otherwise. A single
// Calculate action can hold several semicolon-separated calls (one per
// possible answer), so this matches globally, not just the first call.
const LOCK_UNLOCK_RE = /lockUnlockNoYes\(\s*this\.getField\(\s*"([^"]*)"\s*\)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;

// The helper's target argument is an exact field name looked up via
// this.getField(...) in Acrobat's own model, including non-terminal parent
// names (e.g. "44") whose children cascade automatically. pdf-lib's public
// PDFForm API never exposes non-terminal nodes (getFields()/getField() only
// return terminal fields - confirmed by reading pdf-lib's own
// PDFAcroForm.js/PDFForm.js), so a parent name has to be resolved by
// matching terminal fields whose fully-qualified name equals it or starts
// with it plus a literal "." - the same dotted-name convention already used
// throughout this form's own field names.
function resolveTarget(allNames: string[], target: string): string[] {
  const trimmed = target.trim();
  if (!trimmed) return [];
  return allNames.filter((name) => name === trimmed || name.startsWith(`${trimmed}.`));
}

// Reads every field's own Calculate action (never executed by pdf-lib, only
// parsed as text) and extracts the gating rules it encodes. Forms that
// don't use this convention simply yield an empty graph - this is an
// opportunistic structural match, the same kind as AFDate_FormatEx
// detection, not something every form is assumed to carry.
export function extractGateGraph(form: PDFForm): GateRule[] {
  const fields = form.getFields();
  const allNames = fields.map((field) => field.getName());
  const rules: GateRule[] = [];

  for (const field of fields) {
    const js = getActionJS(field, "C");
    if (!js) continue;

    for (const match of js.matchAll(LOCK_UNLOCK_RE)) {
      const gateField = match[1] ?? "";
      const triggerValue = match[2] ?? "";
      const rawTargets = (match[3] ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const affectedFields = [...new Set(rawTargets.flatMap((target) => resolveTarget(allNames, target)))].sort();

      rules.push({
        sourceField: field.getName(),
        gateField,
        triggerValue,
        rawTargets,
        affectedFields,
      });
    }
  }

  return rules;
}

// Whitespace-only counts as blank, not just "": some dropdowns/comboboxes in
// these forms have a first option that's a placeholder made of literal
// spaces (confirmed against forms/abs-study's own "27.Per.*" fields), always
// pre-selected on a pristine, unanswered template since a dropdown can't
// have a true empty selection the way a text field can.
function isBlank(field: PDFField): boolean {
  if (field instanceof PDFTextField) {
    return !(field.getText() ?? "").trim();
  }
  if (field instanceof PDFCheckBox) {
    const value = field.acroField.getValue().decodeText();
    return value === "Off" || !value.trim();
  }
  if (field instanceof PDFRadioGroup) {
    return field.getSelected() === undefined;
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return field.getSelected().every((value) => !value.trim());
  }
  return true;
}

function getGateValue(form: PDFForm, gateField: string): string | undefined {
  const field = form.getFieldMaybe(gateField);
  if (!field) return undefined;
  if (field instanceof PDFCheckBox) {
    const value = field.acroField.getValue().decodeText();
    return value === "Off" ? undefined : value;
  }
  if (field instanceof PDFRadioGroup) return field.getSelected();
  if (field instanceof PDFTextField) return field.getText() ?? undefined;
  return undefined;
}

// Acrobat enforces "hidden implies blank" live, every time a gate's answer
// changes (confirmed by reading lockUnlockNoYes's own source: it blanks a
// target's value the instant it hides it). pdf-lib never runs that JS, so
// nothing enforces this when data is filled outside Acrobat - this checks
// the same invariant after the fact, against the field's real current
// value rather than assuming intent from the input JSON, so promoting a
// field to the business schema (which reads/writes it a different way)
// doesn't hide it from this check.
export function findGateViolations(form: PDFForm): string[] {
  const violations: string[] = [];

  for (const rule of extractGateGraph(form)) {
    const gateValue = getGateValue(form, rule.gateField);
    if (gateValue === rule.triggerValue) continue; // unlocked branch - any state is fine

    for (const name of rule.affectedFields) {
      const field = form.getFieldMaybe(name);
      if (!field || !isFillable(field)) continue; // buttons (e.g. GoTo targets) hold no data
      if (!isBlank(field)) {
        violations.push(
          `${rule.gateField} = ${JSON.stringify(gateValue ?? "")} locks "${name}", but it holds a non-blank value`,
        );
      }
    }
  }

  return violations;
}
