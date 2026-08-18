import { PDFDocument, type PDFForm } from "pdf-lib";
import { assertTemplateHash } from "./browserHash";
import type { FormRegistryEntry } from "./registry";

// Browser equivalent of scripts/lib/loadForm.ts. Deliberately skips
// scripts/lib/encryption.ts's pre-flight check: that check exists to vet an
// *unknown* source PDF at `init` time (and depends on Node's Buffer, not
// available in a bare browser bundle) - the browser only ever loads an
// already-registered, already-committed blank-form.pdf, the same trust
// boundary `smoke-test <registered-id>` already assumes for the CLI. This
// is a deliberate scope boundary, not an oversight (see
// docs/20260818_browser-ui-mwe-plan.md).
export async function loadFormInBrowser(
  entry: Pick<FormRegistryEntry, "id" | "pdfUrl" | "fieldsTxtUrl">,
): Promise<{ bytes: Uint8Array; pdf: PDFDocument; form: PDFForm }> {
  const [pdfResponse, fieldsTxtResponse] = await Promise.all([fetch(entry.pdfUrl), fetch(entry.fieldsTxtUrl)]);
  if (!pdfResponse.ok) {
    throw new Error(`${entry.id}: failed to fetch ${entry.pdfUrl} (${pdfResponse.status})`);
  }
  if (!fieldsTxtResponse.ok) {
    throw new Error(`${entry.id}: failed to fetch ${entry.fieldsTxtUrl} (${fieldsTxtResponse.status})`);
  }

  const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
  const fieldsTxtText = await fieldsTxtResponse.text();
  await assertTemplateHash(bytes, fieldsTxtText, entry.fieldsTxtUrl);

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  // Same reason scripts/lib/loadForm.ts forces this now: the actual crash
  // for an undecryptable cipher happens lazily, deep in page-tree
  // traversal - force it here rather than later in whatever caller uses
  // the returned form.
  pdf.getPageCount();
  form.getFields();

  return { bytes, pdf, form };
}
