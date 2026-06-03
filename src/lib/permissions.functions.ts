import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PermissionKey =
  | "dashboard"
  | "pnl"
  | "targets"
  | "locations"
  | "desserts"
  | "square"
  | "toast"
  | "users"
  | "permissions";

export const ALL_PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: "dashboard", label: "Daily Sales" },
  { key: "pnl", label: "Weekly PNL" },
  { key: "targets", label: "Targets" },
  { key: "locations", label: "Locations" },
  { key: "desserts", label: "Dessert of Month" },
  { key: "square", label: "Square Sync" },
  { key: "toast", label: "Toast Sync" },
  { key: "users", label: "Users" },
  { key: "permissions", label: "Role Permissions" },
];

export const MANAGED_ROLES = ["admin", "regional_manager", "store_manager"] as const;

const RoleEnum = z.enum(["super_admin", "admin", "regional_manager", "store_manager"]);
const PermEnum = z.enum([
  "dashboard","pnl","targets","locations","desserts","square","toast","users","permissions",
]);

export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("role_permissions")
      .select("role, permission");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      role: RoleEnum,
      permission: PermEnum,
      enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) throw new Error("Only super admins can modify role permissions");
    if (data.role === "super_admin") {
      throw new Error("Super admin permissions cannot be modified");
    }
    if (data.enabled) {
      const { error } = await supabase
        .from("role_permissions")
        .upsert({ role: data.role, permission: data.permission }, { onConflict: "role,permission" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role", data.role)
        .eq("permission", data.permission);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    if (roles.includes("super_admin")) {
      return { roles, permissions: ALL_PERMISSIONS.map((p) => p.key) as string[] };
    }
    if (!roles.length) return { roles, permissions: [] as string[] };
    const { data: perms, error } = await supabase
      .from("role_permissions")
      .select("permission")
      .in("role", roles);
    if (error) throw new Error(error.message);
    const set = new Set((perms ?? []).map((p) => p.permission));
    return { roles, permissions: Array.from(set) };
  });