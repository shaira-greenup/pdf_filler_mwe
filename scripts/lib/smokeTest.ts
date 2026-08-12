import { PDFDocument } from "pdf-lib";
import { applyGenericData, readGenericData, synthesizeValidData, isHidden, finalizeAppearances } from "../genericFields";

export interface SmokeTestResult {
  totalFieldCount: number;
  fillableCount: number;
  mismatches: string[];
  stillHidden: string[];
}

// Proves the pattern - not business meaning - holds for a given PDF: every
// fillable field can be filled with a synthesized valid value, saved,
// reloaded, read back correctly, and unhidden if it was gated. This asserts
// nothing about what any field means, and needs zero hand-authored business
// schema - that's what makes it usable against a form nobody has mapped
// yet. Callers are responsible for encryption/hash checks (see loadForm.ts)
// before handing this function bytes.
export async function runSmokeTest(bytes: Uint8Array): Promise<SmokeTestResult> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const data = synthesizeValidData(form);

  applyGenericData(form, data);
  finalizeAppearances(form);
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

  return {
    totalFieldCount: verifyForm.getFields().length,
    fillableCount: names.length,
    mismatches,
    stillHidden,
  };
}
