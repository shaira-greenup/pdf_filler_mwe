import { describe, test, expect, beforeAll } from "bun:test";
import { PDFDocument, PDFCheckBox, PDFName, PDFDict, PDFNumber } from "pdf-lib";
import { FormDataSchema, type FormData } from "./schema";
import { applyFormData, readFormData, selectCheckboxOption } from "./mapping";
import { assertTemplateHash } from "./template";

const FORM_PATH = "fixtures/blank-form.pdf";

let blankBytes: Uint8Array;

beforeAll(async () => {
  blankBytes = new Uint8Array(await Bun.file(FORM_PATH).arrayBuffer());
});

async function loadForm() {
  const pdf = await PDFDocument.load(blankBytes, { ignoreEncryption: true });
  return { pdf, form: pdf.getForm() };
}

// Mirrors what fill.ts does: apply, save, reload the *saved* bytes, read back.
async function fillAndReload(data: FormData) {
  const { pdf, form } = await loadForm();
  applyFormData(form, data);
  form.updateFieldAppearances();
  const outBytes = await pdf.save();
  const verifyPdf = await PDFDocument.load(outBytes, { ignoreEncryption: true });
  return { verifyForm: verifyPdf.getForm() };
}

function isHidden(field: PDFCheckBox): boolean {
  return field.acroField.getWidgets().some((widget) => {
    const flags = widget.dict.lookup(PDFName.of("F"));
    const flagsNum = flags instanceof PDFNumber ? flags.asNumber() : 0;
    return (flagsNum & 2) !== 0;
  });
}

const BASE_DATA = {
  familyName: "Nguyen",
  firstName: "Alex",
  clientReferenceNumber: "1234567890",
  question4: false,
};

describe("FormDataSchema validates shape before anything touches the PDF", () => {
  test("accepts valid minimal data", () => {
    expect(() => FormDataSchema.parse(BASE_DATA)).not.toThrow();
  });

  test("rejects missing familyName", () => {
    const { familyName, ...rest } = BASE_DATA;
    expect(() => FormDataSchema.parse(rest)).toThrow();
  });

  test("rejects CRN that is not 10 digits", () => {
    expect(() => FormDataSchema.parse({ ...BASE_DATA, clientReferenceNumber: "123" })).toThrow();
  });

  test("rejects CRN containing letters", () => {
    expect(() =>
      FormDataSchema.parse({ ...BASE_DATA, clientReferenceNumber: "12345abcde" }),
    ).toThrow();
  });

  test("rejects a workType that is not a real PDF export value", () => {
    expect(() =>
      FormDataSchema.parse({
        ...BASE_DATA,
        employment: { personWorking: "You", workType: "Retired", usualWage: true },
      }),
    ).toThrow();
  });

  test("rejects question4 given as a string instead of a boolean", () => {
    expect(() => FormDataSchema.parse({ ...BASE_DATA, question4: "false" })).toThrow();
  });
});

describe("hostile input - value integrity", () => {
  test("a name with Vietnamese diacritics throws when appearances are regenerated (WinAnsi cannot encode it)", async () => {
    // "Nguyen" (our own sample data) is fine - it's plain ASCII. "Nguyễn"
    // with its real diacritics is outside WinAnsi/CP1252's range. The throw
    // happens in updateFieldAppearances() (font encoding), not pdf.save() -
    // confirmed empirically; CLAUDE.md's "throws at save time" is a
    // simplification. Per CLAUDE.md: surface this, don't paper over it with
    // a .replace().
    const { form } = await loadForm();
    const data = FormDataSchema.parse({ ...BASE_DATA, familyName: "Nguyễn" });
    applyFormData(form, data);
    expect(() => form.updateFieldAppearances()).toThrow();
  });

  test("a maximum-length name survives without silent truncation", async () => {
    // Q2.FamilyName has no MaxLength, so pdf-lib won't truncate it. This
    // only proves the value survives intact - not that it's legible once
    // rendered. Visual overflow is silent (CLAUDE.md Known Hazards) and can
    // only be caught by a human looking at a rendered image.
    const longName = "Wolfeschlegelsteinhausenbergerdorff".repeat(10);
    const data = FormDataSchema.parse({ ...BASE_DATA, familyName: longName });
    const { verifyForm } = await fillAndReload(data);
    expect(readFormData(verifyForm).familyName).toBe(longName);
  });

  test("a CRN with leading zeros round-trips exactly (no numeric coercion)", async () => {
    const data = FormDataSchema.parse({ ...BASE_DATA, clientReferenceNumber: "0000000001" });
    const { verifyForm } = await fillAndReload(data);
    expect(readFormData(verifyForm).clientReferenceNumber).toBe("0000000001");
  });

  test("an omitted secondName stays blank on fill and undefined on read-back", async () => {
    const data = FormDataSchema.parse(BASE_DATA);
    const { verifyForm } = await fillAndReload(data);
    expect(readFormData(verifyForm).secondName).toBeUndefined();
  });
});

