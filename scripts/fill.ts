import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";

const FORM_PATH = "fixtures/blank-form.pdf";
const OUT_PATH = "out/filled.pdf";
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

const textValues: Record<string, string> = {
  "Q2.FamilyName": "Nguyen",
  "Q2.FirstName": "Alex",
  "Q2.SecondName": "Morgan",
};
const checkedBoxes = ["Q4"];

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

for (const [name, value] of Object.entries(textValues)) {
  form.getTextField(name).setText(value);
}
for (const name of checkedBoxes) {
  form.getCheckBox(name).check();
}

form.updateFieldAppearances();
const outBytes = await pdf.save();
await Bun.write(OUT_PATH, outBytes);

const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
const verifyForm = verifyPdf.getForm();

for (const [name, expected] of Object.entries(textValues)) {
  const field = verifyForm.getField(name);
  if (!(field instanceof PDFTextField)) {
    throw new Error(`${name}: expected PDFTextField, got ${field.constructor.name}`);
  }
  const actual = field.getText();
  if (actual !== expected) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
for (const name of checkedBoxes) {
  const field = verifyForm.getField(name);
  if (!(field instanceof PDFCheckBox)) {
    throw new Error(`${name}: expected PDFCheckBox, got ${field.constructor.name}`);
  }
  if (!field.isChecked()) {
    throw new Error(`${name}: expected checked, got unchecked`);
  }
}

console.log(`Wrote ${OUT_PATH}`);
console.log(`Verified ${Object.keys(textValues).length} text field(s) and ${checkedBoxes.length} checkbox(es).`);
