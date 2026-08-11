import { describe, test, expect, beforeAll } from "bun:test";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import {
  buildGenericSchema,
  applyGenericData,
  readGenericData,
  synthesizeValidData,
  isFillable,
} from "./genericFields";

// Proves the pattern - not business meaning - holds across the whole form:
// every fillable field can be inspected, filled with a valid value, saved,
// reloaded, read back correctly, and unhidden if it was gated. This does
// NOT assert what any field means; see CLAUDE.md's Workflow section on the
// difference between mechanical completeness and business-semantic schema.

const FORM_PATH = "fixtures/blank-form.pdf";
const TOTAL_FIELD_COUNT = 565;
const EXPECTED_FILLABLE_COUNT = 504; // 565 - 39 calculated - 22 buttons - 0 signatures

let blankBytes: Uint8Array;

beforeAll(async () => {
  blankBytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());
});

async function loadForm() {
  const pdf = await PDFDocument.load(blankBytes, { ignoreEncryption: true });
  return { pdf, form: pdf.getForm() };
}

function isHidden(field: { acroField: { getWidgets(): { dict: { lookup(n: ReturnType<typeof PDFName.of>): unknown } }[] } }): boolean {
  return field.acroField.getWidgets().some((widget) => {
    const flags = widget.dict.lookup(PDFName.of("F"));
    const flagsNum = flags instanceof PDFNumber ? flags.asNumber() : 0;
    return (flagsNum & 2) !== 0;
  });
}

describe("whole-form mechanical completeness", () => {
  test("buildGenericSchema derives one key per fillable field, excluding buttons/signatures/calculated fields", async () => {
    const { form } = await loadForm();
    const schema = buildGenericSchema(form);
    expect(Object.keys(schema.shape).length).toBe(EXPECTED_FILLABLE_COUNT);
  });

  test("isFillable's count matches the schema's count", async () => {
    const { form } = await loadForm();
    const fillableCount = form.getFields().filter(isFillable).length;
    expect(fillableCount).toBe(EXPECTED_FILLABLE_COUNT);
  });

  test("synthesizeValidData covers every fillable field and validates against the derived schema", async () => {
    const { form } = await loadForm();
    const schema = buildGenericSchema(form);
    const data = synthesizeValidData(form);
    expect(Object.keys(data).length).toBe(EXPECTED_FILLABLE_COUNT);
    expect(() => schema.parse(data)).not.toThrow();
  });

  test("applying synthesized data to every field round-trips and unhides gated fields", async () => {
    const { pdf, form } = await loadForm();
    const data = synthesizeValidData(form);

    applyGenericData(form, data);
    form.updateFieldAppearances();
    const outBytes = await pdf.save();

    const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
    const verifyForm = verifyPdf.getForm();

    const names = Object.keys(data);
    const readBack = readGenericData(verifyForm, names);

    const mismatches: string[] = [];
    const stillHidden: string[] = [];
    for (const name of names) {
      if (readBack[name] !== data[name]) {
        mismatches.push(`${name}: expected ${JSON.stringify(data[name])}, got ${JSON.stringify(readBack[name])}`);
      }
      if (isHidden(verifyForm.getField(name))) {
        stillHidden.push(name);
      }
    }

    expect(mismatches).toEqual([]);
    expect(stillHidden).toEqual([]);
  });

  test("filling every field does not flatten the form or touch calculated fields", async () => {
    const { pdf, form } = await loadForm();
    const data = synthesizeValidData(form);
    applyGenericData(form, data);
    form.updateFieldAppearances();
    const outBytes = await pdf.save();

    const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
    const verifyForm = verifyPdf.getForm();
    expect(verifyForm.getFields().length).toBe(TOTAL_FIELD_COUNT);

    // Calculated fields were never in `data` at all (isFillable excludes
    // them), so they must still read back as unset.
    const untouchedCalculated = verifyForm.getFields().filter((f) => !isFillable(f) && !data[f.getName()]);
    expect(untouchedCalculated.length).toBeGreaterThan(0);
  });

  test("applying a value to a non-fillable field throws", async () => {
    const { form } = await loadForm();
    expect(() => applyGenericData(form, { Clear: "anything" })).toThrow();
  });

  test("applying an unrecognized field name throws with the name (hard rule 1)", async () => {
    const { form } = await loadForm();
    let message = "";
    try {
      applyGenericData(form, { "Not.A.Real.Field": "x" });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("Not.A.Real.Field");
  });
});