describe("checkbox values - every real option exercised individually", () => {
  for (const question4 of [true, false]) {
    test(`question4 = ${question4}`, async () => {
      const data = FormDataSchema.parse({ ...BASE_DATA, question4 });
      const { verifyForm } = await fillAndReload(data);
      expect(readFormData(verifyForm).question4).toBe(question4);
    });
  }

  for (const workType of ["FT", "PT", "Seasonal", "Casual"] as const) {
    test(`employment.workType = ${workType}`, async () => {
      const data = FormDataSchema.parse({
        ...BASE_DATA,
        employment: { personWorking: "You", workType, usualWage: true },
      });
      const { verifyForm } = await fillAndReload(data);
      expect(readFormData(verifyForm).employment?.workType).toBe(workType);
    });
  }

  for (const personWorking of ["You", "Partner"] as const) {
    test(`employment.personWorking = ${personWorking}`, async () => {
      const data = FormDataSchema.parse({
        ...BASE_DATA,
        employment: { personWorking, workType: "FT", usualWage: true },
      });
      const { verifyForm } = await fillAndReload(data);
      expect(readFormData(verifyForm).employment?.personWorking).toBe(personWorking);
    });
  }

  for (const usualWage of [true, false]) {
    test(`employment.usualWage = ${usualWage}`, async () => {
      const data = FormDataSchema.parse({
        ...BASE_DATA,
        employment: { personWorking: "You", workType: "FT", usualWage },
      });
      const { verifyForm } = await fillAndReload(data);
      expect(readFormData(verifyForm).employment?.usualWage).toBe(usualWage);
    });
  }
});

describe("employment gating and the Hidden annotation flag", () => {
  test("employment present unhides the Q8 widgets it fills", async () => {
    const data = FormDataSchema.parse({
      ...BASE_DATA,
      employment: { personWorking: "You", workType: "FT", usualWage: true },
    });
    const { verifyForm } = await fillAndReload(data);

    for (const name of ["Q8.PersonWorking1", "Q8.WorkIs1", "Q8.UsualWage1"]) {
      const field = verifyForm.getField(name);
      expect(field).toBeInstanceOf(PDFCheckBox);
      expect(isHidden(field as PDFCheckBox)).toBe(false);
    }
    expect(readFormData(verifyForm).employment).toEqual(data.employment!);
  });

  test("employment absent sets Q8Q to 'No' and leaves the section hidden", async () => {
    const data = FormDataSchema.parse(BASE_DATA);
    const { verifyForm } = await fillAndReload(data);

    const q8q = verifyForm.getCheckBox("Q8Q");
    expect(q8q.acroField.getValue().decodeText()).toBe("No");

    const workIs1 = verifyForm.getCheckBox("Q8.WorkIs1");
    expect(isHidden(workIs1)).toBe(true);
    expect(readFormData(verifyForm).employment).toBeUndefined();
  });
});

describe("multi-widget checkbox guards reject invalid export values", () => {
  test("pdf-lib's own setValue() guard rejects 'Your Partner' on Q8.PersonWorking2", async () => {
    const { form } = await loadForm();
    const field = form.getCheckBox("Q8.PersonWorking2");
    expect(() => field.acroField.setValue(PDFName.of("Your Partner"))).toThrow();
  });

  test("selectCheckboxOption rejects a bogus value and lists the real options", async () => {
    const { form } = await loadForm();
    let message = "";
    try {
      selectCheckboxOption(form, "Q8.WorkIs1", "Overtime");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("Overtime");
    expect(message).toContain("FT");
    expect(message).toContain("PT");
    expect(message).toContain("Seasonal");
    expect(message).toContain("Casual");
  });
});

describe("structural regression guards", () => {
  test("assertTemplateHash throws when the template bytes change", () => {
    const mutated = new Uint8Array(blankBytes);
    mutated[0] = (mutated[0] ?? 0) ^ 0xff;
    expect(() => assertTemplateHash(mutated, FORM_PATH)).toThrow();
  });

  test("assertTemplateHash does not throw for the real, unmodified template", () => {
    expect(() => assertTemplateHash(blankBytes, FORM_PATH)).not.toThrow();
  });

  test("filling the form does not flatten it", async () => {
    const data = FormDataSchema.parse(BASE_DATA);
    const { verifyForm } = await fillAndReload(data);
    expect(verifyForm.getFields().length).toBe(565);
  });

  test("none of the fields we fill carry a Calculate action", async () => {
    const { form } = await loadForm();
    const targets = [
      "Q2.FamilyName",
      "Q2.FirstName",
      "Q2.SecondName",
      "1_CRN.0",
      "1_CRN.1",
      "1_CRN.2",
      "1_CRN.3",
      "Q4",
      "Q8Q",
      "Q8.PersonWorking1",
      "Q8.WorkIs1",
      "Q8.UsualWage1",
    ];
    for (const name of targets) {
      const field = form.getField(name);
      const aa = field.acroField.dict.lookup(PDFName.of("AA"));
      const hasCalculate = aa instanceof PDFDict && aa.has(PDFName.of("C"));
      expect(hasCalculate).toBe(false);
    }
  });
});
