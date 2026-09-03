/**
 * Indian mobile numbers only: exactly +91 followed by 10 digits.
 * Frontend and backend MUST share this regex so validation never mismatches.
 */
export const IN_PHONE_REGEX = /^\+91\d{10}$/;

export const IN_PHONE_MESSAGE = "Enter a 10-digit Indian mobile number (+91XXXXXXXXXX)";

/**
 * Normalises loose user input to +91XXXXXXXXXX.
 * Accepts "9876543210", "09876543210", "919876543210", "+91 98765 43210", etc.
 * Returns the trimmed input unchanged when it can't be confidently normalised,
 * so validation can reject it with a clear message.
 */
export function normalizeIndianPhone(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+91${digits}`;
  return raw;
}
