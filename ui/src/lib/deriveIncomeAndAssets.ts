import type { ClientRecord } from "./clientDb";
import type { DerivedResult } from "./derive";
import { DEFAULT_INCOME_AND_ASSETS_DRAFT, type IncomeAndAssetsDraft } from "../forms/incomeAndAssets";

// EmploymentStatus values this dummy fixture (and, presumably, a real one)
// carries that map onto the PDF's real workType export values. Deliberately
// a lookup, not a guess: a status this table doesn't recognize (e.g. "Self
// Employed" - see genDummyClientsDb.ts's Chen Wu) falls through to
// "uncertain" rather than picking an arbitrary work type.
const WORK_TYPE_LOOKUP: Record<string, IncomeAndAssetsDraft["workType"]> = {
  "Full Time": "FT",
  "Part Time": "PT",
  Casual: "Casual",
  Seasonal: "Seasonal",
};

// Statuses that mean "not employed" outright - Q8Q on the real PDF should
// be answered "No" rather than routed through an unrecognized work type.
const NOT_EMPLOYED_STATUSES = new Set(["Retired", "Unemployed"]);

export function deriveIncomeAndAssetsInput(client: ClientRecord): DerivedResult<IncomeAndAssetsDraft> {
  const uncertain: (keyof IncomeAndAssetsDraft)[] = [];

  const crn = client.CentrelinkReferenceNumber ?? "";
  if (!crn) uncertain.push("clientReferenceNumber");

  // No real-world meaning was ever established for this question - no
  // client-record field could possibly answer it, so it's always flagged
  // and Q4 is always left blank on the PDF.
  uncertain.push("question4");

  const status = client.EmploymentStatus?.trim();
  let employed = false;
  let workType: IncomeAndAssetsDraft["workType"] = DEFAULT_INCOME_AND_ASSETS_DRAFT.workType;

  if (!status) {
    // No employment status on file at all - not just "employed" is
    // unknown, everything downstream of it is too. Flagging all four means
    // toIncomeAndAssetsBusinessInput drops the employment object entirely,
    // so Q8Q is left blank rather than answered "No" on no evidence.
    uncertain.push("employed", "personWorking", "workType", "usualWage");
  } else if (NOT_EMPLOYED_STATUSES.has(status)) {
    // Confidently not employed - the employment sub-fields don't apply at
    // all (IncomeAndAssetsForm.tsx hides them entirely when employed is
    // false), so there's nothing left to flag for this client.
    employed = false;
  } else {
    employed = true;
    const mapped = WORK_TYPE_LOOKUP[status];
    if (mapped) {
      workType = mapped;
    } else {
      uncertain.push("workType");
    }
    // "Who is working" and "usual wage" are structural assumptions this
    // record can't answer - only relevant, and only flagged, when
    // employment actually applies (otherwise those PDF fields aren't in
    // play at all, so flagging them would be noise).
    uncertain.push("personWorking", "usualWage");
  }

  const value: IncomeAndAssetsDraft = {
    familyName: client.LastName,
    firstName: client.FirstName,
    secondName: client.MiddleName ?? "",
    clientReferenceNumber: crn,
    question4: false,
    employed,
    personWorking: DEFAULT_INCOME_AND_ASSETS_DRAFT.personWorking,
    workType,
    usualWage: DEFAULT_INCOME_AND_ASSETS_DRAFT.usualWage,
  };

  return { value, uncertainFields: uncertain };
}
