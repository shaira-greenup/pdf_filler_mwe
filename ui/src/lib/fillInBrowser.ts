import { PDFDocument } from "pdf-lib";
import { buildGenericSchema, applyGenericData, readGenericData, finalizeAppearances } from "../../../scripts/genericFields";
import { findGateViolations } from "../../../scripts/lib/gateGraph";
import { loadFormInBrowser } from "./loadFormBrowser";
import type { FormRegistryEntry } from "./registry";

export interface FillResult {
  bytes: Uint8Array;
  violations: string[];
}

// Mirrors scripts/lib/fillForm.ts's own private helper of the same name -
// duplicated rather than imported because fillForm.ts also carries
// Bun.file/Bun.write/dynamic-import-by-path, which don't belong in a
// browser bundle (same reason hash.ts got split into hashParse.ts).
function assertDeepEqual(label: string, expected: unknown, actual: unknown): void {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

// Browser port of scripts/lib/fillForm.ts's sequence. Differences are only
// in *where the input comes from*, not in what happens to it:
//  - business data comes from the Solid form's state, not sample-data.json
//  - generic-layer data is whatever the caller explicitly passes (default
//    none) - deliberately NOT the registry's bundled sample-data.json.
//    That file's placeholder junk ("T-Q8.EmployerName1" etc.) was fine for
//    the earlier CLI-parity smoke test, but is wrong for the real pipeline:
//    a field nothing could confidently derive should stay blank on the
//    actual PDF, not get filled with leftover test scaffolding.
//  - the result is bytes to hand to download.ts, not a path Bun.write()s to
// Every step below - schema parse, applyFormData, buildGenericSchema,
// applyGenericData, finalizeAppearances, the read-back deep-equal check
// (hard rule 9), findGateViolations - calls straight into the same modules
// the CLI uses, unmodified.
export async function fillFormInBrowser(
  entry: FormRegistryEntry,
  businessInput: unknown,
  genericInput: Record<string, unknown> = {},
): Promise<FillResult> {
  const { pdf, form } = await loadFormInBrowser(entry);

  const knownKeys = new Set(Object.keys(entry.FormDataSchema.shape));
  const genericRaw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(genericInput)) {
    if (!knownKeys.has(key)) genericRaw[key] = value;
  }

  const data = entry.FormDataSchema.parse(businessInput);
  entry.applyFormData(form, data);

  let genericData: Record<string, string> = {};
  if (Object.keys(genericRaw).length > 0) {
    const collisions = Object.keys(genericRaw).filter((name) => entry.MAPPED_FIELD_NAMES.includes(name));
    if (collisions.length > 0) {
      throw new Error(
        `${JSON.stringify(collisions)} already have a single source of truth in the business schema - ` +
          `set them via the named schema fields instead of by their raw PDF field name.`,
      );
    }
    // Real per-field type checking (real export values, MaxLength) happens
    // here, once the PDF's actual structure is known.
    genericData = buildGenericSchema(form).parse(genericRaw) as Record<string, string>;
    applyGenericData(form, genericData);
  }

  finalizeAppearances(form);
  const outBytes = await pdf.save();

  const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
  const verifyForm = verifyPdf.getForm();
  const readBack = entry.readFormData(verifyForm);
  assertDeepEqual("business data", data, readBack);

  if (Object.keys(genericData).length > 0) {
    const names = Object.keys(genericData);
    const genericReadBack = readGenericData(verifyForm, names);
    for (const name of names) {
      assertDeepEqual(name, genericData[name], genericReadBack[name]);
    }
  }

  // Not a hard failure here either, for the same reason as fillForm.ts: only
  // a fraction of either form's gates have been hand-verified. The UI
  // surfaces these as a visible warning panel instead of a console line -
  // see docs/20260818_browser-ui-mwe-plan.md.
  const violations = findGateViolations(verifyForm);

  return { bytes: outBytes, violations };
}
