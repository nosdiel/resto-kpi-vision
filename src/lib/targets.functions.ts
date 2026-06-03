import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    fiscalYear: z.number().int(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("weekly_targets")
      .select("*")
      .eq("location_id", data.locationId)
      .eq("fiscal_year", data.fiscalYear)
      .order("fiscal_week");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    fiscalYear: z.number().int(),
    fiscalWeek: z.number().int().min(1).max(53),
    targetPctOverLy: z.number(),
    avgTicketGoal: z.number().nullable().optional(),
    notes: z.string().max(500).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("weekly_targets")
      .upsert({
        location_id: data.locationId,
        fiscal_year: data.fiscalYear,
        fiscal_week: data.fiscalWeek,
        target_pct_over_ly: data.targetPctOverLy,
        avg_ticket_goal: data.avgTicketGoal ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      }, { onConflict: "location_id,fiscal_year,fiscal_week" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const copyTargetsFromPriorWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    fiscalYear: z.number().int(),
    fromWeek: z.number().int(),
    toWeek: z.number().int(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src } = await context.supabase
      .from("weekly_targets").select("*")
      .eq("location_id", data.locationId).eq("fiscal_year", data.fiscalYear).eq("fiscal_week", data.fromWeek).maybeSingle();
    if (!src) throw new Error(`No target found for week ${data.fromWeek}`);
    const { error } = await context.supabase.from("weekly_targets").upsert({
      location_id: data.locationId,
      fiscal_year: data.fiscalYear,
      fiscal_week: data.toWeek,
      target_pct_over_ly: src.target_pct_over_ly,
      avg_ticket_goal: src.avg_ticket_goal,
      notes: src.notes,
      created_by: context.userId,
    }, { onConflict: "location_id,fiscal_year,fiscal_week" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });