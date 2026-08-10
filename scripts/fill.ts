import { PDFDocument, PDFTextField, PDFCheckBox, PDFName, PDFForm } from "pdf-lib";

// Some checkbox fields in this form use one field with multiple widgets,
// each carrying a different on-value, to implement what is effectively a
// radio group (see fixtures/fields.txt, e.g. Q8.WorkIs2: "FT"/"PT"/
// "Seasonal"/"Casual" on one field). pdf-lib's PDFCheckBox.check() and
// acroField.setValue() only ever recognize the *first* widget's on-value,
// so selecting any other widget's value has to bypass that guard directly.
function selectCheckboxOption(form: PDFForm, fieldName: string, onValue: string): void {
  const field = form.getCheckBox(fieldName);
  const onValueName = PDFName.of(onValue);
  const widgets = field.acroField.getWidgets();
  const widget = widgets.find((w) => w.getOnValue() === onValueName);
  if (!widget) {
    const validOptions = widgets
      .map((w) => w.getOnValue()?.decodeText())
      .filter((v): v is string => v !== undefined);
    throw new Error(
      `${fieldName}: ${JSON.stringify(onValue)} is not a valid option. Valid options: ${JSON.stringify(validOptions)}`,
    );
  }
  field.acroField.dict.set(PDFName.of("V"), onValueName);
  for (const w of widgets) {
    w.setAppearanceState(w.getOnValue() === onValueName ? onValueName : PDFName.of("Off"));
  }
}

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
  // Combed field group (MaxLength 3/3/3/1) - CRN split across four boxes.
  "1_CRN.0": "123",
  "1_CRN.1": "456",
  "1_CRN.2": "789",
  "1_CRN.3": "0",
};
// Each checkbox's real on-value, per fixtures/fields.txt - not "Yes"/"true".
const checkedBoxes = ["Q4", "Q8.PersonWorking1", "Q8.WorkIs1", "Q8.UsualWage1"];

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

for (const [name, value] of Object.entries(textValues)) {
  form.getTextField(name).setText(value);
}
for (const name of checkedBoxes) {
  form.getCheckBox(name).check();
}

// Q8.PersonWorking2's only real export value is "You" (see fixtures/fields.txt).
// "Your Partner" is not a value of this field - there's no field that means
// "your partner is the one working" anywhere near it. This demonstrates why
// hard rule #6 matters: pdf-lib itself rejects an on-value it doesn't recognize.
try {
  form.getCheckBox("Q8.PersonWorking2").acroField.setValue(PDFName.of("Your Partner"));
  console.log("Q8.PersonWorking2: unexpectedly accepted 'Your Partner'");
} catch (err) {
  console.log(
    `Q8.PersonWorking2: rejected 'Your Partner' as expected -> ${(err as Error).message}`,
  );
}

selectCheckboxOption(form, "Q8.WorkIs2", "Seasonal");

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

{
  // isChecked() is widget[0]-biased and would be wrong here - read the
  // field's actual /V value directly instead (see selectCheckboxOption).
  const field = verifyForm.getField("Q8.WorkIs2");
  if (!(field instanceof PDFCheckBox)) {
    throw new Error(`Q8.WorkIs2: expected PDFCheckBox, got ${field.constructor.name}`);
  }
  const actual = field.acroField.getValue().decodeText();
  if (actual !== "Seasonal") {
    throw new Error(`Q8.WorkIs2: expected "Seasonal", got ${JSON.stringify(actual)}`);
  }
}

console.log(`Wrote ${OUT_PATH}`);
console.log(`Verified ${Object.keys(textValues).length} text field(s), ${checkedBoxes.length} checkbox(es), and Q8.WorkIs2 = "Seasonal".`);
