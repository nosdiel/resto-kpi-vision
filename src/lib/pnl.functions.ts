import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultFyStart, weekDates } from "./fiscal";

export const getPnlWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid().nullable().optional(),
      fiscalYear: z.number().int().min(2000).max(2100),
      fiscalWeek: z.number().int().min(1).max(53),
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
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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

    const locationId = data.locationId || locations?.[0]?.id || null;
    if (!locationId) {
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
        .select("id, name, section")
        .eq("location_id", locationId)
        .eq("active", true),
      supabase
        .from("daily_sales")
        .select("business_date, actual_sales, last_year_sales, last_year_customer_count")
        .eq("location_id", locationId)
        .in("business_date", [...allDates, ...prevDates]),
      supabase
        .from("weekly_pnl")
        .select("fiscal_week, wages, beer_wine_cost, catering, vendor_amounts")
        .eq("location_id", locationId)
        .eq("fiscal_year", data.fiscalYear)
        .gte("fiscal_week", startWeek)
        .lte("fiscal_week", endWeek),
      supabase
        .from("weekly_targets")
        .select("fiscal_week, target_pct_over_ly")
        .eq("location_id", locationId)
        .eq("fiscal_year", data.fiscalYear)
        .gte("fiscal_week", startWeek)
        .lte("fiscal_week", endWeek),
    ]);
    if (vErr) throw new Error(vErr.message);
    if (sErr) throw new Error(sErr.message);
    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);

    const foodVendorIds = new Set(
      (vendors ?? []).filter((v) => v.section === "food_purchases").map((v) => v.id),
    );
    const paperVendorIds = new Set(
      (vendors ?? []).filter((v) => v.section === "paper_supplies").map((v) => v.id),
    );

    const salesByDate = new Map<string, { actual: number; ly: number; lyCust: number }>();
    for (const s of sales ?? []) {
      salesByDate.set(s.business_date, {
        actual: Number(s.actual_sales) || 0,
        ly: Number(s.last_year_sales) || 0,
        lyCust: Number(s.last_year_customer_count) || 0,
      });
    }
    const pnlByWeek = new Map<number, { wages: number; beer: number; catering: number; vendors: Record<string, number> }>();
    for (const p of pnls ?? []) {
      pnlByWeek.set(p.fiscal_week, {
        wages: Number(p.wages) || 0,
        beer: Number(p.beer_wine_cost) || 0,
        catering: Number(p.catering) || 0,
        vendors: (p.vendor_amounts ?? {}) as Record<string, number>,
      });
    }
    const targetByWeek = new Map<number, number>();
    for (const t of targets ?? []) {
      targetByWeek.set(t.fiscal_week, Number(t.target_pct_over_ly) || 0);
    }

    const rows = weeks.map((w) => {
      const dates = weekDateMap.get(w) ?? [];
      let actualSales = 0;
      let lySales = 0;
      for (const d of dates) {
        const s = salesByDate.get(d);
        if (s) { actualSales += s.actual; lySales += s.ly; }
        // Fallback: if both LY sales and LY customers are 0, use prior-week actuals (matches Daily Sales)
        const useFallback = !s || (s.ly === 0 && s.lyCust === 0);
        if (useFallback) {
          const prev = new Date(d + "T00:00:00Z");
          prev.setUTCDate(prev.getUTCDate() - 7);
          const pk = prev.toISOString().slice(0, 10);
          const p = salesByDate.get(pk);
          if (p) lySales += p.actual - (s?.ly ?? 0);
        }
      }
      const pctOverLy = targetByWeek.get(w) ?? 0;
      const salesGoal = lySales * (1 + pctOverLy / 100);
      const pnl = pnlByWeek.get(w);
      const wages = pnl?.wages ?? 0;
      const beer = pnl?.beer ?? 0;
      const cateringActual = pnl?.catering ?? 0;
      const vendorAmts = pnl?.vendors ?? {};

      let foodActualOther = 0;
      let paperActual = 0;
      for (const [vid, amt] of Object.entries(vendorAmts)) {
        const a = Number(amt) || 0;
        if (foodVendorIds.has(vid)) foodActualOther += a;
        else if (paperVendorIds.has(vid)) paperActual += a;
      }
      const foodActual = foodActualOther;

      return {
        week: w,
        period: periodMap[w],
        sales: { goal: salesGoal, actual: actualSales },
        payroll: { goal: salesGoal * CATEGORY_PCTS.payroll, actual: wages },
        food: { goal: salesGoal * CATEGORY_PCTS.food, actual: foodActual },
        catering: { goal: salesGoal * CATEGORY_PCTS.catering, actual: cateringActual },
        paper: { goal: actualSales * 0.035, actual: paperActual },
      };
    });

    return {
      locations: locations ?? [],
      locationId,
      quarter: data.quarter,
      startWeek,
      endWeek,
      rows,
    };
  });