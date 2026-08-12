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
  PDFString,
  PDFHexString,
  PDFRawStream,
  PDFContentStream,
  decodePDFRawStream,
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

// /AA /F (Format) and /AA /K (Keystroke) are JavaScript actions Acrobat runs
// as you type - never executed by pdf-lib or this project (we stay JS-free),
// but the source string itself is readable, unexecuted, straight off the
// field dict. Adobe's standard date/number widgets carry calls like
// AFDate_FormatEx("dd mm yyyy") here - the exact format a calendar picker
// enforces, available without opening the PDF in a viewer.
export function getActionJS(field: PDFField, actionKey: "F" | "K"): string | undefined {
  const aa = field.acroField.dict.lookup(PDFName.of("AA"));
  if (!(aa instanceof PDFDict)) return undefined;
  const action = aa.lookup(PDFName.of(actionKey));
  if (!(action instanceof PDFDict)) return undefined;
  const js = action.lookup(PDFName.of("JS"));
  if (js instanceof PDFString || js instanceof PDFHexString) return js.decodeText();
  return undefined;
}

const AF_DATE_FORMAT_RE = /AFDate_(?:FormatEx|Format)\s*\(\s*"([^"]+)"/;

// Adobe's date format string (e.g. "dd mm yyyy") using the same
// AFDate_FormatEx call for every date field a form has - not specific to any
// one field's meaning, just a structural fact about how that field is typed.
// Checked on both Format and Keystroke actions since either can carry it.
function getDateFormat(field: PDFField): string | undefined {
  for (const key of ["F", "K"] as const) {
    const match = getActionJS(field, key)?.match(AF_DATE_FORMAT_RE);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

interface DatePattern {
  regex: RegExp;
  render: (date: Date) => string;
}

// Turns an Adobe date-format string into a regex (for validating a real
// value against it) and a renderer (for synthesizing one) - runs of d/m/y
// become zero-padded digit groups of that width, everything else is a
// literal separator (space, slash, dash, dot - whatever the form uses).
function buildDatePattern(format: string): DatePattern {
  const tokens = format.match(/[dmy]+|[^dmy]+/gi) ?? [];
  const regexParts: string[] = [];
  const renderers: Array<(date: Date) => string> = [];
  for (const token of tokens) {
    if (/^d+$/i.test(token)) {
      regexParts.push(`\\d{${token.length}}`);
      renderers.push((date) => String(date.getDate()).padStart(token.length, "0"));
    } else if (/^m+$/i.test(token)) {
      regexParts.push(`\\d{${token.length}}`);
      renderers.push((date) => String(date.getMonth() + 1).padStart(token.length, "0"));
    } else if (/^y+$/i.test(token)) {
      regexParts.push(`\\d{${token.length}}`);
      renderers.push((date) => String(date.getFullYear()).padStart(token.length, "0").slice(-token.length));
    } else {
      regexParts.push(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      renderers.push(() => token);
    }
  }
  return {
    regex: new RegExp(`^${regexParts.join("")}$`),
    render: (date) => renderers.map((render) => render(date)).join(""),
  };
}

// An obviously-fake but structurally valid placeholder, same spirit as the
// "T-<name>" placeholder used for other text fields - not a real date, just
// something that renders into every date field's own DD/MM/YYYY-shaped cells
// instead of truncated field-name garbage.
const PLACEHOLDER_DATE = new Date(2000, 0, 1);

// pdf-lib's multiline auto-size (font size 0) picks a font size by assuming
// any run of text can be wrapped onto further lines to fit the field's
// height (computeFontSize in pdf-lib's layout code) - but its actual layout
// only ever breaks lines on whitespace. A field name like "Q16Details_Payment"
// has none, so the size it picks assumes wrapping that never happens, and the
// real render overflows the box as one long line. Field names are
// dot/underscore/dash/camelCase-joined identifiers, not prose - putting real
// word boundaries back in keeps pdf-lib's estimate and its actual layout in
// agreement for every multiline field, not just this one.
function humanize(name: string): string {
  return name
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
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
      const dateFormat = getDateFormat(field);
      if (dateFormat) {
        shape[name] = z.string().regex(buildDatePattern(dateFormat).regex, `expected format ${dateFormat}`);
      } else {
        const maxLength = field.getMaxLength();
        shape[name] = maxLength ? z.string().max(maxLength) : z.string();
      }
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

const AUTO_FONT_SIZE_RE = /(?:^|\s)0\s+Tf\b/;
const APPEARANCE_TF_SIZE_RE = /\/\S+\s+([\d.]+)\s+Tf\b/;

// Right after form.updateFieldAppearances(), a widget's /AP /N is still an
// in-memory PDFContentStream (pdf-lib's own builder, uncompressed) - it only
// becomes a PDFRawStream needing decodePDFRawStream once the document has
// gone through save()+reload. finalizeAppearances always calls this between
// the two updateFieldAppearances() passes, before any save, so the
// PDFContentStream case is the one that actually gets hit - the raw-stream
// path is kept only for robustness against a differently-timed caller.
function extractAppearanceFontSize(field: PDFTextField): number | undefined {
  for (const widget of field.acroField.getWidgets()) {
    const ap = widget.dict.lookup(PDFName.of("AP"));
    if (!(ap instanceof PDFDict)) continue;
    const n = ap.lookup(PDFName.of("N"));
    let content: string | undefined;
    if (n instanceof PDFContentStream) {
      content = n.getContentsString();
    } else if (n instanceof PDFRawStream) {
      content = new TextDecoder().decode(decodePDFRawStream(n).decode());
    }
    const size = Number(content?.match(APPEARANCE_TF_SIZE_RE)?.[1]);
    if (size > 0) return size;
  }
  return undefined;
}

// A field's /DA can specify font size 0 ("auto"). form.updateFieldAppearances()
// resolves this to a real size and writes it straight back into /DA (already
// true of pdf-lib on its own - confirmed directly, not assumed). But the size
// it picks is whatever just barely fits pdf-lib's own width/height math - for
// Q16Details_Payment that's a ~2.7% margin (225.9pt of text in a 232pt box).
// A viewer that live-renders an *interactive* (non-flattened) text field
// straight from /DA - which Chrome's own form-field widgets do, confirmed
// against this exact field - lays that same explicit size out using its own
// metrics and padding conventions, not pdf-lib's. A margin that thin has
// nothing left to absorb the difference, so the same field and value can
// look fine in one renderer and wrap/scroll in another for reasons that have
// nothing to do with the value. Shaving a safety margin off pdf-lib's own
// tightest-fit choice - never below what it originally picked when that was
// already small - buys the headroom every other renderer needs to agree.
const FONT_SIZE_SAFETY_MARGIN = 0.85;
const MIN_SAFE_FONT_SIZE = 8;

// Scoped to fields that were auto-sized ("0 Tf") *before* the first
// updateFieldAppearances() call - by the time this runs, pdf-lib has already
// resolved and overwritten /DA with a real number, so "was this field auto"
// has to be captured up front. A field whose original template author chose
// a fixed size deliberately is left untouched.
function pinAutoFontSizes(form: PDFForm, autoSizedFieldNames: ReadonlySet<string>): void {
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField) || !autoSizedFieldNames.has(field.getName())) continue;
    const size = extractAppearanceFontSize(field);
    if (!size) continue;
    const safeSize = Math.min(size, Math.max(MIN_SAFE_FONT_SIZE, Math.floor(size * FONT_SIZE_SAFETY_MARGIN)));
    field.setFontSize(safeSize);
  }
}

// The one place every fill path should finalize appearances instead of
// calling form.updateFieldAppearances() directly (hard rule 2) - it still
// does that, but also closes the safety-margin gap above for whichever
// fields were actually auto-sized.
export function finalizeAppearances(form: PDFForm): void {
  const autoSizedFieldNames = new Set(
    form
      .getFields()
      .filter((field): field is PDFTextField => field instanceof PDFTextField)
      .filter((field) => AUTO_FONT_SIZE_RE.test(field.acroField.getDefaultAppearance() ?? ""))
      .map((field) => field.getName()),
  );
  form.updateFieldAppearances();
  pinAutoFontSizes(form, autoSizedFieldNames);
  form.updateFieldAppearances();
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
      const dateFormat = getDateFormat(field);
      if (dateFormat) {
        data[name] = buildDatePattern(dateFormat).render(PLACEHOLDER_DATE);
      } else {
        const maxLength = field.getMaxLength();
        const placeholder = field.isMultiline() ? `T ${humanize(name)}` : `T-${name}`;
        data[name] = placeholder.slice(0, maxLength ?? placeholder.length) || "T";
      }
    } else {
      const options = realOptions(field);
      if (options.length === 0) continue;
      data[name] = options[0]!;
    }
  }
  return data;
}
