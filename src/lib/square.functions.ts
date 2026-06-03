import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SQUARE_VERSION = "2024-10-17";
const SQUARE_CONNECTION_ERROR = "Square token missing permission or location does not belong to this Square account/environment.";
const requiredPermissions = ["ORDERS_READ", "PAYMENTS_READ", "MERCHANT_PROFILE_READ", "ITEMS_READ"] as const;

type SquareEnvironment = "production" | "sandbox";
type SquarePermission = typeof requiredPermissions[number];
type SquareLocationOption = {
  id: string;
  name: string;
  merchantId: string | null;
  status: string | null;
  timezone: string | null;
  currency: string | null;
};

function squareBase(environment: SquareEnvironment) {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}

function squareHeaders(accessToken: string) {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function readSquareError(res: Response) {
  const text = await res.text();
  return text.slice(0, 500);
}

async function checkSquarePermission(
  permission: SquarePermission,
  environment: SquareEnvironment,
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${squareBase(environment)}${path}`, {
    ...init,
    headers: squareHeaders(accessToken),
  });

  if (res.ok) return { permission, ok: true, status: res.status, response: null };

  const response = await readSquareError(res);
  console.error("Square permission validation failed", { permission, environment, status: res.status, response });
  return { permission, ok: false, status: res.status, response };
}

async function validateSquareConnection({
  accessToken,
  environment,
  selectedLocationId,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  selectedLocationId?: string;
}) {
  if (!accessToken.trim()) {
    return { ok: false, merchantId: null, locations: [] as SquareLocationOption[], missingPermissions: [...requiredPermissions], error: SQUARE_CONNECTION_ERROR };
  }

  const locationsRes = await fetch(`${squareBase(environment)}/v2/locations`, {
    headers: squareHeaders(accessToken),
  });

  if (!locationsRes.ok) {
    const response = await readSquareError(locationsRes);
    console.error("Square locations validation failed", { environment, status: locationsRes.status, response });
    return { ok: false, merchantId: null, locations: [] as SquareLocationOption[], missingPermissions: ["MERCHANT_PROFILE_READ" as SquarePermission], error: SQUARE_CONNECTION_ERROR };
  }

  const locationsJson = (await locationsRes.json()) as { locations?: Array<Record<string, unknown>> };
  const locations = (locationsJson.locations ?? [])
    .filter((loc) => typeof loc.id === "string" && loc.id.length > 0)
    .map((loc) => ({
      id: loc.id as string,
      name: typeof loc.name === "string" && loc.name.length > 0 ? loc.name : (loc.id as string),
      merchantId: typeof loc.merchant_id === "string" ? loc.merchant_id : null,
      status: typeof loc.status === "string" ? loc.status : null,
      timezone: typeof loc.timezone === "string" ? loc.timezone : null,
      currency: typeof loc.currency === "string" ? loc.currency : null,
    }));

  const merchantId = locations.find((loc) => loc.merchantId)?.merchantId ?? null;
  const checkLocationId = selectedLocationId ?? locations[0]?.id;

  if (!checkLocationId || (selectedLocationId && !locations.some((loc) => loc.id === selectedLocationId))) {
    return { ok: false, merchantId, locations, missingPermissions: [] as SquarePermission[], error: SQUARE_CONNECTION_ERROR };
  }

  const permissionChecks = await Promise.all([
    checkSquarePermission("ORDERS_READ", environment, accessToken, "/v2/orders/search", {
      method: "POST",
      body: JSON.stringify({ location_ids: [checkLocationId], limit: 1 }),
    }),
    checkSquarePermission("PAYMENTS_READ", environment, accessToken, "/v2/payments?limit=1"),
    checkSquarePermission("ITEMS_READ", environment, accessToken, "/v2/catalog/list?types=ITEM"),
  ]);

  const missingPermissions = permissionChecks
    .filter((check) => !check.ok)
    .map((check) => check.permission);

  if (missingPermissions.length > 0) {
    return { ok: false, merchantId, locations, missingPermissions, error: SQUARE_CONNECTION_ERROR };
  }

  return { ok: true, merchantId, locations, missingPermissions: [] as SquarePermission[], error: null };
}

export const testSquareConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    accessToken: z.string().min(10).max(2000),
    environment: z.enum(["production", "sandbox"]),
  }).parse(d))
  .handler(async ({ data }) => validateSquareConnection(data));

export const getSquareConnectionLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error } = await supabaseAdmin
      .from("square_connections")
      .select("access_token, square_location_id, environment")
      .eq("location_id", data.locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conn?.access_token) return { ok: false, merchantId: null, locations: [], missingPermissions: [...requiredPermissions], error: SQUARE_CONNECTION_ERROR };

    return validateSquareConnection({
      accessToken: conn.access_token,
      environment: conn.environment === "sandbox" ? "sandbox" : "production",
      selectedLocationId: conn.square_location_id,
    });
  });

export const saveSquareConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    squareLocationId: z.string().min(1).max(64),
    accessToken: z.string().min(10).max(2000).optional(),
    environment: z.enum(["production", "sandbox"]).default("production"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("square_connections")
      .select("access_token")
      .eq("location_id", data.locationId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const accessToken = data.accessToken ?? existing?.access_token;
    if (!accessToken) return { ok: false, merchantId: null, locations: [], missingPermissions: [...requiredPermissions], error: SQUARE_CONNECTION_ERROR };

    const validation = await validateSquareConnection({
      accessToken,
      environment: data.environment,
      selectedLocationId: data.squareLocationId,
    });

    if (!validation.ok) return validation;

    const squareLocation = validation.locations.find((loc) => loc.id === data.squareLocationId);
    const { error } = await context.supabase
      .from("square_connections")
      .upsert({
        location_id: data.locationId,
        square_location_id: data.squareLocationId,
        access_token: accessToken,
        merchant_id: squareLocation?.merchantId ?? validation.merchantId,
        environment: data.environment,
        created_by: context.userId,
      }, { onConflict: "location_id" });
    if (error) throw new Error(error.message);
    return validation;
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

export const listSquareCatalogItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ locationId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("square_connections")
      .select("access_token, environment, location_id");
    if (data.locationId) query = query.eq("location_id", data.locationId);
    const { data: conns, error } = await query;
    if (error) throw new Error(error.message);
    if (!conns || conns.length === 0) return { items: [] as Array<{ id: string; name: string }> };

    const conn = conns[0];
    const env = (conn.environment === "sandbox" ? "sandbox" : "production") as SquareEnvironment;
    const items: Array<{ id: string; name: string }> = [];
    let cursor: string | undefined;
    do {
      const url = new URL(`${squareBase(env)}/v2/catalog/list`);
      url.searchParams.set("types", "ITEM");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { headers: squareHeaders(conn.access_token) });
      if (!res.ok) {
        const response = await readSquareError(res);
        console.error("Square catalog list failed", { status: res.status, response });
        return { items, error: SQUARE_CONNECTION_ERROR };
      }
      const json = (await res.json()) as { objects?: Array<{ id: string; item_data?: { name?: string } }>; cursor?: string };
      for (const o of json.objects ?? []) {
        items.push({ id: o.id, name: o.item_data?.name ?? o.id });
      }
      cursor = json.cursor;
    } while (cursor && items.length < 1000);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items };
  });

export const syncSquareLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    locationId: z.string().uuid(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data }) => runSquareSync(data.locationId, data.startDate, data.endDate));

export const backfillSquareFiscalPeriods = createServerFn({ method: "POST" })
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
    return runSquareSync(data.locationId, start, today);
  });

async function runSquareSync(locationId: string, startDate: string, endDate: string) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("square_connections").select("*").eq("location_id", locationId).maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn?.access_token || !conn.square_location_id) {
      return { ok: false, daysSynced: 0, error: SQUARE_CONNECTION_ERROR };
    }

    const env = ((conn as { environment?: string }).environment === "sandbox" ? "sandbox" : "production") as SquareEnvironment;
    const validation = await validateSquareConnection({
      accessToken: conn.access_token,
      environment: env,
      selectedLocationId: conn.square_location_id,
    });

    if (!validation.ok) {
      return { ok: false, daysSynced: 0, error: SQUARE_CONNECTION_ERROR };
    }

    const beginIso = new Date(`${startDate}T00:00:00Z`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59Z`).toISOString();
    let cursor: string | undefined = undefined;
    const ordersByDate: Record<string, { sales: number; count: number }> = {};

    do {
      const res = await fetch(`${squareBase(env)}/v2/orders/search`, {
        method: "POST",
        headers: squareHeaders(conn.access_token),
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
        const response = await readSquareError(res);
        console.error("Square sync failed", { status: res.status, environment: env, locationId, squareLocationId: conn.square_location_id, response });
        return { ok: false, daysSynced: 0, error: res.status === 401 || res.status === 403 ? SQUARE_CONNECTION_ERROR : `Square API error ${res.status}: ${response}` };
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

    const rows = Object.entries(ordersByDate).map(([date, agg]) => ({
      location_id: locationId,
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
    return { ok: true, daysSynced: rows.length, error: null };
}