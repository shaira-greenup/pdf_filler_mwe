export interface FormPaths {
  id: string;
  dir: string;
  pdfPath: string;
  fieldsTxtPath: string;
  schemaPath: string;
  mappingPath: string;
  sampleDataPath: string;
  sampleDataSchemaPath: string;
  testPath: string;
}

const FORMS_ROOT = "forms";
const VALID_ID = /^[a-z0-9][a-z0-9-]*$/;

export function assertValidFormId(id: string): void {
  if (!VALID_ID.test(id)) {
    throw new Error(`Invalid form id ${JSON.stringify(id)} - must match ${VALID_ID}.`);
  }
}

export function resolveFormPaths(id: string): FormPaths {
  assertValidFormId(id);
  const dir = `${FORMS_ROOT}/${id}`;
  return {
    id,
    dir,
    pdfPath: `${dir}/blank-form.pdf`,
    fieldsTxtPath: `${dir}/fields.txt`,
    schemaPath: `${dir}/schema.ts`,
    mappingPath: `${dir}/mapping.ts`,
    sampleDataPath: `${dir}/sample-data.json`,
    sampleDataSchemaPath: `${dir}/sample-data.schema.json`,
    testPath: `${dir}/fill.test.ts`,
  };
}

export function listFormIds(): string[] {
  const glob = new Bun.Glob(`${FORMS_ROOT}/*/blank-form.pdf`);
  const ids: string[] = [];
  for (const match of glob.scanSync(".")) {
    const parts = match.split(/[\\/]/);
    const id = parts[parts.length - 2];
    if (id) ids.push(id);
  }
  return ids.sort();
}
