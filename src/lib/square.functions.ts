import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Square OAuth + sync is scaffolded. Manual setup is supported now:
 * admins can paste a Square access token + location id per dashboard
 * location. The "Sync Now" handler will hit the Square API and pull
 * the last N days of sales.
 */

export const saveSquareConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    squareLocationId: z.string().min(1).max(64),
    accessToken: z.string().min(10).max(2000),
    merchantId: z.string().max(64).optional().nullable(),
    environment: z.enum(["production", "sandbox"]).default("production"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("square_connections")
      .upsert({
        location_id: data.locationId,
        square_location_id: data.squareLocationId,
        access_token: data.accessToken,
        merchant_id: data.merchantId ?? null,
        environment: data.environment,
        created_by: context.userId,
      }, { onConflict: "location_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSquareConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("square_connections")
      .select("id, location_id, square_location_id, merchant_id, environment, created_at, updated_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const syncSquareLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Fetch connection (admin client to read tokens)
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("square_connections").select("*").eq("location_id", data.locationId).maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("No Square connection configured for this location.");

    const env = (conn as { environment?: string }).environment ?? process.env.SQUARE_ENV ?? "production";
    const base = env === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";

    // Search orders for the location across the date range. (One request, paginated.)
    const beginIso = new Date(`${data.startDate}T00:00:00Z`).toISOString();
    const endIso = new Date(`${data.endDate}T23:59:59Z`).toISOString();
    let cursor: string | undefined = undefined;
    const ordersByDate: Record<string, { sales: number; count: number }> = {};

    do {
      const res = await fetch(`${base}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Square-Version": "2024-10-17",
          Authorization: `Bearer ${conn.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_ids: [conn.square_location_id],
          cursor,
          query: {
            filter: {
              date_time_filter: { closed_at: { start_at: beginIso, end_at: endIso } },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Square API error ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as { orders?: Array<{ closed_at?: string; total_money?: { amount?: number } }>; cursor?: string };
      for (const o of json.orders ?? []) {
        if (!o.closed_at) continue;
        const date = o.closed_at.slice(0, 10);
        const sales = (o.total_money?.amount ?? 0) / 100;
        if (!ordersByDate[date]) ordersByDate[date] = { sales: 0, count: 0 };
        ordersByDate[date].sales += sales;
        ordersByDate[date].count += 1;
      }
      cursor = json.cursor;
    } while (cursor);

    // Upsert daily_sales
    const rows = Object.entries(ordersByDate).map(([date, agg]) => ({
      location_id: data.locationId,
      business_date: date,
      actual_sales: Number(agg.sales.toFixed(2)),
      actual_customer_count: agg.count,
      source: "square" as const,
      last_synced_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("daily_sales").upsert(rows, { onConflict: "location_id,business_date" });
      if (error) throw new Error(error.message);
    }
    return { ok: true, daysSynced: rows.length };
  });