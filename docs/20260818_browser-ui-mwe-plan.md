# Browser MWE: SolidJS + Vite + Tailwind demo of the fill pipeline

Date: 2026-08-18

## Context

CLAUDE.md already commits to a specific future: "The fill logic itself must
also run unmodified in a browser (a SolidJS app is the eventual consumer)."
Up to now that's an untested claim — every fill path (`scripts/lib/fillForm.ts`)
runs under Bun, using `Bun.file`/`Bun.write`/`Bun.CryptoHasher` and path-based
dynamic `import()`. The user wants a minimal UI to present this work as an
MWE, but explicitly does not want it to diverge from the real eventual
embed target, so the design goal here is narrow: prove the *existing* fill
logic — `genericFields.ts`, `gateGraph.ts`, and each form's own
`schema.ts`/`mapping.ts` — runs unmodified in a real browser bundle, with
only the Bun-specific I/O edges swapped out (fetch instead of `Bun.file`,
Web Crypto instead of `Bun.CryptoHasher`, a Blob download instead of
`Bun.write`). Confirmed stack, from the user: SolidJS, Vite, Tailwind CSS,
entirely client-side (no server round-trip — matches CLAUDE.md's "no
server, no upload" scope note and keeps income/asset data on-device), both
`income-and-assets` and `abs-study`.

This is additive: a new `ui/` sub-package. It does not touch the existing
Bun CLI, its "no build step" rule, or any hard rule — it's a second,
separate consumer of the same reusable modules, which is exactly the
architecture CLAUDE.md already describes.

## What gets reused verbatim vs. reimplemented

Read in full to produce this plan: `scripts/genericFields.ts`,
`scripts/lib/{fillForm,loadForm,hash,encryption,formPaths,exportSchema}.ts`,
`scripts/lib/gateGraph.ts`, `scripts/cli.ts`, both forms'
`schema.ts`/`mapping.ts`/`sample-data.json`.

**Reused with zero changes** (already Bun-free — pdf-lib/zod only):
- `scripts/genericFields.ts` — `buildGenericSchema`, `applyGenericData`, `finalizeAppearances`, `unhide`, `selectCheckboxOption`.
- `scripts/lib/gateGraph.ts` — `findGateViolations` (the whole point of showing this in a UI — surfaces the same "Gate warning:" lines the CLI prints, but as a visible UI panel).
- `forms/income-and-assets/{schema,mapping}.ts` and `forms/abs-study/{schema,mapping}.ts` — imported statically instead of via `fillForm.ts`'s dynamic `pathToFileURL(...)` import (that dynamic-by-id loading is a CLI-only need; the browser only ever serves these two fixed, known forms — same "known target" scope CLAUDE.md already describes, just applied to the UI).
- `forms/<id>/sample-data.json` — imported statically as the source of "everything not in the business schema," so the demo doesn't require re-typing all ~470/~90 generic fields by hand. The interactive part of the UI is exactly the hand-authored business schema; everything else rides on the existing generic-layer sample data, unmodified — mirroring the project's own "business layer for what's meaningful, generic layer as-is for the rest" split, live.

**Small browser-only adapters, isolated at the edges** (new files under `ui/src/lib/`):
- `loadFormBrowser.ts` — `fetch(pdfUrl).arrayBuffer()` → `Uint8Array` → `PDFDocument.load(bytes, { ignoreEncryption: true })` → force page-tree/field traversal now (same reason `loadForm.ts` does). Deliberately **skips** `encryption.ts`'s pre-flight: that check exists for vetting an *unknown* source PDF at `init` time (and depends on Node's `Buffer`, not available in a bare browser bundle); the browser only ever loads an already-registered, already-committed `blank-form.pdf`, the same trust boundary `smoke-test <registered-id>` already assumes. Documented inline as a deliberate scope boundary, not an oversight.
- `browserHash.ts` — a Web Crypto `sha256Hex` (`crypto.subtle.digest("SHA-256", bytes)`) plus reuse of a newly-extracted pure parser from `hash.ts` (see below), so the browser gets the same "template hash drifted" guard (hard rule 10) as the CLI, without `Bun.CryptoHasher`.
- `download.ts` — `Blob` + a temporary `<a>` click, replacing `Bun.write`.
- `fillInBrowser.ts` — the actual browser port of `fillForm.ts`'s sequence (validate business data → `applyFormData` → generic fallback via `buildGenericSchema`/`applyGenericData` → `finalizeAppearances` → `pdf.save()` → reload saved bytes → `readFormData` deep-equal check, same as hard rule 9 → `findGateViolations`). Every step but the I/O edges above calls straight into the existing modules — no logic is duplicated or reinvented.

