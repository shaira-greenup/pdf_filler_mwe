import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
  PDFName,
} from "pdf-lib";

const FORM_PATH = "fixtures/blank-form.pdf";
const OUT_PATH = "fixtures/fields.txt";

const bytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());

const hasher = new Bun.CryptoHasher("sha256");
hasher.update(bytes);
const sha256 = hasher.digest("hex");

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();
const hasXFA = form.hasXFA();
const fields = form.getFields();

const lines: string[] = [];
lines.push(`SHA-256: ${sha256}`);
lines.push(`Has XFA: ${hasXFA}`);
lines.push(`Field count: ${fields.length}`);
lines.push("");

for (const field of fields) {
  const name = field.getName();
  const type = field.constructor.name;
  lines.push(`Field: ${name}`);
  lines.push(`  Type: ${type}`);

  if (field instanceof PDFTextField) {
    const value = field.getText();
    lines.push(`  Value: ${JSON.stringify(value ?? null)}`);
    const maxLength = field.getMaxLength();
    lines.push(`  MaxLength: ${maxLength ?? "(none)"}`);
    lines.push(`  Combed: ${field.isCombed()}`);
  } else if (field instanceof PDFCheckBox) {
    // acroField.getOnValue() only inspects the field's first widget. Some
    // fields in this form use one PDFCheckBox with multiple widgets - each
    // widget its own on-value - to implement what is effectively a radio
    // group (e.g. Q8.WorkIs1: "FT" / "PT" / "Seasonal" / "Casual"). Reading
    // getOnValue() alone would silently report only the first of these.
    const options = field.acroField
      .getWidgets()
      .map((widget) => widget.getOnValue())
      .filter((onValue): onValue is PDFName => onValue !== undefined)
      .map((onValue) => onValue.decodeText());
    lines.push(`  Value: ${field.acroField.getValue().decodeText()}`);
    lines.push(`  Options: ${JSON.stringify(options)}`);
  } else if (field instanceof PDFRadioGroup) {
    const selected = field.getSelected();
    lines.push(`  Value: ${JSON.stringify(selected ?? null)}`);
    lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
  } else if (field instanceof PDFDropdown) {
    const selected = field.getSelected();
    lines.push(`  Value: ${JSON.stringify(selected)}`);
    lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
  } else if (field instanceof PDFOptionList) {
    const selected = field.getSelected();
    lines.push(`  Value: ${JSON.stringify(selected)}`);
    lines.push(`  Options: ${JSON.stringify(field.getOptions())}`);
  } else if (field instanceof PDFButton) {
    lines.push(`  Value: (none, push button)`);
  } else if (field instanceof PDFSignature) {
    lines.push(`  Value: (none, signature field)`);
  } else {
    lines.push(`  Value: (unknown field type)`);
  }

  lines.push("");
}

const output = lines.join("\n");
console.log(output);
await Bun.write(OUT_PATH, output);
