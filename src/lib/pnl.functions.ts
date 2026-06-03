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
      .select("id, name, active")
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
    const pnl = pnlRows as { wages?: number; beer_wine_cost?: number; repairs?: number; vendor_amounts?: Record<string, number>; notes?: string | null } | null;
    const week = {
      fiscalWeek: data.fiscalWeek,
      weekStart: dates[0],
      weekEnd: dates[6],
      totalSales,
      wages: Number(pnl?.wages ?? 0),
      beerWineCost: Number(pnl?.beer_wine_cost ?? 0),
      repairs: Number(pnl?.repairs ?? 0),
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