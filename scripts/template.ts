const EXPECTED_SHA256 = "3018dedf7562892ee40d1a93d0124ad50de5cbb23fb65733a21d7f7b23d8c55f";

export function assertTemplateHash(bytes: Uint8Array, path: string): void {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  const actual = hasher.digest("hex");
  if (actual !== EXPECTED_SHA256) {
    throw new Error(
      `Template hash mismatch for ${path}.\n` +
        `  expected: ${EXPECTED_SHA256}\n` +
        `  actual:   ${actual}\n` +
        `The form has changed since fixtures/fields.txt was generated. Re-run scripts/inspect.ts.`,
    );
  }
}
