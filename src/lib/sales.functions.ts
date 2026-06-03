import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const overrideSchema = z.object({
  locationId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualSales: z.number().min(0),
  actualCustomerCount: z.number().int().min(0),
  lastYearSales: z.number().min(0).optional(),
  lastYearCustomerCount: z.number().int().min(0).optional(),
  dessertCount: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
});

export const upsertDailySales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch existing
    const { data: existing } = await supabase
      .from("daily_sales").select("*")
      .eq("location_id", data.locationId).eq("business_date", data.businessDate).maybeSingle();

    const isOverride = existing && existing.source === "square";
    const payload: Record<string, unknown> = {
      location_id: data.locationId,
      business_date: data.businessDate,
      actual_sales: data.actualSales,
      actual_customer_count: data.actualCustomerCount,
      source: existing?.source ?? "manual",
    };
    if (data.lastYearSales !== undefined) payload.last_year_sales = data.lastYearSales;
    if (data.lastYearCustomerCount !== undefined) payload.last_year_customer_count = data.lastYearCustomerCount;
    if (data.dessertCount !== undefined) payload.dessert_count = data.dessertCount;

    if (isOverride) {
      payload.original_actual_sales = existing.original_actual_sales ?? existing.actual_sales;
      payload.original_actual_customer_count = existing.original_actual_customer_count ?? existing.actual_customer_count;
      payload.override_note = data.note ?? null;
      payload.overridden_by = userId;
      payload.overridden_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("daily_sales")
      .upsert(payload, { onConflict: "location_id,business_date" });
    if (error) throw new Error(error.message);

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: userId,
      action: existing ? "update" : "insert",
      entity: "daily_sales",
      entity_id: `${data.locationId}:${data.businessDate}`,
      before: existing ?? null,
      after: payload,
    });
    return { ok: true };
  });