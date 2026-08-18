import type { PDFForm } from "pdf-lib";
import type { z } from "zod";

import * as incomeAndAssetsSchema from "../../../forms/income-and-assets/schema";
import * as incomeAndAssetsMapping from "../../../forms/income-and-assets/mapping";

import * as absStudySchema from "../../../forms/abs-study/schema";
import * as absStudyMapping from "../../../forms/abs-study/mapping";

// Mirrors scripts/lib/fillForm.ts's own SchemaModule/MappingModule shape -
// every form's schema.ts/mapping.ts is expected to export this shape by
// convention (see CLAUDE.md's Workflow section).
interface SchemaModule {
  FormDataSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
}
interface MappingModule {
  MAPPED_FIELD_NAMES: readonly string[];
  applyFormData: (form: PDFForm, data: any) => void;
  readFormData: (form: PDFForm) => unknown;
}

export interface FormRegistryEntry extends SchemaModule, MappingModule {
  id: string;
  label: string;
  pdfUrl: string;
  fieldsTxtUrl: string;
}

function buildEntry(
  id: string,
  label: string,
  schema: SchemaModule,
  mapping: MappingModule,
  pdfUrl: URL,
  fieldsTxtUrl: URL,
): FormRegistryEntry {
  return {
    id,
    label,
    FormDataSchema: schema.FormDataSchema,
    MAPPED_FIELD_NAMES: mapping.MAPPED_FIELD_NAMES,
    applyFormData: mapping.applyFormData,
    readFormData: mapping.readFormData,
    pdfUrl: pdfUrl.href,
    fieldsTxtUrl: fieldsTxtUrl.href,
  };
}

// Two fixed, known forms - not a dynamic-by-id loader. Same "fixed, known
// target" scope CLAUDE.md describes for the CLI, just applied to the
// browser UI: every consumer of this registry can assume exactly these two
// entries exist, nothing more. blank-form.pdf/fields.txt are resolved via
// new URL(...) straight against forms/<id>/ - the real, single-source-of-
// truth location - not a duplicated copy bundled under ui/.
export const FORM_REGISTRY: Record<string, FormRegistryEntry> = {
  "income-and-assets": buildEntry(
    "income-and-assets",
    "Income and Assets",
    incomeAndAssetsSchema,
    incomeAndAssetsMapping,
    new URL("../../../forms/income-and-assets/blank-form.pdf", import.meta.url),
    new URL("../../../forms/income-and-assets/fields.txt", import.meta.url),
  ),
  "abs-study": buildEntry(
    "abs-study",
    "ABSTUDY",
    absStudySchema,
    absStudyMapping,
    new URL("../../../forms/abs-study/blank-form.pdf", import.meta.url),
    new URL("../../../forms/abs-study/fields.txt", import.meta.url),
  ),
};

export function listFormEntries(): FormRegistryEntry[] {
  return Object.values(FORM_REGISTRY);
}
