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

## CLI

```bash
bun run scripts/cli.ts <command> [args]
```

- `init <id> <pdf-path>` — scaffold a new form: copies the PDF into `forms/<id>/blank-form.pdf`, checks for a real (undecryptable) cipher first, dumps every field to `fields.txt`, scaffolds an empty schema/mapping pair, and seeds `sample-data.json`. Immediately usable — no business mapping required yet.
- `inspect <id>` — regenerate `forms/<id>/fields.txt` (name, type, current value, Hidden state per widget, every checkbox/radio group's real export values). Never guess field names or export values instead of running this.
- `smoke-test <id-or-path>` — mechanically fill every fillable field with a synthesized valid value and verify the round-trip, using only the generic layer. Works against any PDF, hand-mapped or not.
- `schema <id>` — export `forms/<id>/sample-data.schema.json`, a JSON Schema document describing exactly what a valid data file for this form looks like.
- `fill <id> [--data path] [--out path]` — validate `forms/<id>/sample-data.json` (business keys via that form's hand-authored schema, everything else via the PDF's own derived structure), apply it, write the PDF, and read the saved file back to confirm every field landed as intended.

Registered forms currently: `income-and-assets`.

## Tests

```bash
bun test
```

Runs each form's business-specific tests (e.g. `forms/income-and-assets/fill.test.ts`) plus the generic smoke test (`scripts/smokeTest.test.ts`, exercised against every form under `forms/`) and the encryption detector's own tests.

## Output

`out/<id>/filled.pdf` is gitignored. A clean CLI run only proves the data model is internally consistent — open the result in both Acrobat and Chrome after any change that could affect it, since nothing here can see whether the PDF actually renders correctly.
