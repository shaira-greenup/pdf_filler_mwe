import type { PDFForm } from "pdf-lib";
import type { FormData } from "./schema";
import { unhide, selectCheckboxOption } from "../../scripts/genericFields";

function readCheckboxValue(form: PDFForm, fieldName: string): string {
  return form.getCheckBox(fieldName).acroField.getValue().decodeText();
}

// Client Reference Number is one 10-digit number in the typed data object,
// but the PDF splits it across four combed boxes (MaxLength 3/3/3/1).
const CRN_SEGMENTS = [
  { field: "1_CRN.0", start: 0, end: 3 },
  { field: "1_CRN.1", start: 3, end: 6 },
  { field: "1_CRN.2", start: 6, end: 9 },
  { field: "1_CRN.3", start: 9, end: 10 },
];

// Every real PDF field name this module manages directly. The fill pipeline
// uses this to reject raw-field-name entries that collide with a field
// already covered by the business schema - a field should have exactly one
// source of truth.
export const MAPPED_FIELD_NAMES: readonly string[] = [
  "Q2.FamilyName",
  "Q2.FirstName",
  "Q2.SecondName",
  ...CRN_SEGMENTS.map((s) => s.field),
  "Q4",
  "Q8Q",
  "Q8.PersonWorking1",
  "Q8.WorkIs1",
  "Q8.UsualWage1",
];

// The Q8 detail fields, unhidden together whenever employment is confirmed.
// All three are revealed even if only some have known values: Q8Q = "Yes"
// is what makes this section apply at all, and a field left blank for the
// human to complete is useless to them if it is still invisible (hard rule
// 8 - pdf-lib never runs the form's own JS, so nothing else reveals them).
const Q8_DETAIL_FIELDS = ["Q8.PersonWorking1", "Q8.WorkIs1", "Q8.UsualWage1"];

export function applyFormData(form: PDFForm, data: FormData): void {
  form.getTextField("Q2.FamilyName").setText(data.familyName);
  form.getTextField("Q2.FirstName").setText(data.firstName);
  if (data.secondName !== undefined) {
    form.getTextField("Q2.SecondName").setText(data.secondName);
  }

  for (const { field, start, end } of CRN_SEGMENTS) {
    form.getTextField(field).setText(data.clientReferenceNumber.slice(start, end));
  }

  // An undefined answer is left untouched, not written as "No" - see
  // schema.ts on why absent means "unknown" rather than false.
  if (data.question4 !== undefined) {
    selectCheckboxOption(form, "Q4", data.question4 ? "Yes" : "No");
  }

  if (data.employment) {
    const { isEmployed, personWorking, workType, usualWage } = data.employment;
    selectCheckboxOption(form, "Q8Q", isEmployed ? "Yes" : "No");
    if (isEmployed) {
      if (personWorking !== undefined) selectCheckboxOption(form, "Q8.PersonWorking1", personWorking);
      if (workType !== undefined) selectCheckboxOption(form, "Q8.WorkIs1", workType);
      if (usualWage !== undefined) selectCheckboxOption(form, "Q8.UsualWage1", usualWage ? "Yes" : "No");
      for (const name of Q8_DETAIL_FIELDS) {
        unhide(form.getCheckBox(name));
      }
    }
  }
}

export function readFormData(form: PDFForm): FormData {
  const secondNameRaw = form.getTextField("Q2.SecondName").getText();
  const clientReferenceNumber = CRN_SEGMENTS.map(
    ({ field }) => form.getTextField(field).getText() ?? "",
  ).join("");

  // "Off" is the checkbox's literal unanswered state - mapped back to
  // undefined so a blank field round-trips as "unknown", matching what
  // applyFormData refused to write in the first place.
  const question4 = readCheckboxValue(form, "Q4");

  const data: FormData = {
    familyName: form.getTextField("Q2.FamilyName").getText() ?? "",
    firstName: form.getTextField("Q2.FirstName").getText() ?? "",
    secondName: secondNameRaw === undefined ? undefined : secondNameRaw,
    clientReferenceNumber,
    question4: question4 === "Off" ? undefined : question4 === "Yes",
  };

  const q8q = readCheckboxValue(form, "Q8Q");
  if (q8q === "Yes") {
    const personWorking = readCheckboxValue(form, "Q8.PersonWorking1");
    const workType = readCheckboxValue(form, "Q8.WorkIs1");
    const usualWage = readCheckboxValue(form, "Q8.UsualWage1");
    data.employment = {
      isEmployed: true,
      personWorking: personWorking === "Off" ? undefined : (personWorking as "You" | "Partner"),
      workType: workType === "Off" ? undefined : (workType as "FT" | "PT" | "Seasonal" | "Casual"),
      usualWage: usualWage === "Off" ? undefined : usualWage === "Yes",
    };
  } else if (q8q === "No") {
    data.employment = { isEmployed: false };
  }

  return data;
}
