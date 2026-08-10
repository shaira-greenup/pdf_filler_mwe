import { PDFDocument } from "pdf-lib";
import { FormDataSchema } from "./schema";
import { applyFormData, readFormData } from "./mapping";

const FORM_PATH = "fixtures/blank-form.pdf";
const OUT_PATH = "out/filled.pdf";
const DATA_PATH = "fixtures/sample-data.json";
const EXPECTED_SHA256 =
  "3018dedf7562892ee40d1a93d0124ad50de5cbb23fb65733a21d7f7b23d8c55f";

const bytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());

const hasher = new Bun.CryptoHasher("sha256");
hasher.update(bytes);
const actualSha256 = hasher.digest("hex");
if (actualSha256 !== EXPECTED_SHA256) {
  throw new Error(
    `Template hash mismatch for ${FORM_PATH}.\n` +
      `  expected: ${EXPECTED_SHA256}\n` +
      `  actual:   ${actualSha256}\n` +
      `The form has changed since fixtures/fields.txt was generated. Re-run scripts/inspect.ts.`,
  );
}

const rawData = await Bun.file(DATA_PATH).json();
const data = FormDataSchema.parse(rawData);

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

applyFormData(form, data);

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

console.log(`Wrote ${OUT_PATH}`);
console.log(`Verified read-back matches ${DATA_PATH}.`);
