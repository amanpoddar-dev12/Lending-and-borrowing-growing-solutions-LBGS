import { useEffect } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type SmsCredential = Credential & { code?: string };
type SmsCredentialOptions = CredentialRequestOptions & { otp: { transport: ["sms"] } };

export function VerificationCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  useEffect(() => {
    if (disabled || !window.isSecureContext || !("OTPCredential" in window) || !navigator.credentials) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    const options: SmsCredentialOptions = {
      otp: { transport: ["sms"] },
      signal: controller.signal,
    };

    // Optional browser enhancement only: never submits or verifies the code.
    void navigator.credentials.get(options).then((credential) => {
      const smsCode = (credential as SmsCredential | null)?.code;
      if (!controller.signal.aborted && smsCode && /^\d{6}$/.test(smsCode)) {
        onChange(smsCode);
      }
    }).catch(() => {
      // Unsupported SMS formats, denied consent, and timeouts leave manual entry available.
    });

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [disabled, onChange]);

  return (
    <InputOTP
      id="code"
      name="code"
      aria-label="Verification code"
      maxLength={6}
      minLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      required
      disabled={disabled}
      value={value}
      onChange={onChange}
      containerClassName="w-full justify-center"
    >
      <InputOTPGroup className="grid w-full max-w-sm grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className="h-14 w-full rounded-md border border-input bg-background text-xl font-semibold tabular-nums first:rounded-md last:rounded-md"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}