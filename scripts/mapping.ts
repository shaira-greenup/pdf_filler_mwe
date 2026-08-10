import { PDFForm, PDFCheckBox, PDFName, PDFNumber } from "pdf-lib";
import type { FormData } from "./schema";

// PDF annotation flags (PDF spec, Table 165): bit 2 (value 2) is Hidden.
const ANNOTATION_FLAG_HIDDEN = 2;

// This form gates entire sections behind a lead question (e.g. Q8Q: "Is
// anyone employed?"). Every widget in a gated section has the Hidden
// annotation flag set directly in the blank template - a static, spec-level
// rendering directive, not something only the form's own JavaScript can
// toggle. pdf-lib never runs that JavaScript, so satisfying a gate's value
// does not by itself reveal the section: we have to clear Hidden ourselves.
function unhide(field: PDFCheckBox): void {
  for (const widget of field.acroField.getWidgets()) {
    const current = widget.dict.lookup(PDFName.of("F"));
    const flags = current instanceof PDFNumber ? current.asNumber() : 0;
    widget.dict.set(PDFName.of("F"), PDFNumber.of(flags & ~ANNOTATION_FLAG_HIDDEN));
  }
}

// Some checkbox fields in this form use one field with multiple widgets,
// each carrying a different on-value, to implement what is effectively a
// radio group (e.g. Q8.WorkIs1: "FT"/"PT"/"Seasonal"/"Casual" on one field).
// pdf-lib's PDFCheckBox.check() and acroField.setValue() only ever recognize
// the *first* widget's on-value, so selecting any other widget's value has
// to bypass that guard directly.
export function selectCheckboxOption(form: PDFForm, fieldName: string, onValue: string): void {
  const field = form.getCheckBox(fieldName);
  const onValueName = PDFName.of(onValue);
  const widgets = field.acroField.getWidgets();
  const widget = widgets.find((w) => w.getOnValue() === onValueName);
  if (!widget) {
    const validOptions = widgets
      .map((w) => w.getOnValue()?.decodeText())
      .filter((v): v is string => v !== undefined);
    throw new Error(
      `${fieldName}: ${JSON.stringify(onValue)} is not a valid option. Valid options: ${JSON.stringify(validOptions)}`,
    );
  }
  field.acroField.dict.set(PDFName.of("V"), onValueName);
  for (const w of widgets) {
    w.setAppearanceState(w.getOnValue() === onValueName ? onValueName : PDFName.of("Off"));
  }
}

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
