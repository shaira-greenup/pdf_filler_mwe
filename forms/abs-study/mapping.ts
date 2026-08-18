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
  // No else-branch writing "No": citizenship being absent means unknown,
  // and nothing here may answer a question on the client's behalf (see
  // schema.ts). Q2 simply stays blank for the human to answer.
  if (!data.citizenship) return;

  selectCheckboxOption(form, "Q2", "Yes");
  const countryField = form.getTextField("Q2Details.Country");
  const dateField = form.getTextField("Q2Details.Date");
  countryField.setText(data.citizenship.country);
  if (data.citizenship.date !== undefined) {
    dateField.setText(toDdMmYyyy(data.citizenship.date));
  }
  // Both are unhidden even when the date is unknown - Q2 = "Yes" is what
  // makes this section apply, and a field left blank for the human to
  // complete is useless if it stays invisible (hard rule 8).
  unhide(countryField);
  unhide(dateField);
}

export function readFormData(form: PDFForm): FormData {
  const data: FormData = {};

  if (readCheckboxValue(form, "Q2") === "Yes") {
    const rawDate = form.getTextField("Q2Details.Date").getText() ?? "";
    data.citizenship = {
      country: form.getTextField("Q2Details.Country").getText() ?? "",
      date: rawDate.trim() === "" ? undefined : fromDdMmYyyy("Q2Details.Date", rawDate),
    };
  }

  return data;
}
