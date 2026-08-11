import { z } from "zod";

export const FormDataSchema = z.object({
  familyName: z.string().min(1),
  firstName: z.string().min(1),
  secondName: z.string().optional(),
  clientReferenceNumber: z.string().regex(/^\d{10}$/, "must be exactly 10 digits"),
  question4: z.boolean(),
  employment: z
    .object({
      personWorking: z.enum(["You", "Partner"]),
      workType: z.enum(["FT", "PT", "Seasonal", "Casual"]),
      usualWage: z.boolean(),
    })
    .optional(),
  // Every other real PDF field, by its exact name, as a plain string. This
  // is the catch-all for everything we haven't given business-meaningful
  // names to. Loosely typed here (just string values) - the real per-field
  // type checking (real export values, MaxLength) happens in fill.ts via
  // genericFields.ts's buildGenericSchema(form), which needs the loaded PDF
  // to know each field's actual shape.
  otherFields: z.record(z.string(), z.string()).optional(),
});

export type FormData = z.infer<typeof FormDataSchema>;
