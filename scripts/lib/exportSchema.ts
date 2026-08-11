import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import type { FormPaths } from "./formPaths";
import { loadForm } from "./loadForm";
import { assertTemplateHash } from "./hash";
import { buildGenericSchema } from "../genericFields";

interface SchemaModule {
  FormDataSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
}
interface MappingModule {
  MAPPED_FIELD_NAMES: readonly string[];
}

export async function exportSchema(paths: FormPaths): Promise<{ propertyCount: number }> {
  const { bytes, form } = await loadForm(paths.pdfPath);
  await assertTemplateHash(bytes, paths.fieldsTxtPath);

  const schemaModule = (await import(pathToFileURL(resolve(paths.schemaPath)).href)) as SchemaModule;
  const mappingModule = (await import(pathToFileURL(resolve(paths.mappingPath)).href)) as MappingModule;

  const generic = buildGenericSchema(form);
  const genericShapeMinusMapped = Object.fromEntries(
    Object.entries(generic.shape).filter(([name]) => !mappingModule.MAPPED_FIELD_NAMES.includes(name)),
  );
  const combined = schemaModule.FormDataSchema.extend(genericShapeMinusMapped);

  const jsonSchema = combined.toJSONSchema();
  await Bun.write(paths.sampleDataSchemaPath, JSON.stringify(jsonSchema, null, 2) + "\n");

  const propertyCount = Object.keys((jsonSchema as { properties?: object }).properties ?? {}).length;
  return { propertyCount };
}