**One small, additive refactor** to `scripts/lib/hash.ts`: extract the pure
text-parsing half of `readExpectedHash` into an exported `parseExpectedHash(text: string): string`
(regex-match the `SHA-256:` line, throw if absent — identical error
condition, just no `Bun.file` in the middle). `readExpectedHash` keeps its
existing signature and behavior, now implemented as a thin wrapper:
`Bun.file(...).text()` then `parseExpectedHash(...)`. This is the one place
existing code changes; verified safe because no test asserts on
`readExpectedHash`'s exact error string (checked — no `hash.test.ts` exists
in this repo) and its externally-observable behavior is unchanged.

## New files

```
ui/
  package.json            new sub-package; devDependencies vite, vite-plugin-solid,
                           tailwindcss, @tailwindcss/vite, typescript; dependencies solid-js.
                           pdf-lib/zod are NOT duplicated here — root package.json gains
                           "workspaces": ["ui"] so Bun hoists ui/'s node_modules resolution
                           up to the existing root node_modules/{pdf-lib,zod}, one real
                           install of each, matching "Install with bun add" for the new
                           ui-only deps.
  vite.config.ts           vite-plugin-solid, @tailwindcss/vite; server.fs.allow: ['..']
                           so Vite can serve forms/<id>/blank-form.pdf and fields.txt
                           straight from their real, single-source-of-truth location via
                           new URL('../../forms/<id>/blank-form.pdf', import.meta.url) —
                           no duplicate copies under ui/public.
  tsconfig.json             separate from root tsconfig.json (root sets jsx: react-jsx;
                           Solid needs jsx: preserve, jsxImportSource: solid-js).
  index.html
  src/
    main.tsx
    App.tsx                 form picker (income-and-assets | abs-study) + shared layout
    index.css                 single `@import "tailwindcss";` line
    forms/
      IncomeAndAssetsForm.tsx  controlled inputs for familyName/firstName/secondName/
                               clientReferenceNumber/question4, plus an "employed?"
                               toggle revealing personWorking/workType/usualWage —
                               matches forms/income-and-assets/schema.ts's FormData shape
                               field-for-field.
      AbsStudyForm.tsx          controlled inputs for the citizenship object (country,
                               date), behind a toggle — matches abs-study's schema.ts.
    lib/
      registry.ts               per-form config: statically imported schema/mapping/
                               sample-data modules + the two asset URLs, keyed by form id.
                               Two fixed entries, not a dynamic loader — same "fixed, known
                               target" scope as the rest of this project.
      loadFormBrowser.ts
      browserHash.ts
      download.ts
      fillInBrowser.ts
```

## Fill flow (mirrors `fillForm.ts` exactly, minus Bun I/O)

1. User fills the business-schema fields in the Solid form; everything else
   comes from that form's committed `sample-data.json`, filtered to drop any
   key already covered by the business schema (same collision guard
   `fillForm.ts` already enforces via `MAPPED_FIELD_NAMES`).
2. `fillInBrowser(formId, businessInput)`: fetch PDF bytes + fields.txt →
   `assertTemplateHash` (browser version) → `FormDataSchema.parse` →
   `applyFormData` → `buildGenericSchema(form).parse(genericRaw)` →
   `applyGenericData` → `finalizeAppearances` → `pdf.save()`.
3. Reload the saved bytes, `readFormData` + deep-equal against the input
   (hard rule 9, unchanged from `fillForm.ts`), then `findGateViolations`.
4. Trigger a download of the filled PDF via `download.ts`; render any gate
   violations in a visible warning panel in the UI (this is the actual
   payoff of shipping the gate-graph work in a UI at all — a live, visible
   "second line of defense," not just a console warning nobody reads).

## Docs

Add a short "## Browser demo (`ui/`)" section to `README.md`: what it is,
how to run it (`cd ui && bun install && bun run dev`), and the explicit
scope boundary — still no server, still two fixed known forms, still not a
runtime template dispatcher; it's a second consumer of the same modules,
not a new architecture.

## Verification

- `bunx tsc --noEmit` at root still clean (hash.ts refactor).
- `bun test` at root still green (no existing test touches the refactored code path).
- `cd ui && bun install && bun run dev` — manually exercise both forms:
  fill business fields, download, open the result in Acrobat and Chrome
  (per CLAUDE.md's Verification section — "the script ran" is not "the PDF
  is correct").
- Deliberately leave a known-inconsistent state (e.g. abs-study citizenship
  toggle off while `sample-data.json`'s `Q2Details.*` still carries
  placeholder text, if applicable) to confirm the UI's gate-warning panel
  actually renders — proving the port isn't just visually plausible but
  behaviorally identical to the CLI's `Gate warning:` output.

## Status

Not yet implemented — this is the reviewed plan, written up per this
project's "document first" convention before any `ui/` code is written.
