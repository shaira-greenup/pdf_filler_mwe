import { PDFDocument } from "pdf-lib";
import { synthesizeValidData } from "./genericFields";
import { MAPPED_FIELD_NAMES } from "./mapping";
import { assertTemplateHash } from "./template";

// One-time (or re-run-when-the-form-changes) seed for fixtures/sample-data.json.
// Merges a placeholder value for every field the business schema doesn't
// already cover flat into the existing file, alongside familyName etc.
// After this runs, every one of those keys is a normal part of that file -
// edit it, break it, whatever. This script only exists so nobody has to
// hand-type ~490 placeholder values from scratch.

const FORM_PATH = "fixtures/blank-form.pdf";
const DATA_PATH = "fixtures/sample-data.json";

const bytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());
assertTemplateHash(bytes, FORM_PATH);

const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = pdf.getForm();

const all = synthesizeValidData(form);
const existing = await Bun.file(DATA_PATH).json();

let seeded = 0;
for (const [name, value] of Object.entries(all)) {
  if (MAPPED_FIELD_NAMES.includes(name)) continue;
  if (!(name in existing)) {
    existing[name] = value;
    seeded++;
  }
}

await Bun.write(DATA_PATH, JSON.stringify(existing, null, 2) + "\n");
console.log(`Seeded ${seeded} new field entries into ${DATA_PATH} (existing keys left untouched).`);
