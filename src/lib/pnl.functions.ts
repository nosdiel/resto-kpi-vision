import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { defaultFyStart, weekDates } from "./fiscal";

async function getAuthenticatedSupabase() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { createClient } = await import("@supabase/supabase-js");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing backend configuration");
  }

  const authHeader = getRequest().headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw new Error("Please sign in again to load this report.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new Error("Please sign in again to load this report.");

  return { supabase, userId: data.claims.sub, claims: data.claims };
}

export const getPnlWeek = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid().nullable().optional(),
      fiscalYear: z.number().int().min(2000).max(2100),
      fiscalWeek: z.number().int().min(1).max(53),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase } = await getAuthenticatedSupabase();

    const { data: locations, error: locErr } = await supabase
      .from("locations")
      .select("id, name, active, region")
      .eq("active", true)
      .order("name");
    if (locErr) throw new Error(locErr.message);

    const locationId = data.locationId || locations?.[0]?.id || null;
    if (!locationId) {
      return { locations: locations ?? [], locationId: null, vendors: [], week: null };
    }

    const { data: fy } = await supabase
      .from("fiscal_year_settings")
      .select("start_date")
      .eq("fiscal_year", data.fiscalYear)
      .maybeSingle();
    const fyStart = fy?.start_date ?? defaultFyStart(data.fiscalYear);

    const dates = weekDates(fyStart, data.fiscalWeek);

    const [{ data: vendors, error: vErr }, { data: sales, error: sErr }, { data: pnlRows, error: pErr }] = await Promise.all([
      supabase
        .from("pnl_vendors")
        .select("*")
        .eq("location_id", locationId)
        .eq("active", true)
        .order("section")
        .order("sort_order"),
      supabase
        .from("daily_sales")
        .select("business_date, actual_sales")
        .eq("location_id", locationId)
        .in("business_date", dates),
      supabase
        .from("weekly_pnl")
        .select("*")
        .eq("location_id", locationId)
        .eq("fiscal_year", data.fiscalYear)
        .eq("fiscal_week", data.fiscalWeek)
        .maybeSingle(),
    ]);
    if (vErr) throw new Error(vErr.message);
    if (sErr) throw new Error(sErr.message);
    if (pErr) throw new Error(pErr.message);

    const salesByDate = new Map((sales ?? []).map((s) => [s.business_date, Number(s.actual_sales) || 0]));
    const totalSales = dates.reduce((acc, d) => acc + (salesByDate.get(d) ?? 0), 0);
    const pnl = pnlRows as { wages?: number; beer_wine_cost?: number; repairs?: number; catering?: number; vendor_amounts?: Record<string, number>; notes?: string | null } | null;
    const week = {
      fiscalWeek: data.fiscalWeek,
      weekStart: dates[0],
      weekEnd: dates[6],
      totalSales,
      wages: Number(pnl?.wages ?? 0),
      beerWineCost: Number(pnl?.beer_wine_cost ?? 0),
      repairs: Number(pnl?.repairs ?? 0),
      catering: Number(pnl?.catering ?? 0),
      vendorAmounts: (pnl?.vendor_amounts ?? {}) as Record<string, number>,
      notes: pnl?.notes ?? null,
      hasEntry: !!pnl,
    };

    return {
      locations: locations ?? [],
      locationId,
      fyStart,
      vendors: vendors ?? [],
      week,
    };
  });

/* ---------- Mutations ---------- */

