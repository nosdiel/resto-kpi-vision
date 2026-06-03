import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ALL_PERMISSIONS,
  MANAGED_ROLES,
  listRolePermissions,
  setRolePermission,
} from "@/lib/permissions.functions";
import { getMe } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const ROLE_LABELS: Record<(typeof MANAGED_ROLES)[number], string> = {
  admin: "Admin",
  regional_manager: "Regional Manager",
  store_manager: "Store Manager",
};

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Role Permissions" }] }),
  component: PermissionsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function PermissionsPage() {
  const qc = useQueryClient();
  const fetchPerms = useServerFn(listRolePermissions);
  const fetchMe = useServerFn(getMe);
  const save = useServerFn(setRolePermission);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const { data: rows, isLoading } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: () => fetchPerms(),
  });

  const isSuper = !!me?.isSuperAdmin;

  const grid = new Map<string, Set<string>>();
  (rows ?? []).forEach((r) => {
    if (!grid.has(r.role)) grid.set(r.role, new Set());
    grid.get(r.role)!.add(r.permission);
  });

  const toggle = useMutation({
    mutationFn: (v: { role: (typeof MANAGED_ROLES)[number]; permission: string; enabled: boolean }) =>
      save({ data: v as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Role Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Choose which sections each role can see and access. Super Admin always has full access.
        </p>
        {!isSuper && (
          <p className="text-sm text-destructive mt-2">Only Super Admins can change permissions.</p>
        )}
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead>
              {MANAGED_ROLES.map((r) => (
                <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={MANAGED_ROLES.length + 1} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && ALL_PERMISSIONS.map((perm) => (
              <TableRow key={perm.key}>
                <TableCell className="font-medium">{perm.label}</TableCell>
                {MANAGED_ROLES.map((role) => {
                  const enabled = grid.get(role)?.has(perm.key) ?? false;
                  return (
                    <TableCell key={role} className="text-center">
                      <Checkbox
                        checked={enabled}
                        disabled={!isSuper || toggle.isPending}
                        onCheckedChange={(v) =>
                          toggle.mutate({ role, permission: perm.key, enabled: !!v })
                        }
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}