import type { PDFForm } from "pdf-lib";
import type { FormData } from "./schema";
import { unhide, selectCheckboxOption } from "../../scripts/genericFields";

function readCheckboxValue(form: PDFForm, fieldName: string): string {
  return form.getCheckBox(fieldName).acroField.getValue().decodeText();
}

// Q2Details.Date's Format/Keystroke actions (fields.txt) confirm the PDF
// expects exactly "DD MM YYYY" - two literal space separators, zero-padded -
// in this one Comb(10) field. pdf-lib lays each character into its own comb
// cell on setText(), same as it already does for CRN.0-3 in this form.
function toDdMmYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day} ${month} ${year}`;
}

function fromDdMmYyyy(fieldName: string, value: string): string {
  const match = value.match(/^(\d{2}) (\d{2}) (\d{4})$/);
  if (!match) {
    throw new Error(`${fieldName}: expected "DD MM YYYY", got ${JSON.stringify(value)}`);
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export const MAPPED_FIELD_NAMES: readonly string[] = ["Q2", "Q2Details.Country", "Q2Details.Date"];

export function applyFormData(form: PDFForm, data: FormData): void {
  if (data.citizenship) {
    selectCheckboxOption(form, "Q2", "No");
    const countryField = form.getTextField("Q2Details.Country");
    const dateField = form.getTextField("Q2Details.Date");
    countryField.setText(data.citizenship.country);
    dateField.setText(toDdMmYyyy(data.citizenship.date));
    unhide(countryField);
    unhide(dateField);
  } else {
    selectCheckboxOption(form, "Q2", "Yes");
  }
}

export function readFormData(form: PDFForm): FormData {
  const data: FormData = {};

  if (readCheckboxValue(form, "Q2") === "No") {
    data.citizenship = {
      country: form.getTextField("Q2Details.Country").getText() ?? "",
      date: fromDdMmYyyy("Q2Details.Date", form.getTextField("Q2Details.Date").getText() ?? ""),
    };
  }

  return data;
}
