import { parseArgs } from "node:util";
import { resolveFormPaths, listFormIds } from "./lib/formPaths";
import { initForm } from "./lib/initForm";
import { writeFieldsTxt } from "./lib/inspectForm";
import { exportSchema } from "./lib/exportSchema";
import { fillForm } from "./lib/fillForm";
import { loadForm } from "./lib/loadForm";
import { runSmokeTest } from "./lib/smokeTest";
import { assertTemplateHash } from "./lib/hash";

function printUsage(): void {
  console.log(`Usage: bun run scripts/cli.ts <command> [args]

Commands:
  init <id> <pdf-path>              Scaffold a new form from a blank PDF
  inspect <id>                      Dump every field to forms/<id>/fields.txt
  schema <id>                       Export forms/<id>/sample-data.schema.json
  fill <id> [--data p] [--out p]    Fill from sample-data.json, write a PDF
  smoke-test <id-or-path>           Mechanically fill every field, no business schema needed

Registered forms: ${listFormIds().join(", ") || "(none yet)"}
`);
}

const [command, ...rest] = process.argv.slice(2);

if (!command) {
  printUsage();
  process.exit(1);
}

try {
  switch (command) {
    case "init": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true });
      const [id, pdfPath] = positionals;
      if (!id || !pdfPath) throw new Error("Usage: init <id> <pdf-path>");
      const paths = await initForm(id, pdfPath);
      console.log(`Created ${paths.dir}`);
      break;
    }
    case "inspect": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true });
      const [id] = positionals;
      if (!id) throw new Error("Usage: inspect <id>");
      const paths = resolveFormPaths(id);
      const { fieldCount } = await writeFieldsTxt(paths);
      console.log(`Wrote ${paths.fieldsTxtPath} (${fieldCount} fields)`);
      break;
    }
    case "schema": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true });
      const [id] = positionals;
      if (!id) throw new Error("Usage: schema <id>");
      const paths = resolveFormPaths(id);
      const { propertyCount } = await exportSchema(paths);
      console.log(`Wrote ${paths.sampleDataSchemaPath} (${propertyCount} properties)`);
      break;
    }
    case "fill": {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { data: { type: "string" }, out: { type: "string" } },
      });
      const [id] = positionals;
      if (!id) throw new Error("Usage: fill <id> [--data path] [--out path]");
      const paths = resolveFormPaths(id);
      const { outPath } = await fillForm(paths, { dataPath: values.data, outPath: values.out });
      console.log(`Wrote ${outPath}`);
      break;
    }
    case "smoke-test": {
      const { positionals } = parseArgs({ args: rest, allowPositionals: true });
      const [target] = positionals;
      if (!target) throw new Error("Usage: smoke-test <id-or-path>");

      // A registered form id gets the hash guard too; a raw filesystem path
      // (an arbitrary PDF nobody has mapped) skips it - there's no fields.txt
      // to check against - but still goes through encryption detection.
      const isRegistered = listFormIds().includes(target);
      let bytes: Uint8Array;
      if (isRegistered) {
        const paths = resolveFormPaths(target);
        const loaded = await loadForm(paths.pdfPath);
        await assertTemplateHash(loaded.bytes, paths.fieldsTxtPath);
        bytes = loaded.bytes;
      } else {
        bytes = (await loadForm(target)).bytes;
      }

      const result = await runSmokeTest(bytes);
      console.log(JSON.stringify(result, null, 2));
      if (result.mismatches.length > 0 || result.stillHidden.length > 0) {
        process.exit(1);
      }
      break;
    }
    default:
      printUsage();
      process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
