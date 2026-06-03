CREATE TABLE public.toast_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL UNIQUE,
  toast_restaurant_guid text NOT NULL,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','sandbox')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.toast_connections TO authenticated;
GRANT ALL ON public.toast_connections TO service_role;

ALTER TABLE public.toast_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "toast: admin only"
ON public.toast_connections
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER toast_connections_touch_updated
BEFORE UPDATE ON public.toast_connections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Extend daily_sales source enum to include 'toast'
ALTER TYPE public.sales_source ADD VALUE IF NOT EXISTS 'toast';