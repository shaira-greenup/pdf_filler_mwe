import { PDFDocument, type PDFForm } from "pdf-lib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import type { FormPaths } from "./formPaths";
import { loadForm } from "./loadForm";
import { assertTemplateHash } from "./hash";
import { buildGenericSchema, applyGenericData, readGenericData } from "../genericFields";

// Every form's schema.ts/mapping.ts is expected to export this shape by
// convention (see forms/income-and-assets/ for the reference example).
// There is no way to know the real FormData shape at compile time for an
// arbitrary form loaded dynamically at runtime - that's an inherent
// property of loading per-form business logic by form id, not a gap this
// module can close.
interface SchemaModule {
  FormDataSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
}
interface MappingModule {
  MAPPED_FIELD_NAMES: readonly string[];
  applyFormData: (form: PDFForm, data: any) => void;
  readFormData: (form: PDFForm) => unknown;
}

function assertDeepEqual(label: string, expected: unknown, actual: unknown): void {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

export async function fillForm(
  paths: FormPaths,
  opts: { dataPath?: string; outPath?: string } = {},
): Promise<{ outPath: string }> {
  const dataPath = opts.dataPath ?? paths.sampleDataPath;
  const outPath = opts.outPath ?? `out/${paths.id}/filled.pdf`;

  const { bytes, pdf, form } = await loadForm(paths.pdfPath);
  await assertTemplateHash(bytes, paths.fieldsTxtPath);

  const schemaModule = (await import(pathToFileURL(resolve(paths.schemaPath)).href)) as SchemaModule;
  const mappingModule = (await import(pathToFileURL(resolve(paths.mappingPath)).href)) as MappingModule;

  // Everything in the data file sits flat at one level. Keys the business
  // schema declares go through it; everything else is a raw PDF field name,
  // checked against the PDF's real structure instead (genericFields.ts).
  const rawData = (await Bun.file(dataPath).json()) as Record<string, unknown>;
  const knownKeys = new Set(Object.keys(schemaModule.FormDataSchema.shape));
  const knownRaw: Record<string, unknown> = {};
  const genericRaw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) {
    (knownKeys.has(key) ? knownRaw : genericRaw)[key] = value;
  }

  const data = schemaModule.FormDataSchema.parse(knownRaw);
  mappingModule.applyFormData(form, data);

  let genericData: Record<string, string> = {};
  if (Object.keys(genericRaw).length > 0) {
    const collisions = Object.keys(genericRaw).filter((name) => mappingModule.MAPPED_FIELD_NAMES.includes(name));
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

  form.updateFieldAppearances();
  const outBytes = await pdf.save();
  await Bun.write(outPath, outBytes);

  const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
  const verifyForm = verifyPdf.getForm();
  const readBack = mappingModule.readFormData(verifyForm);
  assertDeepEqual("business data", data, readBack);

  if (Object.keys(genericData).length > 0) {
    const names = Object.keys(genericData);
    const genericReadBack = readGenericData(verifyForm, names);
    for (const name of names) {
      assertDeepEqual(name, genericData[name], genericReadBack[name]);
    }
  }

  return { outPath };
}
