# Encrypted source forms

Date: 2026-08-10

## What happened

The original form (`form.pdf`, now removed) failed to parse with `pdf-lib`, even
with `{ ignoreEncryption: true }`. Symptoms:

- Dozens of `Trying to parse invalid object` / `Invalid object ref` warnings during
  `PDFDocument.load`.
- A hard crash in `pdf.getPageCount()` / `pdf.getForm()`: `Expected instance of
  PDFDict, but got instance of undefined`.
- Identical failure in `@cantoo/pdf-lib` (the maintained fork CLAUDE.md names as
  the fallback for library-level breakage) — ruling out a pdf-lib-specific bug.

## Root cause

The file's trailer had `/Encrypt 2137 0 R`. Inspecting that object:

```
<</CF<</StdCF<</AuthEvent/DocOpen/CFM/AESV2/Length 16>>>>/Filter/Standard
/Length 128/O(...)/P -1036/R 4/StmF/StdCF/StrF/StdCF/U(...)/V 4>>
```

Standard security handler, `V 4 / R 4`, AES-128 (`AESV2`) on strings and streams.

**`ignoreEncryption: true` does not decrypt anything.** From pdf-lib's own README:

> `pdf-lib` does not currently support encrypted documents. ... Note that using
> this option does not decrypt the document. This means that any modifications
> you attempt to make on the returned `PDFDocument` may fail, or have unexpected
> results.

Confirmed by grep: no AES/RC4/decrypt implementation anywhere in `pdf-lib`'s or
`@cantoo/pdf-lib`'s source. The flag only suppresses the `EncryptedPDFError`
throw and hands the parser the still-encrypted bytes. Most structural tokens
(names, numbers, dict keys) survive that, but compressed object streams
(`ObjStm`) — used here to pack page/annotation/widget objects — decompress to
ciphertext garbage. Every object living inside one of those streams becomes
unparseable, which is what the "Invalid object ref" flood was. The crash
happens as soon as page-tree traversal needs one of the dropped objects.

CLAUDE.md's hazard note ("some published forms carry an empty owner password")
describes a narrower, milder case — permissions-only protection with no real
cipher on content. This form has an actual per-object AES cipher, which is a
different and harder problem `ignoreEncryption` was never meant to solve.

## Options considered

| Option | Verdict |
|---|---|
| `ignoreEncryption: true` | Doesn't work — doesn't decrypt, just suppresses the check. |
| `@cantoo/pdf-lib` fork | Same failure — shares the same parsing core, no decryption support either. |
| `mupdf` (WASM) | Actually decrypts AES/RC4 and can read/write AcroForm fields. Rejected: AGPL-3.0-or-later license. CLAUDE.md's own plan has this fill logic running inside a browser-facing SolidJS app later, and AGPL's network-use clause (§13) would impose source-disclosure obligations on that shipped app. Artifex sells a commercial license specifically because of this. |
| Decrypt once with `qpdf`, keep `pdf-lib` | **Chosen.** No dependency or license change. `qpdf` is a one-off dev-machine tool, not a project dependency. |

## Fix applied

```
qpdf --decrypt form.pdf fixtures/blank-form.pdf
```

Produced a clean, unencrypted `fixtures/blank-form.pdf` with no `/Encrypt`
entry. Verified with plain `pdf-lib` (no fork, no special flags beyond the
already-required `ignoreEncryption: true`):

```
pages:     20
AcroForm:  yes
fields:    565
```

No parse warnings. This is now the fixture committed per CLAUDE.md's `Files`
section — it is the canonical "real form", already decrypted.

## Day-to-day implications

- **Nothing changes for normal work.** `fixtures/blank-form.pdf` is plain from
  here on. `pdf-lib`, in Bun and later in the browser, reads it exactly like any
  unencrypted AcroForm PDF — no `qpdf`, no special handling, no runtime cost.
- **`qpdf` is not a project dependency.** It's not in `package.json`, not run by
  any script, not required by anyone who only touches `fixtures/blank-form.pdf`.
  It's a workstation tool, used by hand, only when refreshing the fixture from a
  new upstream source.
- **When it resurfaces:** if the issuing organization republishes the form
  (CLAUDE.md hard rule #8's hash check is designed to catch this), the new
  source file may again be encrypted. Re-run:

  ```
  qpdf --decrypt <new-source>.pdf fixtures/blank-form.pdf
  ```

  then re-verify page/field counts didn't shift unexpectedly, then update the
  stored SHA-256 hash.
- **Browser/upload scenario:** if a future feature lets an end user supply
  their own copy of an encrypted form (not the bundled fixture), this fix does
  **not** carry over. `qpdf` is a native binary; it cannot run in a browser.
  Browser-side `pdf-lib` would hit the identical AES wall documented above, with
  no fallback available client-side. Solving that would need either a WASM build
  of `qpdf` (unofficial, adds real complexity) or a server-side decryption step
  — both out of scope for anything resembling this MWE, and the latter is
  explicitly excluded by CLAUDE.md's scope ("no server, no UI, no upload").

## Files

- `fixtures/blank-form.pdf` — decrypted, canonical, committed.
- `form.pdf` (project root) — original encrypted source. Kept/removed at
  maintainer discretion; no longer read by any script.
