CREATE TABLE IF NOT EXISTS public.phone_otps (
  phone text PRIMARY KEY,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.phone_otp_sends (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  ip text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otp_sends_phone_idx ON public.phone_otp_sends (phone, sent_at DESC);
CREATE INDEX IF NOT EXISTS phone_otp_sends_ip_idx ON public.phone_otp_sends (ip, sent_at DESC);

REVOKE ALL ON public.phone_otps FROM anon, authenticated;
REVOKE ALL ON public.phone_otp_sends FROM anon, authenticated;
GRANT ALL ON public.phone_otps TO service_role;
GRANT ALL ON public.phone_otp_sends TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.phone_otp_sends_id_seq TO service_role;

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_otp_sends ENABLE ROW LEVEL SECURITY;