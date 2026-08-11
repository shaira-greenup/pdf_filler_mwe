// pdf-lib has zero decryption support (confirmed: no AES/RC4/decrypt code
// anywhere in pdf-lib or the @cantoo/pdf-lib fork). `ignoreEncryption: true`
// only suppresses the EncryptedPDFError check - it does not decrypt
// anything. A form with a real cipher on its streams (not just a
// permissions-only owner password) will load "successfully" and then crash
// later, deep inside page-tree traversal, with a flood of unrelated-looking
// "invalid object" warnings. Detecting this up front, from the raw trailer,
// turns that cryptic crash into an actionable message. See
// docs/20260810_encrypted-forms.md for the full story this was learned from.

export interface EncryptionInfo {
  encrypted: boolean;
  // A definite-fatal cipher pdf-lib cannot possibly handle. A bare /Encrypt
  // entry with no such cipher info is the ambiguous legacy case - some of
  // those (permissions-only, empty owner password) load fine today.
  blocking: boolean;
  cipher?: string;
  version?: number;
  revision?: number;
}

const BLOCKING_CFMS = new Set(["AESV2", "AESV3"]);

export function detectRealEncryption(bytes: Uint8Array): EncryptionInfo {
  const text = Buffer.from(bytes).toString("latin1");

  const encryptRef = /\/Encrypt\s+(\d+)\s+\d+\s+R/.exec(text);
  const objNum = encryptRef?.[1];
  if (!objNum) {
    return { encrypted: false, blocking: false };
  }

  const objBody = new RegExp(`[^0-9]${objNum}\\s+\\d+\\s+obj([\\s\\S]*?)endobj`).exec(text)?.[1] ?? "";

  const cipher = /\/CFM\s*\/(\w+)/.exec(objBody)?.[1];
  const versionStr = /\/V\s+(\d+)/.exec(objBody)?.[1];
  const revisionStr = /\/R\s+(\d+)/.exec(objBody)?.[1];
  const version = versionStr ? Number(versionStr) : undefined;
  const revision = revisionStr ? Number(revisionStr) : undefined;

  const blocking = (cipher !== undefined && BLOCKING_CFMS.has(cipher)) || (version !== undefined && version >= 5);

  return { encrypted: true, blocking, cipher, version, revision };
}

export function encryptionErrorMessage(pdfPath: string, info: EncryptionInfo): string {
  return (
    `${pdfPath} appears to be encrypted with a real cipher` +
    (info.cipher ? ` (${info.cipher})` : "") +
    `. pdf-lib cannot decrypt this - "ignoreEncryption" only suppresses the ` +
    `error, it does not decrypt anything (neither pdf-lib nor the @cantoo/pdf-lib ` +
    `fork implement decryption). Decrypt it once outside this project with:\n\n` +
    `  qpdf --decrypt ${pdfPath} <output.pdf>\n\n` +
    `See docs/20260810_encrypted-forms.md for the full story.`
  );
}
