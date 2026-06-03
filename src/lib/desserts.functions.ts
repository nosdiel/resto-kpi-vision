import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listDesserts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dessert_items")
      .select("id, name, location_id, active_from, active_to, square_item_id, created_at")
      .order("active_from", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertDessert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    locationId: z.string().uuid().nullable().optional(),
    activeFrom: dateStr.nullable().optional(),
    activeTo: dateStr.nullable().optional(),
    squareItemId: z.string().max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      location_id: data.locationId ?? null,
      active_from: data.activeFrom ?? null,
      active_to: data.activeTo ?? null,
      square_item_id: data.squareItemId ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("dessert_items").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("dessert_items").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteDessert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("dessert_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDessertOfMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().min(1).max(120),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    locationIds: z.array(z.string().uuid()),
    squareItemId: z.string().max(120).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const [year, monthNum] = data.month.split("-").map(Number);
    const from = `${data.month}-01`;
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const to = `${data.month}-${String(lastDay).padStart(2, "0")}`;
    const targets = data.locationIds.length ? data.locationIds : [null];
    const rows = targets.map((lid) => ({
      name: data.name,
      location_id: lid,
      active_from: from,
      active_to: to,
      square_item_id: data.squareItemId ?? null,
    }));
    const { error } = await context.supabase.from("dessert_items").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });