# PDF Form Filler

Fills a known AcroForm PDF from a typed, validated data object. Bun + TypeScript, no build step, no server.

This repo is both a working example (one real form, fully wired up) and the reference recipe for adding more forms. See [CLAUDE.md](CLAUDE.md) for the full hard rules, known hazards, and the step-by-step workflow to follow for every new form — this file is just the quickstart.

## Prerequisites

- [Bun](https://bun.com)
- [qpdf](https://qpdf.sourceforge.io/) — only needed if a source PDF turns out to be encrypted with a real cipher, not just permissions. One-time, per form. See "Known hazards" in CLAUDE.md.

## Install

```bash
bun install
```

## Scripts

- `bun run scripts/inspect.ts` — dumps every field in `fixtures/blank-form.pdf` (name, type, current value, Hidden state per widget, and every checkbox/radio group's real export values) to `fixtures/fields.txt`. Run this first for any new form; never guess field names or export values instead.
- `bun run scripts/fill.ts` — validates `fixtures/sample-data.json` against the schema in `scripts/schema.ts`, maps it onto the PDF via `scripts/mapping.ts`, writes `out/filled.pdf`, then reloads the saved file and confirms every field landed as intended.
- `bun test` — hostile-input and structural regression suite (`scripts/fill.test.ts`).

## Output

`out/filled.pdf` is gitignored. A clean script run only proves the data model is internally consistent — open the result in both Acrobat and Chrome after any change that could affect it, since neither `bun run` nor `bun test` can see whether the PDF actually renders correctly.
