// App-managed OTP store. Uses the private phone_otps / phone_otp_sends tables
// (service role only). Outside production, falls back to process memory when
// those tables don't exist yet (e.g. before the draft migration is applied).

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_IP_SENDS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

type OtpRecord = { hash: string; expiresAt: number; attempts: number; locked: boolean };

export class OtpRateLimitError extends Error {}

// ---------- backend selection ----------
type Backend = {
  getOtp(phone: string): Promise<OtpRecord | null>;
  putOtp(phone: string, rec: OtpRecord): Promise<void>;
  deleteOtp(phone: string): Promise<void>;
  sendTimes(phone: string, since: number): Promise<number[]>;
  ipSendCount(ip: string, since: number): Promise<number>;
  recordSend(phone: string, ip: string | null): Promise<void>;
};

const mem = {
  otps: new Map<string, OtpRecord>(),
  sends: [] as { phone: string; ip: string | null; at: number }[],
};
const memoryBackend: Backend = {
  async getOtp(p) { return mem.otps.get(p) ?? null; },
  async putOtp(p, r) { mem.otps.set(p, r); },
  async deleteOtp(p) { mem.otps.delete(p); },
  async sendTimes(p, since) { return mem.sends.filter((s) => s.phone === p && s.at >= since).map((s) => s.at); },
  async ipSendCount(ip, since) { return mem.sends.filter((s) => s.ip === ip && s.at >= since).length; },
  async recordSend(phone, ip) {
    const now = Date.now();
    mem.sends = mem.sends.filter((s) => now - s.at < HOUR_MS);
    mem.sends.push({ phone, ip, at: now });
  },
};

async function dbBackend(): Promise<Backend> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const chk = (error: any) => { if (error) throw new Error(error.message); };
  return {
    async getOtp(phone) {
      const { data, error } = await db.from("phone_otps").select("*").eq("phone", phone).maybeSingle();
      chk(error);
      return data
        ? { hash: data.otp_hash, expiresAt: Date.parse(data.expires_at), attempts: data.attempts, locked: data.locked }
        : null;
    },
    async putOtp(phone, r) {
      const { error } = await db.from("phone_otps").upsert({
        phone, otp_hash: r.hash, expires_at: new Date(r.expiresAt).toISOString(),
        attempts: r.attempts, locked: r.locked, created_at: new Date().toISOString(),
      }, { onConflict: "phone" });
      chk(error);
    },
    async deleteOtp(phone) {
      const { error } = await db.from("phone_otps").delete().eq("phone", phone);
      chk(error);
    },
    async sendTimes(phone, since) {
      const { data, error } = await db.from("phone_otp_sends").select("sent_at")
        .eq("phone", phone).gte("sent_at", new Date(since).toISOString()).order("sent_at");
      chk(error);
      return (data ?? []).map((r: any) => Date.parse(r.sent_at));
    },
    async ipSendCount(ip, since) {
      const { count, error } = await db.from("phone_otp_sends").select("id", { count: "exact", head: true })
        .eq("ip", ip).gte("sent_at", new Date(since).toISOString());
      chk(error);
      return count ?? 0;
    },
    async recordSend(phone, ip) {
      const { error } = await db.from("phone_otp_sends").insert({ phone, ip });
      chk(error);
    },
  };
}

let cached: Backend | null = null;
async function backend(): Promise<Backend> {
  if (cached) return cached;
  try {
    const db = await dbBackend();
    await db.getOtp("__probe__"); // fails if the table doesn't exist yet
    cached = db;
  } catch (e) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OTP storage is not configured. Please contact support.");
    }
    console.warn("[otp] database store unavailable, using in-memory store (dev only)");
    cached = memoryBackend;
  }
  return cached;
}

// ---------- public API ----------
export async function assertCanSend(phone: string, ip: string | null) {
  const b = await backend();
  const now = Date.now();
  const sends = await b.sendTimes(phone, now - HOUR_MS);
  const last = sends[sends.length - 1];
  if (last && now - last < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    throw new OtpRateLimitError(`Please wait ${wait}s before requesting another code.`);
  }
  if (sends.length >= MAX_SENDS_PER_HOUR) {
    throw new OtpRateLimitError("Too many codes requested. Please try again later.");
  }
  if (ip && (await b.ipSendCount(ip, now - HOUR_MS)) >= MAX_IP_SENDS_PER_HOUR) {
    throw new OtpRateLimitError("Too many requests. Please try again later.");
  }
}

export async function recordSend(phone: string, ip: string | null) {
  await (await backend()).recordSend(phone, ip);
}

export function generateOtp(): string {
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
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
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
  await (await backend()).putOtp(phone, {
    hash: await hmac(phone, otp), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, locked: false,
  });
}

export async function discardOtp(phone: string) {
  await (await backend()).deleteOtp(phone);
}

/** Single-use check. Returns true only for a live, unlocked, matching code. */
export async function consumeOtp(phone: string, code: string): Promise<boolean> {
  const b = await backend();
  const rec = await b.getOtp(phone);
  if (!rec || rec.locked) return false;
  if (Date.now() > rec.expiresAt) {
    await b.deleteOtp(phone);
    return false;
  }
  if (constantTimeEqual(rec.hash, await hmac(phone, code))) {
    await b.deleteOtp(phone); // prevent replay
    return true;
  }
  const attempts = rec.attempts + 1;
  await b.putOtp(phone, { ...rec, attempts, locked: attempts >= MAX_VERIFY_ATTEMPTS });
  return false;
}
