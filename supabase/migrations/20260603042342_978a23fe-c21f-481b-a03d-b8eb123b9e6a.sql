
-- Vendor templates (Food Purchases / Paper Supplies lines)
CREATE TABLE public.pnl_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('food_purchases','paper_supplies')),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pnl_vendors_loc ON public.pnl_vendors(location_id, section, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnl_vendors TO authenticated;
GRANT ALL ON public.pnl_vendors TO service_role;

ALTER TABLE public.pnl_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pnl_vendors: read by access" ON public.pnl_vendors
  FOR SELECT TO authenticated
  USING (public.can_access_location(auth.uid(), location_id));

CREATE POLICY "pnl_vendors: write by access" ON public.pnl_vendors
  FOR ALL TO authenticated
  USING (public.can_access_location(auth.uid(), location_id))
  WITH CHECK (public.can_access_location(auth.uid(), location_id));

-- Weekly PNL entries (one row per location/fiscal_year/fiscal_week)
CREATE TABLE public.weekly_pnl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  fiscal_week integer NOT NULL CHECK (fiscal_week BETWEEN 1 AND 53),
  wages numeric NOT NULL DEFAULT 0,
  beer_wine_cost numeric NOT NULL DEFAULT 0,
  repairs numeric NOT NULL DEFAULT 0,
  vendor_amounts jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, fiscal_year, fiscal_week)
);
CREATE INDEX idx_weekly_pnl_loc_year ON public.weekly_pnl(location_id, fiscal_year, fiscal_week);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_pnl TO authenticated;
GRANT ALL ON public.weekly_pnl TO service_role;

ALTER TABLE public.weekly_pnl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_pnl: read by access" ON public.weekly_pnl
  FOR SELECT TO authenticated
  USING (public.can_access_location(auth.uid(), location_id));

CREATE POLICY "weekly_pnl: write by access" ON public.weekly_pnl
  FOR ALL TO authenticated
  USING (public.can_access_location(auth.uid(), location_id))
  WITH CHECK (public.can_access_location(auth.uid(), location_id));

CREATE TRIGGER trg_weekly_pnl_updated
BEFORE UPDATE ON public.weekly_pnl
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default vendors from the reference image for every existing location
INSERT INTO public.pnl_vendors (location_id, section, name, sort_order)
SELECT l.id, v.section, v.name, v.sort_order
FROM public.locations l
CROSS JOIN (VALUES
  ('food_purchases','Fonteroche',1),
  ('food_purchases','All Coffee',2),
  ('food_purchases','Vicky Enterprice',3),
  ('food_purchases','La Latina (Tequenos)',4),
  ('food_purchases','Oranges',5),
  ('food_purchases','Sysco',6),
  ('food_purchases','El Pidio NT',7),
  ('food_purchases','joy''s kitchen',8),
  ('food_purchases','cortes',9),
  ('food_purchases','Vegetable Oil',10),
  ('food_purchases','imagic',11),
  ('food_purchases','The Café Group',12),
  ('food_purchases','dulce de leche',13),
  ('food_purchases','misc',14),
  ('paper_supplies','All Florida Paper',1),
  ('paper_supplies','Dade Paper',2)
) AS v(section, name, sort_order);
