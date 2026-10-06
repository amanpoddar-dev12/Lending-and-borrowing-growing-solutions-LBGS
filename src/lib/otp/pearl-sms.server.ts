// Pearl SMS delivery. NOTE: Pearl only offers an HTTP endpoint; replace with an
// HTTPS provider/endpoint before relying on this long-term in production.

const PEARL_SEND_URL = "http://sms.pearlsms.com/public/sms/send";
const TIMEOUT_MS = 10_000;

// Approved template — only {#var#} is replaced.
const OTP_TEMPLATE =
  "Your OTP is {#var#}. Use this to verify your mobile number on SPPLFW. Valid for 5 minutes.";


export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export type PearlParseResult = { ok: true } | { ok: false; reason: string };

/**
 * Isolated success criteria. Observed Pearl success reply:
 *   {"status":"SUCCESS","errormsg":"success","statuscode":200,"requestid":"42063669"}
 * Empty / non-JSON bodies and any non-success status are failures.
 */
export function parsePearlResponse(status: number, body: string): PearlParseResult {
  if (status < 200 || status >= 300) return { ok: false, reason: `HTTP ${status}` };
  const text = body.trim();
  if (!text) return { ok: false, reason: "empty response" };
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unparseable response" };
  }
  if (!json || typeof json !== "object") return { ok: false, reason: "unexpected response shape" };
  if (json.error === true || json.success === false) return { ok: false, reason: "provider reported error" };
  if (json.statuscode != null && Number(json.statuscode) !== 200) {
    return { ok: false, reason: `provider statuscode ${json.statuscode}` };
  }
  const status_ = String(json.status ?? json.Status ?? "").toLowerCase();
  if (json.success === true || ["success", "ok", "sent", "submitted", "accepted"].includes(status_)) {
    return { ok: true };
  }
  return { ok: false, reason: "success not confirmed" };
}

function redact(body: string, secrets: string[]) {
  let out = body.slice(0, 500);
  for (const s of secrets) if (s) out = out.split(s).join("[REDACTED]");
  return out.replace(/\d{6,}/g, (m) => `${"*".repeat(m.length - 4)}${m.slice(-4)}`);
}

/** Sends the OTP SMS. phone must be +91XXXXXXXXXX. Throws a generic error on failure. */
export async function sendPearlOtp(phone: string, otp: string) {
  const apiKey = process.env.PEARLSMS_API_KEY;
  const sender = process.env.PEARLSMS_SENDER_ID;
  if (!apiKey || !sender) throw new Error("Pearl SMS is not configured");

  const numbers = phone.replace(/^\+91/, "");
  const body = new URLSearchParams({
    sender,
    smstype: "TRANS",
    numbers,
    unicode: "no",
    apikey: apiKey,
    message: OTP_TEMPLATE.replace("{#var#}", otp),
  });

  let status = 0;
  let text = "";
  try {
    const res = await fetch(PEARL_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    text = await res.text().catch(() => "");
  } catch (e: any) {
    console.error(`[pearl-sms] request failed for ${maskPhone(phone)}: ${e?.name ?? "error"}`);
    throw new Error("Failed to send verification code. Please try again.");
  }

  const parsed = parsePearlResponse(status, text);
  console.info(
    `[pearl-sms] ${maskPhone(phone)} status=${status} result=${parsed.ok ? "ok" : parsed.reason} body=${redact(text, [apiKey, otp, numbers])}`,
  );
  if (!parsed.ok) throw new Error("Failed to send verification code. Please try again.");
}
