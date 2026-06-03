CREATE TABLE public.vendor_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_contacts TO authenticated;
GRANT ALL ON public.vendor_contacts TO service_role;

ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_contacts: read by access"
  ON public.vendor_contacts FOR SELECT TO authenticated
  USING (public.can_access_location(auth.uid(), location_id));

CREATE POLICY "vendor_contacts: write by access"
  ON public.vendor_contacts FOR ALL TO authenticated
  USING (public.can_access_location(auth.uid(), location_id))
  WITH CHECK (public.can_access_location(auth.uid(), location_id));

CREATE TRIGGER trg_vendor_contacts_updated_at
  BEFORE UPDATE ON public.vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_vendor_contacts_location ON public.vendor_contacts(location_id);

-- Add 'who_to_call' permission for store_manager and regional_manager by default
INSERT INTO public.role_permissions (role, permission) VALUES
  ('store_manager', 'who_to_call'),
  ('regional_manager', 'who_to_call'),
  ('admin', 'who_to_call')
ON CONFLICT DO NOTHING;