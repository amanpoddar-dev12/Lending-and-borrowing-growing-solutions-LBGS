-- Payslip: add LIC / Bike / Mobile recharge deductions and Best Salesman Reward (BSR).
-- Purely additive: existing payslips keep working, new columns default to 0.

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS lic_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bike_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobile_recharge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bsr_amount numeric NOT NULL DEFAULT 0;
