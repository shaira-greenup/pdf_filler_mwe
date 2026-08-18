// One line of the read-only "what did we extract" view (FriendlyDataView).
// needsReview means the collation step could not answer this question from
// the client record - the value shown is not a fallback guess, it is simply
// unknown, and the corresponding PDF field is left blank for the human.
export interface DisplayRow {
  label: string;
  value: string;
  needsReview: boolean;
}
