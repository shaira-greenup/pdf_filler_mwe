export function sha256Hex(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

const HASH_LINE = /^SHA-256:\s*([0-9a-f]{64})\s*$/im;

// The expected hash lives in the form's own fields.txt (its first line,
// written by inspect) rather than a separate hardcoded constant - one
// source of truth per form, and it can't drift out of sync with itself.
export async function readExpectedHash(fieldsTxtPath: string): Promise<string> {
  const file = Bun.file(fieldsTxtPath);
  if (!(await file.exists())) {
    throw new Error(
      `${fieldsTxtPath} does not exist. Run "inspect" for this form first - ` +
        `the expected template hash is recorded in its first line.`,
    );
  }
  const text = (await file.text()).replace(/\r\n/g, "\n");
  const match = HASH_LINE.exec(text);
  const hex = match?.[1];
  if (!hex) {
    throw new Error(
      `${fieldsTxtPath} does not start with a "SHA-256: <hex>" line. Re-run inspect for this form.`,
    );
  }
  return hex;
}

export async function assertTemplateHash(bytes: Uint8Array, fieldsTxtPath: string): Promise<void> {
  const expected = await readExpectedHash(fieldsTxtPath);
  const actual = sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(
      `Template hash mismatch for the PDF backing ${fieldsTxtPath}.\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `The form has changed since ${fieldsTxtPath} was generated. Re-run inspect for this form.`,
    );
  }
}
