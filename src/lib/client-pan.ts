import { z } from "zod";

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const optionalPanSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === "" || PAN_REGEX.test(value), "Enter a valid PAN, e.g. ABCDE1234F")
  .transform((value) => value || null)
  .nullish();