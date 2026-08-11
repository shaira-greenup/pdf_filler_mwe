import {
  PDFForm,
  PDFField,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFName,
  PDFNumber,
  PDFDict,
} from "pdf-lib";
import { z } from "zod";

// This module makes no assumptions about what any field *means* - it only
// uses what's structurally true of the PDF itself (field type, real export
// values, MaxLength, Calculate actions, Hidden state). It is meant to
// generalize to any AcroForm, not just the one form this project currently
// implements.

// PDF annotation flags (PDF spec, Table 165): bit 2 (value 2) is Hidden.
export const ANNOTATION_FLAG_HIDDEN = 2;

export function isHidden(field: PDFField): boolean {
  return field.acroField.getWidgets().some((widget) => {
    const flags = widget.dict.lookup(PDFName.of("F"));
    const flagsNum = flags instanceof PDFNumber ? flags.asNumber() : 0;
    return (flagsNum & ANNOTATION_FLAG_HIDDEN) !== 0;
  });
}

// Some forms gate entire sections behind a lead question (e.g. "Is anyone
// employed?"). Every widget in a gated section has the Hidden annotation
// flag set directly in the blank template - a static, spec-level rendering
// directive, not something only the form's own JavaScript can toggle.
// pdf-lib never runs that JavaScript, so satisfying a gate's value does not
// by itself reveal the section: we have to clear Hidden ourselves. Any
// field type can be gated this way, not just checkboxes.
export function unhide(field: PDFField): void {
  for (const widget of field.acroField.getWidgets()) {
    const current = widget.dict.lookup(PDFName.of("F"));
    const flags = current instanceof PDFNumber ? current.asNumber() : 0;
    widget.dict.set(PDFName.of("F"), PDFNumber.of(flags & ~ANNOTATION_FLAG_HIDDEN));
  }
}

// Some checkbox fields use one field with multiple widgets, each carrying a
// different on-value, to implement what is effectively a radio group (e.g.
// "FT"/"PT"/"Seasonal"/"Casual" on one field). pdf-lib's PDFCheckBox.check()
// and acroField.setValue() only ever recognize the *first* widget's
// on-value, so selecting any other widget's value has to bypass that guard
// directly.
export function selectCheckboxOption(form: PDFForm, fieldName: string, onValue: string): void {
  const field = form.getCheckBox(fieldName);
  const onValueName = PDFName.of(onValue);
  const widgets = field.acroField.getWidgets();
  const widget = widgets.find((w) => w.getOnValue() === onValueName);
  if (!widget) {
    const validOptions = widgets
      .map((w) => w.getOnValue()?.decodeText())
      .filter((v): v is string => v !== undefined);
    throw new Error(
      `${fieldName}: ${JSON.stringify(onValue)} is not a valid option. Valid options: ${JSON.stringify(validOptions)}`,
    );
  }
  field.acroField.dict.set(PDFName.of("V"), onValueName);
  for (const w of widgets) {
    w.setAppearanceState(w.getOnValue() === onValueName ? onValueName : PDFName.of("Off"));
  }
}

function hasCalculateAction(field: PDFField): boolean {
  const aa = field.acroField.dict.lookup(PDFName.of("AA"));
  return aa instanceof PDFDict && aa.has(PDFName.of("C"));
}

// Real export values for a field's options, regardless of whether it's a
// checkbox with multiple widgets (hard rule 7), a radio group, a dropdown,
// or an option list.
function realOptions(field: PDFField): string[] {
  if (field instanceof PDFCheckBox) {
    return field.acroField
      .getWidgets()
      .map((w) => w.getOnValue()?.decodeText())
      .filter((v): v is string => v !== undefined);
  }
  if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return field.getOptions();
  }
  return [];
}

// Fields this module will never touch: push buttons and signature fields
// have no settable value, and calculated fields must not be set directly
// (hard rule 5) - their inputs should be set instead, and Acrobat recomputes
// them on open.
export function isFillable(field: PDFField): boolean {
  if (hasCalculateAction(field)) return false;
  return (
    field instanceof PDFTextField ||
    field instanceof PDFCheckBox ||
    field instanceof PDFRadioGroup ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  );
}

// Builds a Zod schema straight from the PDF's own structure: one optional
// key per fillable field, typed to that field's real shape (a bounded
// string for text fields with a MaxLength, an enum of the real export
// values for choice fields). This schema is *derived*, not hand-authored -
// it changes automatically if the form's fields change.
export function buildGenericSchema(form: PDFForm): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of form.getFields()) {
    if (!isFillable(field)) continue;
    const name = field.getName();
    if (field instanceof PDFTextField) {
      const maxLength = field.getMaxLength();
      shape[name] = maxLength ? z.string().max(maxLength) : z.string();
    } else {
      const options = realOptions(field);
      if (options.length === 0) continue;
      shape[name] = z.enum(options as [string, ...string[]]);
    }
  }
  // .strict() so an unrecognized key throws instead of being silently
  // dropped by Zod's default object behavior - hard rule 1 (never invent or
  // silently skip a field name) applies to input validation too.
  return z.object(shape).partial().strict();
}

export function applyGenericData(form: PDFForm, data: Record<string, string>): void {
  for (const [name, value] of Object.entries(data)) {
    const field = form.getField(name); // throws NoSuchFieldError if missing - hard rule 1
    if (!isFillable(field)) {
      throw new Error(`${name}: ${field.constructor.name} is not fillable (button, signature, or calculated)`);
    }
    if (field instanceof PDFTextField) {
      field.setText(value);
    } else if (field instanceof PDFCheckBox) {
      selectCheckboxOption(form, name, value);
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      field.select(value);
    }
    // A field can be gated behind a Hidden section (hard rule 8). This is a
    // blanket policy for mechanical, whole-form coverage: unhide anything
    // we write a value to, regardless of what gate (if any) controls it.
    unhide(field);
  }
}

export function readGenericData(form: PDFForm, names: string[]): Record<string, string | undefined> {
  const data: Record<string, string | undefined> = {};
  for (const name of names) {
    const field = form.getField(name);
    if (field instanceof PDFTextField) {
      data[name] = field.getText();
    } else if (field instanceof PDFCheckBox) {
      const value = field.acroField.getValue().decodeText();
      data[name] = value === "Off" ? undefined : value;
    } else if (field instanceof PDFRadioGroup) {
      data[name] = field.getSelected();
    } else if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      data[name] = Array.isArray(selected) ? selected[0] : selected;
    } else if (field instanceof PDFOptionList) {
      data[name] = field.getSelected()[0];
    }
  }
  return data;
}

// One valid, in-bounds placeholder value per fillable field - proves the
// pattern holds across the whole form without asserting what any field
// actually means. Deliberately not testing hostile input here (Milestone 4
// already covers that); every value here is meant to be safely acceptable.
export function synthesizeValidData(form: PDFForm): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of form.getFields()) {
    if (!isFillable(field)) continue;
    const name = field.getName();
    if (field instanceof PDFTextField) {
      const maxLength = field.getMaxLength();
      const placeholder = `T-${name}`;
      data[name] = placeholder.slice(0, maxLength ?? placeholder.length) || "T";
    } else {
      const options = realOptions(field);
      if (options.length === 0) continue;
      data[name] = options[0]!;
    }
  }
  return data;
}
