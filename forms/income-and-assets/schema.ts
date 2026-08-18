import { z } from "zod";

// Optionality here carries real meaning, and it is not cosmetic: a key that
// is absent means "we do not know the answer to this question", which is a
// genuinely different thing from a false/"No" answer. The browser pipeline
// (ui/) derives this object from a client record, and anything it cannot
// confidently derive is omitted rather than defaulted - so mapping.ts
// leaves that PDF field untouched and the human answers it themselves,
// instead of the form shipping a guess that reads as a real answer. See
// docs/20260818_browser-ui-mwe-plan.md.
export const FormDataSchema = z.object({
  familyName: z.string().min(1),
  firstName: z.string().min(1),
  secondName: z.string().optional(),
  clientReferenceNumber: z.string().regex(/^\d{10}$/, "must be exactly 10 digits"),
  question4: z.boolean().optional(),
  // Three states, deliberately:
  //   undefined            - no employment information at all; Q8Q is left blank
  //   { isEmployed: false } - confirmed not employed; Q8Q = "No"
  //   { isEmployed: true }  - employed; Q8Q = "Yes", plus whichever details are known
  // The details are individually optional for the same reason as above: a
  // known employment status does not imply the sub-answers are known too.
  employment: z
    .object({
      isEmployed: z.boolean(),
      personWorking: z.enum(["You", "Partner"]).optional(),
      workType: z.enum(["FT", "PT", "Seasonal", "Casual"]).optional(),
      usualWage: z.boolean().optional(),
    })
    .optional(),
});

// Everything else in fixtures/sample-data.json - every real PDF field we
// haven't given a business-meaningful name to - sits flat at the root,
// alongside these declared keys. fill.ts splits the raw JSON by checking
// each key against Object.keys(FormDataSchema.shape): a declared key goes
// through this schema; anything else goes through genericFields.ts's
// buildGenericSchema(form), which needs the loaded PDF to know each field's
// real shape (export values, MaxLength) - that's why it isn't validated
// here.

export type FormData = z.infer<typeof FormDataSchema>;
