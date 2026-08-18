import {
  PDFForm,
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from "pdf-lib";
import { getActionJS, getDictActionJS, isFillable } from "../genericFields";

export interface GateRule {
  sourceField: string;
  gateField: string;
  triggerValue: string;
  rawTargets: string[];
  affectedFields: string[];
}

export interface UnclassifiedAction {
  sourceField: string;
  actionKey: "C" | "Bl";
  snippet: string;
}

// Matches a government-form-authoring convention (a document-level helper
// script, confirmed by reading its actual source off this form's own
// /Names/JavaScript catalog entry): lockUnlockNoYes(gateField, triggerValue,
// "target1, target2") reveals the named targets when gateField's value
// equals triggerValue, and hides + blanks them otherwise. A single
// Calculate action can hold several semicolon-separated calls (one per
// possible answer), so this matches globally, not just the first call.
const LOCK_UNLOCK_RE = /lockUnlockNoYes\(\s*this\.getField\(\s*"([^"]*)"\s*\)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g;

// A second, distinct convention (see docs/20260814_action-audit.md): a
// per-widget Blur action on a checkbox that clears a paired free-text field
// whenever the checkbox is set to any real value. Confirmed identical in
// both instances found in abs-study (Title1 -> TitleOther1, Board.Title ->
// Board.TitleOther) - only the field name changes. \1 requires the same
// local variable name to reappear before ".value = \"\"", which is how
// these two known instances are shaped; a differently-named local variable
// with the same effect would fall through to findUnclassifiedActions below
// rather than being silently misread.
const BLUR_CLEAR_RE = /(\w+)\s*=\s*this\.getField\(\s*"([^"]+)"\s*\)\s*;[\s\S]*?event\.target\.value\s*!=\s*"Off"[\s\S]*?\1\.value\s*=\s*""/;

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

function dedupeRules(rules: GateRule[]): GateRule[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.gateField}|${rule.triggerValue}|${rule.affectedFields.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractLockUnlockRules(form: PDFForm, allNames: string[]): GateRule[] {
  const rules: GateRule[] = [];

  for (const field of form.getFields()) {
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

// The "unlocked" state for this convention is the gate reading "Off" (no
// real option chosen) - modeled as an ordinary GateRule with
// triggerValue "Off" so it flows through the exact same findGateViolations
// logic as lockUnlockNoYes rules, rather than a parallel checking path.
function extractBlurPairRules(form: PDFForm, allNames: string[]): GateRule[] {
  const rules: GateRule[] = [];

  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const js = getDictActionJS(widget.dict, "Bl");
      if (!js) continue;
      const match = js.match(BLUR_CLEAR_RE);
      if (!match) continue;

      const target = (match[2] ?? "").trim();
      const affectedFields = resolveTarget(allNames, target);
      if (affectedFields.length === 0) continue;

      rules.push({
        sourceField: field.getName(),
        gateField: field.getName(),
        triggerValue: "Off",
        rawTargets: [target],
        affectedFields,
      });
    }
  }

  return dedupeRules(rules);
}

// Reads every field's own Calculate action and every widget's own Blur
// action (never executed by pdf-lib, only parsed as text) and extracts the
// gating rules they encode. Forms that use neither convention simply yield
// an empty graph - this is an opportunistic structural match, the same kind
// as AFDate_FormatEx detection, not something every form is assumed to
// carry.
export function extractGateGraph(form: PDFForm): GateRule[] {
  const allNames = form.getFields().map((field) => field.getName());
  return [...extractLockUnlockRules(form, allNames), ...extractBlurPairRules(form, allNames)];
}

// Surfaces Calculate/Blur actions that carry real JS but match neither
// known convention, instead of the alternative - a field like this simply
// producing zero rules and looking identical to a field with no gating
// logic at all. Confirmed necessary by a real case (docs/20260814_action-
// audit.md): hand-written, form-specific JS (an OR-condition plus a
// resetForm call) that isn't safe to auto-parse the way the two known
// conventions are, but should never be silently invisible either.
export function findUnclassifiedActions(form: PDFForm): UnclassifiedAction[] {
  const results: UnclassifiedAction[] = [];

  for (const field of form.getFields()) {
    const js = getActionJS(field, "C");
    if (js && [...js.matchAll(LOCK_UNLOCK_RE)].length === 0) {
      results.push({ sourceField: field.getName(), actionKey: "C", snippet: js.slice(0, 300) });
    }
    for (const widget of field.acroField.getWidgets()) {
      const bl = getDictActionJS(widget.dict, "Bl");
      if (bl && !BLUR_CLEAR_RE.test(bl)) {
        results.push({ sourceField: field.getName(), actionKey: "Bl", snippet: bl.slice(0, 300) });
      }
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.sourceField}|${r.actionKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

// Returns the field's literal current value, including the checkbox
// literal "Off" - not normalized to undefined, because some rules (the
// Blur-pair convention above) use "Off" itself as a real, comparable
// triggerValue. lockUnlockNoYes rules never use "Off" as a trigger, so
// this is a safe, uniform representation for both conventions.
function getGateValue(form: PDFForm, gateField: string): string | undefined {
  const field = form.getFieldMaybe(gateField);
  if (!field) return undefined;
  if (field instanceof PDFCheckBox) {
    return field.acroField.getValue().decodeText();
  }
  if (field instanceof PDFRadioGroup) return field.getSelected();
  if (field instanceof PDFTextField) return field.getText() ?? undefined;
  return undefined;
}

// Acrobat enforces "hidden implies blank" live, every time a gate's answer
// changes (confirmed by reading lockUnlockNoYes's own source: it blanks a
// target's value the instant it hides it - and the Blur-pair convention
// does the equivalent on losing focus). pdf-lib never runs either, so
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
