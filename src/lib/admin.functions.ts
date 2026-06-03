import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------- Locations ---------- */
export const listLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("locations").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    address: z.string().max(300).optional().nullable(),
    region: z.string().max(80).optional().nullable(),
    timezone: z.string().min(1).max(60),
    active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = { name: data.name, address: data.address ?? null, region: data.region ?? null, timezone: data.timezone, active: data.active };
    if (data.id) {
      const { error } = await context.supabase.from("locations").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("locations").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------- Users & Roles ---------- */
export const listUsersWithRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles").select("id, email, display_name, created_at").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: ulocs } = await supabaseAdmin.from("user_locations").select("user_id, location_id");
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      location_ids: (ulocs ?? []).filter((u) => u.user_id === p.id).map((u) => u.location_id),
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    role: z.enum(["super_admin", "admin", "regional_manager", "store_manager"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;
    // Only super_admin can grant admin or super_admin
    if (data.role === "admin" || data.role === "super_admin") {
      const { data: callerRoles } = await supabase
        .from("user_roles").select("role").eq("user_id", callerId);
      const isSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
      if (!isSuper) throw new Error("Only super admins can assign admin roles");
    }
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    const { error } = await supabase.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    locationIds: z.array(z.string().uuid()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: delErr } = await supabase.from("user_locations").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    if (data.locationIds.length) {
      const rows = data.locationIds.map((lid) => ({ user_id: data.userId, location_id: lid }));
      const { error } = await supabase.from("user_locations").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------- Admin: create user ---------- */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(128),
      displayName: z.string().min(1).max(120).optional().nullable(),
      role: z.enum(["super_admin", "admin", "regional_manager", "store_manager"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase: callerSupabase, userId: callerId } = context;
    // Guard: caller must be admin (or super_admin)
    const { data: callerRoles } = await callerSupabase
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role));
    const isAdmin = callerRoleSet.has("admin") || callerRoleSet.has("super_admin");
    if (!isAdmin) throw new Error("Only admins can create users");
    // Only super_admin can create admin or super_admin users
    if ((data.role === "admin" || data.role === "super_admin") && !callerRoleSet.has("super_admin")) {
      throw new Error("Only super admins can create admin accounts");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.displayName ? { display_name: data.displayName } : undefined,
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("User creation returned no id");

    // handle_new_user trigger inserts default role; override to requested role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles").insert({ user_id: newId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, userId: newId };
  });

/* ---------- Current user (roles) ---------- */
export const getMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return {
      userId,
      profile,
      roles: (roles ?? []).map((r) => r.role as string),
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
      isSuperAdmin: (roles ?? []).some((r) => r.role === "super_admin"),
    };
  });