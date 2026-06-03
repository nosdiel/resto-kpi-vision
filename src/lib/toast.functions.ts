import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Toast (Toast Tab / Toast POS) integration. Admins enter Toast API
 * client credentials + the restaurant GUID per dashboard location.
 * Sync pulls orders via the Toast Orders API for the date range.
 */

export const saveToastConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid(),
      toastRestaurantGuid: z.string().min(1).max(64),
      clientId: z.string().min(1).max(128),
      clientSecret: z.string().min(1).max(2000),
      environment: z.enum(["production", "sandbox"]).default("production"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("toast_connections")
      .upsert(
        {
          location_id: data.locationId,
          toast_restaurant_guid: data.toastRestaurantGuid,
          client_id: data.clientId,
          client_secret: data.clientSecret,
          environment: data.environment,
          created_by: context.userId,
        },
        { onConflict: "location_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listToastConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("toast_connections")
      .select("id, location_id, toast_restaurant_guid, client_id, environment, created_at, updated_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const syncToastLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      locationId: z.string().uuid(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => runToastSync(data.locationId, data.startDate, data.endDate));

export const backfillToastFiscalPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ locationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fy, error: fyErr } = await supabaseAdmin
      .from("fiscal_year_settings")
      .select("start_date")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fyErr) throw new Error(fyErr.message);
    const today = new Date().toISOString().slice(0, 10);
    const start = fy?.start_date ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    return runToastSync(data.locationId, start, today);
  });

async function runToastSync(locationId: string, startDate: string, endDate: string) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("toast_connections").select("*").eq("location_id", locationId).maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("No Toast connection configured for this location.");

    const base =
      conn.environment === "sandbox"
        ? "https://ws-sandbox-api.eng.toasttab.com"
        : "https://ws-api.toasttab.com";

    // 1. Auth: client_credentials -> access token
    const tokenRes = await fetch(`${base}/authentication/v1/authentication/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: conn.client_id,
        clientSecret: conn.client_secret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Toast auth error ${tokenRes.status}: ${text.slice(0, 300)}`);
    }
    const tokenJson = (await tokenRes.json()) as { token?: { accessToken?: string } };
    const accessToken = tokenJson.token?.accessToken;
    if (!accessToken) throw new Error("Toast auth: no access token returned");

    // 2. Pull orders day-by-day (Toast ordersBulk caps at one businessDate)
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const ordersByDate: Record<string, { sales: number; count: number }> = {};

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, "");
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const url = `${base}/orders/v2/ordersBulk?businessDate=${yyyymmdd}&page=${page}&pageSize=100`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Toast-Restaurant-External-ID": conn.toast_restaurant_guid,
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Toast API error ${res.status}: ${text.slice(0, 300)}`);
        }
        const orders = (await res.json()) as Array<{
          businessDate?: number;
          voided?: boolean;
          checks?: Array<{ totalAmount?: number; taxAmount?: number; voided?: boolean }>;
        }>;
        if (!Array.isArray(orders) || orders.length === 0) break;
        const isoDate = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
        for (const o of orders) {
          if (o.voided) continue;
          // Net sales excluding taxes
          const total = (o.checks ?? [])
            .filter((c) => !c.voided)
            .reduce((s, c) => s + ((c.totalAmount ?? 0) - (c.taxAmount ?? 0)), 0);
          if (!ordersByDate[isoDate]) ordersByDate[isoDate] = { sales: 0, count: 0 };
          ordersByDate[isoDate].sales += total;
          ordersByDate[isoDate].count += 1;
        }
        if (orders.length < 100) break;
        page += 1;
      }
    }

    const rows = Object.entries(ordersByDate).map(([date, agg]) => ({
      location_id: locationId,
      business_date: date,
      actual_sales: Number(agg.sales.toFixed(2)),
      actual_customer_count: agg.count,
      source: "toast" as const,
      last_synced_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin
        .from("daily_sales")
        .upsert(rows, { onConflict: "location_id,business_date" });
      if (error) throw new Error(error.message);
    }
    return { ok: true, daysSynced: rows.length };
}