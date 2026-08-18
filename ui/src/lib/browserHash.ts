import { parseExpectedHash } from "../../../scripts/lib/hashParse";

// Bun.CryptoHasher isn't available in a browser bundle - Web Crypto's
// SubtleCrypto is the standard browser equivalent (scripts/lib/hash.ts's
// sha256Hex is the Bun-side counterpart). parseExpectedHash itself is
// reused unmodified from scripts/lib/hashParse.ts - only this platform's
// I/O edge (hashing) differs, not the parsing/comparison logic.
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // TypeScript's DOM lib types SubtleCrypto.digest's BufferSource as
  // ArrayBufferView<ArrayBuffer> specifically (excluding SharedArrayBuffer-
  // backed views), stricter than the plain Uint8Array this function
  // receives. .slice() always allocates a fresh, non-shared ArrayBuffer, so
  // it satisfies that type exactly rather than requiring an unsafe cast.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Same check as scripts/lib/hash.ts's assertTemplateHash (hard rule 10),
// just fed text/bytes the caller already fetched instead of reading paths
// itself - the browser has no filesystem to read from.
export async function assertTemplateHash(
  bytes: Uint8Array,
  fieldsTxtText: string,
  sourceLabel: string,
): Promise<void> {
  const expected = parseExpectedHash(fieldsTxtText, sourceLabel);
  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(
      `Template hash mismatch for the PDF backing ${sourceLabel}.\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `The form has changed since ${sourceLabel} was generated. Re-run inspect for this form.`,
    );
  }
}
