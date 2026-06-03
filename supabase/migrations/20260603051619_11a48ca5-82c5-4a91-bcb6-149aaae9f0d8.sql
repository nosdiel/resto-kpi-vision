-- Add catering column to weekly_pnl table
ALTER TABLE public.weekly_pnl
ADD COLUMN IF NOT EXISTS catering numeric DEFAULT 0;