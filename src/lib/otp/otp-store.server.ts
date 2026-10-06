// App-managed OTP store for LOCAL DEVELOPMENT ONLY.
// Process memory: lost on restart, not shared across instances. Production
// must use a database-backed store once a secure (HTTPS) SMS provider exists.

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_IP_SENDS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

type OtpRecord = {
  hash: string;
  expiresAt: number;
  attempts: number;
  locked: boolean;
};

const otps = new Map<string, OtpRecord>(); // key: phone (one live OTP per number)
const phoneSends = new Map<string, number[]>();
const ipSends = new Map<string, number[]>();

export class OtpRateLimitError extends Error {}

function recent(list: number[] | undefined, now: number) {
  return (list ?? []).filter((t) => now - t < HOUR_MS);
}

/** Throws OtpRateLimitError when cooldown / hourly / per-IP limits are hit. */
export function assertCanSend(phone: string, ip: string | null) {
  const now = Date.now();
  const sends = recent(phoneSends.get(phone), now);
  const last = sends[sends.length - 1];
  if (last && now - last < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    throw new OtpRateLimitError(`Please wait ${wait}s before requesting another code.`);
  }
  if (sends.length >= MAX_SENDS_PER_HOUR) {
    throw new OtpRateLimitError("Too many codes requested. Please try again later.");
  }
  if (ip && recent(ipSends.get(ip), now).length >= MAX_IP_SENDS_PER_HOUR) {
    throw new OtpRateLimitError("Too many requests. Please try again later.");
  }
}

export function recordSend(phone: string, ip: string | null) {
  const now = Date.now();
  phoneSends.set(phone, [...recent(phoneSends.get(phone), now), now]);
  if (ip) ipSends.set(ip, [...recent(ipSends.get(ip), now), now]);
}

export function generateOtp(): string {
  // Rejection sampling avoids modulo bias.
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % 1_000_000).padStart(6, "0");
}

async function hmac(phone: string, otp: string): Promise<string> {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${otp}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Stores a new OTP hash; replaces (invalidates) any earlier OTP for this phone. */
export async function storeOtp(phone: string, otp: string) {
  otps.set(phone, {
    hash: await hmac(phone, otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    locked: false,
  });
}

export function discardOtp(phone: string) {
  otps.delete(phone);
}

/** Single-use check. Returns true only for a live, unlocked, matching code. */
export async function consumeOtp(phone: string, code: string): Promise<boolean> {
  const rec = otps.get(phone);
  if (!rec || rec.locked) return false;
  if (Date.now() > rec.expiresAt) {
    otps.delete(phone);
    return false;
  }
  const ok = constantTimeEqual(rec.hash, await hmac(phone, code));
  if (ok) {
    otps.delete(phone); // prevent replay
    return true;
  }
  rec.attempts += 1;
  if (rec.attempts >= MAX_VERIFY_ATTEMPTS) rec.locked = true;
  return false;
}
