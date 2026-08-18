import type { ClientRecord } from "./clientDb";
import type { DerivedResult } from "./derive";
import { DEFAULT_INCOME_AND_ASSETS_VALUE, type IncomeAndAssetsFormValue } from "../forms/IncomeAndAssetsForm";

// EmploymentStatus values this dummy fixture (and, presumably, a real one)
// carries that map onto the PDF's real workType export values. Deliberately
// a lookup, not a guess: a status this table doesn't recognize (e.g. "Self
// Employed" - see genDummyClientsDb.ts's Chen Wu) falls through to
// "uncertain" rather than picking an arbitrary work type.
const WORK_TYPE_LOOKUP: Record<string, IncomeAndAssetsFormValue["workType"]> = {
  "Full Time": "FT",
  "Part Time": "PT",
  Casual: "Casual",
  Seasonal: "Seasonal",
};

// Statuses that mean "not employed" outright - Q8Q on the real PDF should
// be answered "No" rather than routed through an unrecognized work type.
const NOT_EMPLOYED_STATUSES = new Set(["Retired", "Unemployed"]);

export function deriveIncomeAndAssetsInput(client: ClientRecord): DerivedResult<IncomeAndAssetsFormValue> {
  const uncertain: (keyof IncomeAndAssetsFormValue)[] = [];

  const crn = client.CentrelinkReferenceNumber ?? "";
  if (!crn) uncertain.push("clientReferenceNumber");

  // No real-world meaning was ever established for this field (see
  // IncomeAndAssetsForm.tsx's own label) - no client-record field could
  // possibly answer it, so it's always flagged.
  uncertain.push("question4");

  const status = client.EmploymentStatus?.trim();
  let employed = false;
  let workType: IncomeAndAssetsFormValue["workType"] = DEFAULT_INCOME_AND_ASSETS_VALUE.workType;

  if (!status) {
    uncertain.push("employed");
  } else if (NOT_EMPLOYED_STATUSES.has(status)) {
    employed = false;
  } else {
    employed = true;
    const mapped = WORK_TYPE_LOOKUP[status];
    if (mapped) {
      workType = mapped;
    } else {
      uncertain.push("workType");
    }
  }

  // "Who is working" and "usual wage" are structural assumptions this
  // record can't answer at all - always flagged, regardless of whether
  // employment applies.
  uncertain.push("personWorking", "usualWage");

  const value: IncomeAndAssetsFormValue = {
    familyName: client.LastName,
    firstName: client.FirstName,
    secondName: client.MiddleName ?? "",
    clientReferenceNumber: crn,
    question4: false,
    employed,
    personWorking: DEFAULT_INCOME_AND_ASSETS_VALUE.personWorking,
    workType,
    usualWage: DEFAULT_INCOME_AND_ASSETS_VALUE.usualWage,
  };

  return { value, uncertainFields: uncertain };
}
