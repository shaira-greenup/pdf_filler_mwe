import {
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  type PDFField,
} from "pdf-lib";
import type { FormPaths } from "./formPaths";
import { loadForm } from "./loadForm";
import { sha256Hex } from "./hash";
import { ANNOTATION_FLAG_HIDDEN, getActionJS } from "../genericFields";
import { extractGateGraph, findUnclassifiedActions, type GateRule } from "./gateGraph";

// /TU is the field's tooltip/alternate name - the human-readable label
// Acrobat shows, which often carries a format hint (e.g. "(DD MM YYYY)")
// that isn't visible anywhere else in pdf-lib's own field API.
function getTooltip(field: PDFField): string | undefined {
  const tu = field.acroField.dict.lookup(PDFName.of("TU"));
  if (tu instanceof PDFString || tu instanceof PDFHexString) return tu.decodeText();
  return undefined;
}

export async function writeFieldsTxt(paths: FormPaths): Promise<{ fieldCount: number }> {
  const { bytes, form } = await loadForm(paths.pdfPath);
  const sha256 = sha256Hex(bytes);
  const hasXFA = form.hasXFA();
  const fields = form.getFields();

  const gateRulesBySource = new Map<string, GateRule[]>();
  for (const rule of extractGateGraph(form)) {
    const existing = gateRulesBySource.get(rule.sourceField);
    if (existing) existing.push(rule);
    else gateRulesBySource.set(rule.sourceField, [rule]);
  }

  const unclassifiedBySource = new Map<string, string[]>();
  for (const action of findUnclassifiedActions(form)) {
    const existing = unclassifiedBySource.get(action.sourceField);
    const entry = `(${action.actionKey}) ${action.snippet}`;
    if (existing) existing.push(entry);
    else unclassifiedBySource.set(action.sourceField, [entry]);
  }

  const lines: string[] = [];
  lines.push(`SHA-256: ${sha256}`);
  lines.push(`Has XFA: ${hasXFA}`);
  lines.push(`Field count: ${fields.length}`);
  lines.push("");

  for (const field of fields) {
    const name = field.getName();
    const type = field.constructor.name;
    lines.push(`Field: ${name}`);
    lines.push(`  Type: ${type}`);

    // Per-widget, not the single-boolean isHidden() - more detail is useful
    // here, e.g. a multi-widget checkbox where only some options are gated.
    const hidden = field.acroField.getWidgets().map((widget) => {
      const flags = widget.dict.lookup(PDFName.of("F"));
      const flagsNum = flags instanceof PDFNumber ? flags.asNumber() : 0;
      return (flagsNum & ANNOTATION_FLAG_HIDDEN) !== 0;
    });
    lines.push(`  Hidden: ${JSON.stringify(hidden)}`);

    const tooltip = getTooltip(field);
    if (tooltip !== undefined) lines.push(`  Tooltip: ${JSON.stringify(tooltip)}`);
    const formatJS = getActionJS(field, "F");
    if (formatJS !== undefined) lines.push(`  Format action: ${JSON.stringify(formatJS)}`);
    const keystrokeJS = getActionJS(field, "K");
    if (keystrokeJS !== undefined) lines.push(`  Keystroke action: ${JSON.stringify(keystrokeJS)}`);
    for (const rule of gateRulesBySource.get(name) ?? []) {
      lines.push(
        `  Gate logic: if ${rule.gateField} = ${JSON.stringify(rule.triggerValue)} -> affects [${rule.affectedFields.join(", ")}]`,
      );
    }
    for (const entry of unclassifiedBySource.get(name) ?? []) {
      lines.push(`  Unclassified action: ${JSON.stringify(entry)}`);
    }

    if (field instanceof PDFTextField) {
      const value = field.getText();
      lines.push(`  Value: ${JSON.stringify(value ?? null)}`);
      const maxLength = field.getMaxLength();
      lines.push(`  MaxLength: ${maxLength ?? "(none)"}`);
      lines.push(`  Combed: ${field.isCombed()}`);
    } else if (field instanceof PDFCheckBox) {
      // acroField.getOnValue() only inspects the field's first widget. Some
      // fields use one PDFCheckBox with multiple widgets - each widget its
      // own on-value - to implement what is effectively a radio group.
      // Reading getOnValue() alone would silently report only the first.
      const options = field.acroField
        .getWidgets()
        .map((widget) => widget.getOnValue())
        .filter((onValue): onValue is PDFName => onValue !== undefined)
        .map((onValue) => onValue.decodeText());
      lines.push(`  Value: ${field.acroField.getValue().decodeText()}`);
      lines.push(`  Options: ${JSON.stringify(options)}`);
    } else if (field instanceof PDFRadioGroup) {
      const selected = field.getSelected();
      lines.push(`  Value: ${JSON.stringify(selected ?? null)}`);
      lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
    } else if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      lines.push(`  Value: ${JSON.stringify(selected)}`);
      lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
    } else if (field instanceof PDFOptionList) {
      const selected = field.getSelected();
      lines.push(`  Value: ${JSON.stringify(selected)}`);
      lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
    } else if (field instanceof PDFButton) {
      lines.push(`  Value: (none, push button)`);
    } else if (field instanceof PDFSignature) {
      lines.push(`  Value: (none, signature field)`);
    } else {
      lines.push(`  Value: (unknown field type)`);
    }

    lines.push("");
  }

  const output = lines.join("\n");
  await Bun.write(paths.fieldsTxtPath, output);
  return { fieldCount: fields.length };
}
