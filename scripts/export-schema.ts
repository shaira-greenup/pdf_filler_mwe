import { PDFDocument } from "pdf-lib";
import { FormDataSchema } from "./schema";
import { buildGenericSchema } from "./genericFields";
import { MAPPED_FIELD_NAMES } from "./mapping";
import { assertTemplateHash } from "./template";

// Writes a standard JSON Schema document describing exactly what
// fixtures/sample-data.json must look like: the business-named fields
// (familyName, employment, ...) plus every other real PDF field by its
// exact name, each with its real constraints (checkbox export values,
// MaxLength, required-ness). Meant to be handed to whatever generates real
// input data - an AI, another script, a business-rules engine - so it knows
// the exact contract without needing an example that could go stale or get
// submitted by mistake. Re-run this whenever the form's fields change.

const FORM_PATH = "fixtures/blank-form.pdf";
const SCHEMA_PATH = "fixtures/sample-data.schema.json";

const bytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());
assertTemplateHash(bytes, FORM_PATH);

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

const generic = buildGenericSchema(form);
const genericShapeMinusMapped = Object.fromEntries(
  Object.entries(generic.shape).filter(([name]) => !MAPPED_FIELD_NAMES.includes(name)),
);
const combined = FormDataSchema.extend(genericShapeMinusMapped);

const jsonSchema = combined.toJSONSchema();
await Bun.write(SCHEMA_PATH, JSON.stringify(jsonSchema, null, 2) + "\n");

const propertyCount = Object.keys((jsonSchema as { properties?: object }).properties ?? {}).length;
console.log(`Wrote ${SCHEMA_PATH} (${propertyCount} properties).`);
