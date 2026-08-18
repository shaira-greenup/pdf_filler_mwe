// Shared shape for every "collate a client record into a form's business
// input" step (deriveIncomeAndAssets.ts / deriveAbsStudy.ts). uncertainFields
// is the load-bearing part: keys the client record could not confidently
// answer, so the UI can flag exactly those instead of mixing a guess in
// silently with real data - the same "encoded and understood" vs "needs a
// human" split the gate-graph work already established, just one layer
// earlier (see docs/20260818_browser-ui-mwe-plan.md).
export interface DerivedResult<T> {
  value: T;
  uncertainFields: (keyof T)[];
}