export const upsertWeeklyPnl = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid(),
      fiscalYear: z.number().int().min(2000).max(2100),
      fiscalWeek: z.number().int().min(1).max(53),
      wages: z.number().min(0).default(0),
      beerWineCost: z.number().min(0).default(0),
      repairs: z.number().min(0).default(0),
      catering: z.number().min(0).default(0),
      vendorAmounts: z.record(z.string().uuid(), z.number().min(0)),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabase, userId } = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from("weekly_pnl")
      .upsert(
        {
          location_id: data.locationId,
          fiscal_year: data.fiscalYear,
          fiscal_week: data.fiscalWeek,
          wages: data.wages,
          beer_wine_cost: data.beerWineCost,
          repairs: data.repairs,
          catering: data.catering,
          vendor_amounts: data.vendorAmounts,
          notes: data.notes ?? null,
          updated_by: userId,
        },
        { onConflict: "location_id,fiscal_year,fiscal_week" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPnlVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid(),
      section: z.enum(["food_purchases", "paper_supplies"]),
      name: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: maxRow } = await supabase
      .from("pnl_vendors")
      .select("sort_order")
      .eq("location_id", data.locationId)
      .eq("section", data.section)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("pnl_vendors").insert({
      location_id: data.locationId,
      section: data.section,
      name: data.name,
      sort_order: nextOrder,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePnlVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ vendorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pnl_vendors")
      .update({ active: false })
      .eq("id", data.vendorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renamePnlVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      vendorId: z.string().uuid(),
      name: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pnl_vendors")
      .update({ name: data.name })
      .eq("id", data.vendorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Quarter Report ---------- */

const CATEGORY_PCTS = {
  payroll: 0.20,
  food: 0.32,
  catering: 0.03,
  paper: 0.03,
} as const;


export const getQtrReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid().nullable().optional(),
      locationIds: z.array(z.string().uuid()).optional(),
      fiscalYear: z.number().int().min(2000).max(2100),
      quarter: z.number().int().min(1).max(4),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: locations, error: locErr } = await supabase
      .from("locations")
      .select("id, name, active, region")
      .eq("active", true)
      .order("name");
    if (locErr) throw new Error(locErr.message);

    const locationIds: string[] = (data.locationIds && data.locationIds.length > 0)
      ? data.locationIds
      : (data.locationId ? [data.locationId] : (locations?.[0]?.id ? [locations[0].id] : []));
    const locationId = locationIds[0] ?? null;
    if (locationIds.length === 0) {
      return { locations: locations ?? [], locationId: null, rows: [], periods: [] };
    }

    const { data: fy } = await supabase
      .from("fiscal_year_settings")
      .select("start_date")
      .eq("fiscal_year", data.fiscalYear)
      .maybeSingle();
    const fyStart = fy?.start_date ?? defaultFyStart(data.fiscalYear);

    // 4-4-5 quarter: 13 weeks per quarter
    const startWeek = (data.quarter - 1) * 13 + 1;
    const endWeek = startWeek + 12;
    const weeks: number[] = [];
    for (let w = startWeek; w <= endWeek; w++) weeks.push(w);

    // Period labels (Q/T/D = period 1/2/3 within the quarter): 4,4,5
    const periodMap: Record<number, "Q" | "T" | "D"> = {};
    weeks.forEach((w, i) => {
      periodMap[w] = i < 4 ? "Q" : i < 8 ? "T" : "D";
    });

    const allDates: string[] = [];
    const weekDateMap = new Map<number, string[]>();
    for (const w of weeks) {
      const ds = weekDates(fyStart, w);
      weekDateMap.set(w, ds);
      allDates.push(...ds);
    }

    // Prior-week dates (LY fallback, matches Daily Sales behavior)
    const prevDates = allDates.map((d) => {
      const dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() - 7);
      return dt.toISOString().slice(0, 10);
    });

    const [
      { data: vendors, error: vErr },
      { data: sales, error: sErr },
      { data: pnls, error: pErr },
      { data: targets, error: tErr },
    ] = await Promise.all([
      supabase
        .from("pnl_vendors")
        .select("id, name, section, location_id")
        .in("location_id", locationIds)
        .eq("active", true),
      supabase
        .from("daily_sales")
        .select("location_id, business_date, actual_sales, last_year_sales, last_year_customer_count")
        .in("location_id", locationIds)
        .in("business_date", [...allDates, ...prevDates]),
      supabase
        .from("weekly_pnl")
        .select("location_id, fiscal_week, wages, beer_wine_cost, catering, vendor_amounts")
        .in("location_id", locationIds)
        .eq("fiscal_year", data.fiscalYear)
        .gte("fiscal_week", startWeek)
        .lte("fiscal_week", endWeek),
      supabase
        .from("weekly_targets")
        .select("location_id, fiscal_week, target_pct_over_ly")
        .in("location_id", locationIds)
        .eq("fiscal_year", data.fiscalYear)
        .gte("fiscal_week", startWeek)
        .lte("fiscal_week", endWeek),
    ]);
    if (vErr) throw new Error(vErr.message);
    if (sErr) throw new Error(sErr.message);
    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);

    const vendorsByLoc = new Map<string, { id: string; section: string }[]>();
    for (const v of vendors ?? []) {
      const arr = vendorsByLoc.get(v.location_id) ?? [];
      arr.push({ id: v.id, section: v.section });
      vendorsByLoc.set(v.location_id, arr);
    }
    const salesByLocDate = new Map<string, Map<string, { actual: number; ly: number; lyCust: number }>>();
    for (const s of sales ?? []) {
      let m = salesByLocDate.get(s.location_id);
      if (!m) { m = new Map(); salesByLocDate.set(s.location_id, m); }
      m.set(s.business_date, {
        actual: Number(s.actual_sales) || 0,
        ly: Number(s.last_year_sales) || 0,
        lyCust: Number(s.last_year_customer_count) || 0,
      });
    }
    const pnlByLocWeek = new Map<string, Map<number, { wages: number; beer: number; catering: number; vendors: Record<string, number> }>>();
    for (const p of pnls ?? []) {
      let m = pnlByLocWeek.get(p.location_id);
      if (!m) { m = new Map(); pnlByLocWeek.set(p.location_id, m); }
      m.set(p.fiscal_week, {
        wages: Number(p.wages) || 0,
        beer: Number(p.beer_wine_cost) || 0,
        catering: Number(p.catering) || 0,
        vendors: (p.vendor_amounts ?? {}) as Record<string, number>,
      });
    }
    const targetByLocWeek = new Map<string, Map<number, number>>();
    for (const t of targets ?? []) {
      let m = targetByLocWeek.get(t.location_id);
      if (!m) { m = new Map(); targetByLocWeek.set(t.location_id, m); }
      m.set(t.fiscal_week, Number(t.target_pct_over_ly) || 0);
    }

    const rows = weeks.map((w) => {
      const dates = weekDateMap.get(w) ?? [];
      let actualSales = 0;
      let salesGoal = 0;
      let wagesTotal = 0;
      let foodActual = 0;
      let paperActual = 0;
      let cateringActual = 0;

      for (const lid of locationIds) {
        const salesMap = salesByLocDate.get(lid);
        let locActual = 0;
        let locLy = 0;
        for (const d of dates) {
          const s = salesMap?.get(d);
          if (s) { locActual += s.actual; locLy += s.ly; }
          const useFallback = !s || (s.ly === 0 && s.lyCust === 0);
          if (useFallback) {
            const prev = new Date(d + "T00:00:00Z");
            prev.setUTCDate(prev.getUTCDate() - 7);
            const pk = prev.toISOString().slice(0, 10);
            const p = salesMap?.get(pk);
            if (p) locLy += p.actual - (s?.ly ?? 0);
          }
        }
        const pctOverLy = targetByLocWeek.get(lid)?.get(w) ?? 0;
        salesGoal += locLy * (1 + pctOverLy / 100);
        actualSales += locActual;

        const pnl = pnlByLocWeek.get(lid)?.get(w);
        wagesTotal += pnl?.wages ?? 0;
        cateringActual += pnl?.catering ?? 0;

        const locVendors = vendorsByLoc.get(lid) ?? [];
        const foodIds = new Set(locVendors.filter((v) => v.section === "food_purchases").map((v) => v.id));
        const paperIds = new Set(locVendors.filter((v) => v.section === "paper_supplies").map((v) => v.id));
        const vendorAmts = pnl?.vendors ?? {};
        for (const [vid, amt] of Object.entries(vendorAmts)) {
          const a = Number(amt) || 0;
          if (foodIds.has(vid)) foodActual += a;
          else if (paperIds.has(vid)) paperActual += a;
        }
      }

      return {
        week: w,
        period: periodMap[w],
        sales: { goal: salesGoal, actual: actualSales },
        payroll: { goal: salesGoal * CATEGORY_PCTS.payroll, actual: wagesTotal },
        food: { goal: salesGoal * CATEGORY_PCTS.food, actual: foodActual },
        catering: { goal: salesGoal * CATEGORY_PCTS.catering, actual: cateringActual },
        paper: { goal: actualSales * 0.035, actual: paperActual },
      };
    });

    return {
      locations: locations ?? [],
      locationId,
      locationIds,
      quarter: data.quarter,
      startWeek,
      endWeek,
      rows,
    };
  });