
CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_perms: any auth read"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "role_perms: super admin write"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed defaults
-- super_admin: all permissions (implicit via app code, but record for completeness)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('super_admin','dashboard'),
  ('super_admin','pnl'),
  ('super_admin','targets'),
  ('super_admin','locations'),
  ('super_admin','desserts'),
  ('super_admin','square'),
  ('super_admin','toast'),
  ('super_admin','users'),
  ('super_admin','permissions'),
  ('admin','dashboard'),
  ('admin','pnl'),
  ('admin','targets'),
  ('admin','locations'),
  ('admin','desserts'),
  ('admin','square'),
  ('admin','toast'),
  ('admin','users'),
  ('regional_manager','dashboard'),
  ('regional_manager','pnl'),
  ('regional_manager','targets'),
  ('regional_manager','locations'),
  ('regional_manager','desserts'),
  ('store_manager','dashboard'),
  ('store_manager','pnl'),
  ('store_manager','targets'),
  ('store_manager','desserts');
