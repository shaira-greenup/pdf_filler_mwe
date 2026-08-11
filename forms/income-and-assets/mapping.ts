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

export function applyFormData(form: PDFForm, data: FormData): void {
  form.getTextField("Q2.FamilyName").setText(data.familyName);
  form.getTextField("Q2.FirstName").setText(data.firstName);
  if (data.secondName !== undefined) {
    form.getTextField("Q2.SecondName").setText(data.secondName);
  }

  for (const { field, start, end } of CRN_SEGMENTS) {
    form.getTextField(field).setText(data.clientReferenceNumber.slice(start, end));
  }

  selectCheckboxOption(form, "Q4", data.question4 ? "Yes" : "No");

  if (data.employment) {
    selectCheckboxOption(form, "Q8Q", "Yes");
    selectCheckboxOption(form, "Q8.PersonWorking1", data.employment.personWorking);
    selectCheckboxOption(form, "Q8.WorkIs1", data.employment.workType);
    selectCheckboxOption(form, "Q8.UsualWage1", data.employment.usualWage ? "Yes" : "No");
    for (const name of ["Q8.PersonWorking1", "Q8.WorkIs1", "Q8.UsualWage1"]) {
      unhide(form.getCheckBox(name));
    }
  } else {
    selectCheckboxOption(form, "Q8Q", "No");
  }
}

export function readFormData(form: PDFForm): FormData {
  const secondNameRaw = form.getTextField("Q2.SecondName").getText();
  const clientReferenceNumber = CRN_SEGMENTS.map(
    ({ field }) => form.getTextField(field).getText() ?? "",
  ).join("");

  const data: FormData = {
    familyName: form.getTextField("Q2.FamilyName").getText() ?? "",
    firstName: form.getTextField("Q2.FirstName").getText() ?? "",
    secondName: secondNameRaw === undefined ? undefined : secondNameRaw,
    clientReferenceNumber,
    question4: readCheckboxValue(form, "Q4") === "Yes",
  };

  if (readCheckboxValue(form, "Q8Q") === "Yes") {
    data.employment = {
      personWorking: readCheckboxValue(form, "Q8.PersonWorking1") as "You" | "Partner",
      workType: readCheckboxValue(form, "Q8.WorkIs1") as "FT" | "PT" | "Seasonal" | "Casual",
      usualWage: readCheckboxValue(form, "Q8.UsualWage1") === "Yes",
    };
  }

  return data;
}
