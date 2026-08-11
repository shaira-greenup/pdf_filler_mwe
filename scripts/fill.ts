import { PDFDocument } from "pdf-lib";
import { FormDataSchema } from "./schema";
import { applyFormData, readFormData, MAPPED_FIELD_NAMES } from "./mapping";
import { buildGenericSchema, applyGenericData, readGenericData } from "./genericFields";
import { assertTemplateHash } from "./template";

const FORM_PATH = "fixtures/blank-form.pdf";
const OUT_PATH = "out/filled.pdf";
const DATA_PATH = "fixtures/sample-data.json";

const bytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());
assertTemplateHash(bytes, FORM_PATH);

// Everything in fixtures/sample-data.json sits flat at one level. Keys that
// FormDataSchema declares (familyName, employment, etc.) go through the
// hand-authored business schema; every other key is a raw PDF field name,
// checked against the PDF's real structure instead (genericFields.ts).
const rawData = (await Bun.file(DATA_PATH).json()) as Record<string, unknown>;
const knownKeys = new Set(Object.keys(FormDataSchema.shape));
const knownRaw: Record<string, unknown> = {};
const genericRaw: Record<string, unknown> = {};
for (const [key, value] of Object.entries(rawData)) {
  (knownKeys.has(key) ? knownRaw : genericRaw)[key] = value;
}

const data = FormDataSchema.parse(knownRaw);

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

applyFormData(form, data);

let genericData: Record<string, string> = {};
if (Object.keys(genericRaw).length > 0) {
  const collisions = Object.keys(genericRaw).filter((name) => MAPPED_FIELD_NAMES.includes(name));
  if (collisions.length > 0) {
    throw new Error(
      `${JSON.stringify(collisions)} already have a single source of truth in the business schema - ` +
        `set them via question4/employment/etc. instead of by their raw PDF field name.`,
    );
  }
  // Real per-field type checking (real export values, MaxLength) happens
  // here, once the PDF's actual structure is known - these keys aren't
  // declared in FormDataSchema at all.
  genericData = buildGenericSchema(form).parse(genericRaw) as Record<string, string>;
  applyGenericData(form, genericData);
}

form.updateFieldAppearances();
const outBytes = await pdf.save();
await Bun.write(OUT_PATH, outBytes);

const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
const verifyForm = verifyPdf.getForm();
const readBack = readFormData(verifyForm);

function assertEqual(field: string, expected: unknown, actual: unknown): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual("familyName", data.familyName, readBack.familyName);
assertEqual("firstName", data.firstName, readBack.firstName);
assertEqual("secondName", data.secondName, readBack.secondName);
assertEqual("clientReferenceNumber", data.clientReferenceNumber, readBack.clientReferenceNumber);
assertEqual("question4", data.question4, readBack.question4);

if (data.employment) {
  if (!readBack.employment) {
    throw new Error(`employment: expected present, got absent`);
  }
  assertEqual(
    "employment.personWorking",
    data.employment.personWorking,
    readBack.employment.personWorking,
  );
  assertEqual("employment.workType", data.employment.workType, readBack.employment.workType);
  assertEqual("employment.usualWage", data.employment.usualWage, readBack.employment.usualWage);
} else if (readBack.employment) {
  throw new Error(`employment: expected absent, got ${JSON.stringify(readBack.employment)}`);
}

if (Object.keys(genericData).length > 0) {
  const names = Object.keys(genericData);
  const genericReadBack = readGenericData(verifyForm, names);
  for (const name of names) {
    assertEqual(name, genericData[name], genericReadBack[name]);
  }
}

console.log(`Wrote ${OUT_PATH}`);
console.log(`Verified read-back matches ${DATA_PATH}.`);
