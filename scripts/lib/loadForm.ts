import { PDFDocument, type PDFForm } from "pdf-lib";
import { detectRealEncryption, encryptionErrorMessage } from "./encryption";

export async function loadPdfBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

export async function loadForm(
  path: string,
): Promise<{ bytes: Uint8Array; pdf: PDFDocument; form: PDFForm }> {
  const bytes = await loadPdfBytes(path);
  const encryptionInfo = detectRealEncryption(bytes);
  if (encryptionInfo.blocking) {
    throw new Error(encryptionErrorMessage(path, encryptionInfo));
  }

  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdf.getForm();
    // The actual crash for an undecryptable cipher happens lazily, deep in
    // page-tree traversal - not at .load() itself. Force it to happen now,
    // inside this try, rather than later in whatever code called us.
    pdf.getPageCount();
    form.getFields();
    return { bytes, pdf, form };
  } catch (err) {
    if (encryptionInfo.encrypted) {
      throw new Error(
        `${encryptionErrorMessage(path, encryptionInfo)}\n\nOriginal error: ${(err as Error).message}`,
      );
    }
    throw err;
  }
}
