import { PDFDocument } from "pdf-lib";
import type { FormPaths } from "./formPaths";
import { resolveFormPaths } from "./formPaths";
import { loadPdfBytes } from "./loadForm";
import { detectRealEncryption, encryptionErrorMessage } from "./encryption";
import { writeFieldsTxt } from "./inspectForm";
import { synthesizeValidData } from "../genericFields";

const SCHEMA_TEMPLATE = `import { z } from "zod";

// No business-meaningful fields identified yet for this form. Every field
// falls through to the generic layer - this is a valid state, not a
// placeholder that must be filled in immediately. See CLAUDE.md's Workflow
// section on mechanical completeness vs. business-semantic schema.
export const FormDataSchema = z.object({});

export type FormData = z.infer<typeof FormDataSchema>;
`;

const MAPPING_TEMPLATE = `import type { PDFForm } from "pdf-lib";
import type { FormData } from "./schema";

// No fields are hand-mapped for this form yet.
export const MAPPED_FIELD_NAMES: readonly string[] = [];

export function applyFormData(_form: PDFForm, _data: FormData): void {}

export function readFormData(_form: PDFForm): FormData {
  return {};
}
`;

// A freshly-init'd form is immediately usable through the generic layer -
// no business mapping required. Scaffolds an empty schema/mapping pair and
// seeds sample-data.json with a synthesized placeholder value per field, so
// there's something to fill and verify against from the moment this
// returns (absorbs what a separate "seed" step would otherwise need to do).
export async function initForm(id: string, sourcePdfPath: string): Promise<FormPaths> {
  const paths = resolveFormPaths(id);

  if (await Bun.file(paths.pdfPath).exists()) {
    throw new Error(`forms/${id}/ already exists (${paths.pdfPath}). Choose a different id.`);
  }

  const sourceBytes = await loadPdfBytes(sourcePdfPath);
  const encryptionInfo = detectRealEncryption(sourceBytes);
  if (encryptionInfo.blocking) {
    throw new Error(encryptionErrorMessage(sourcePdfPath, encryptionInfo));
  }

  // Copy, never reference - the fixture must be locally owned and fixed
  // (hard rule 1), matching what assertTemplateHash assumes.
  await Bun.write(paths.pdfPath, sourceBytes);
  await writeFieldsTxt(paths);
  await Bun.write(paths.schemaPath, SCHEMA_TEMPLATE);
  await Bun.write(paths.mappingPath, MAPPING_TEMPLATE);

  const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const data = synthesizeValidData(form);
  await Bun.write(paths.sampleDataPath, JSON.stringify(data, null, 2) + "\n");

  return paths;
}
