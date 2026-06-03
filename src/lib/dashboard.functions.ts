import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultFyStart, weekDates } from "./fiscal";

const inputSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  fiscalYear: z.number().int().min(2000).max(2100),
  fiscalWeek: z.number().int().min(1).max(53),
});

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1. Locations the user can see
    const { data: locations, error: locErr } = await supabase
      .from("locations")
      .select("id, name, region, timezone, active")
      .eq("active", true)
      .order("name");
    if (locErr) throw new Error(locErr.message);

    const locationId = data.locationId || locations?.[0]?.id || null;
    if (!locationId) {
      return { locations: locations ?? [], locationId: null, fyStart: defaultFyStart(data.fiscalYear), days: [], target: null };
    }

    // 2. Fiscal year settings
    const { data: fy } = await supabase
      .from("fiscal_year_settings")
      .select("start_date")
      .eq("fiscal_year", data.fiscalYear)
      .maybeSingle();
    const fyStart = fy?.start_date ?? defaultFyStart(data.fiscalYear);

    const dates = weekDates(fyStart, data.fiscalWeek);

    // Previous week dates (fallback when LY data is missing, e.g. new stores)
    const prevDates = dates.map((d) => {
      const dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() - 7);
      return dt.toISOString().slice(0, 10);
    });

    // 3. Daily sales for those 7 dates + prior week
    const { data: sales, error: salesErr } = await supabase
      .from("daily_sales")
      .select("*")
      .eq("location_id", locationId)
      .in("business_date", [...dates, ...prevDates]);
    if (salesErr) throw new Error(salesErr.message);

    // 4. Target for this week
    const { data: target } = await supabase
      .from("weekly_targets")
      .select("*")
      .eq("location_id", locationId)
      .eq("fiscal_year", data.fiscalYear)
      .eq("fiscal_week", data.fiscalWeek)
      .maybeSingle();

    // 5. Build day-rows in order
    const salesByDate = new Map((sales ?? []).map((s) => [s.business_date, s]));
    const days = dates.map((d, i) => {
      const row = salesByDate.get(d);
      const prev = salesByDate.get(prevDates[i]);
      const lySales = Number(row?.last_year_sales ?? 0);
      const lyCust = row?.last_year_customer_count ?? 0;
      const useFallback = lySales === 0 && lyCust === 0;
      return {
        business_date: d,
        actual_sales: Number(row?.actual_sales ?? 0),
        actual_customer_count: row?.actual_customer_count ?? 0,
        last_year_sales: useFallback ? Number(prev?.actual_sales ?? 0) : lySales,
        last_year_customer_count: useFallback ? (prev?.actual_customer_count ?? 0) : lyCust,
        last_year_fallback: useFallback && !!prev,
        dessert_count: row?.dessert_count ?? 0,
        source: row?.source ?? "manual",
        has_override: !!row?.overridden_at,
      };
    });

    return {
      locations: locations ?? [],
      locationId,
      fyStart,
      days,
      target: target ?? null,
    };
  });