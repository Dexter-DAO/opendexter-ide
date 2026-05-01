import { z } from "zod";

/**
 * Zod input schemas for every Dextercard tool that accepts arguments.
 * Derived from the carrier's documented input surface.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const CardOnboardingStartSchema = z.object({
  phoneCountryCode: z.string().min(1).max(4),
  phoneNumber: z.string().min(4),
  countryOfResidence: z.string().length(2),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: isoDate,
  countryOfNationality: z.string().length(2),
});

export const CardOnboardingFinishSchema = z.object({
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  zip: z.string().min(1),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "acceptTerms must be true" }),
  }),
  acceptESign: z.boolean().optional(),
});

export const CardWalletLinkSchema = z.object({
  wallet: z.string().min(1),
  currency: z.string().min(1),
  amount: z.number().positive(),
});

export const CardWalletUnlinkSchema = z.object({
  wallet: z.string().min(1),
  currency: z.string().min(1),
});

export const CardWalletCheckSchema = z.object({
  wallet: z.string().min(1),
  chain: z.string().min(1),
  currency: z.string().min(1),
});

export const CardTransactionListSchema = z
  .object({
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    page: z.number().int().nonnegative().optional(),
  })
  .refine(
    (v) => (v.dateFrom == null) === (v.dateTo == null),
    { message: "dateFrom and dateTo must be provided together or omitted together" },
  );
