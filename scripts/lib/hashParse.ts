// Pure text -> hash parsing, kept genuinely Bun-free (unlike hash.ts, which
// also carries Bun.CryptoHasher/Bun.file). Both the Bun CLI (hash.ts) and
// the browser UI (ui/src/lib/browserHash.ts, which fetches fields.txt
// instead of reading it off disk) reuse this exact parsing/error behavior -
// splitting it out means neither has to duplicate the regex, and the
// browser side never has to import Bun-only code just to get at this part.
const HASH_LINE = /^SHA-256:\s*([0-9a-f]{64})\s*$/im;

export function parseExpectedHash(text: string, sourceLabel: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = HASH_LINE.exec(normalized);
  const hex = match?.[1];
  if (!hex) {
    throw new Error(
      `${sourceLabel} does not start with a "SHA-256: <hex>" line. Re-run inspect for this form.`,
    );
  }
  return hex;
}
