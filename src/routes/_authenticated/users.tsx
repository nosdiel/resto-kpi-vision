import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listUsersWithRoles, setUserRole, setUserLocations, listLocations, adminCreateUser, getMe } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & Roles" }] }),
  component: UsersPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function UsersPage() {
  const fetchUsers = useServerFn(listUsersWithRoles);
  const fetchLocs = useServerFn(listLocations);
  const fetchMe = useServerFn(getMe);
  const { data: users, isLoading } = useQuery({ queryKey: ["users-roles"], queryFn: () => fetchUsers() });
  const { data: locs } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isSuper = !!me?.isSuperAdmin;
  const qc = useQueryClient();
  const setRole = useServerFn(setUserRole);
  const [editingLocs, setEditingLocs] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const changeRole = async (userId: string, role: any) => {
    try {
      await setRole({ data: { userId, role } });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Users & Roles</h1>
            <p className="text-sm text-muted-foreground">Assign roles and location access.</p>
          </div>
          <Button onClick={() => setAdding(true)}>Add user</Button>
        </div>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (users ?? []).map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell className="text-muted-foreground">{u.display_name ?? "—"}</TableCell>
                <TableCell>
                  <Select value={u.roles.includes("super_admin") ? "super_admin" : (u.roles[0] ?? "store_manager")} onValueChange={(v) => changeRole(u.id, v)}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {isSuper && <SelectItem value="super_admin">Super Admin</SelectItem>}
                      <SelectItem value="admin" disabled={!isSuper}>Admin{!isSuper ? " (super admin only)" : ""}</SelectItem>
                      <SelectItem value="regional_manager">Regional Manager</SelectItem>
                      <SelectItem value="store_manager">Store Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{u.location_ids.length} assigned</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setEditingLocs(u)}>Edit access</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editingLocs && <LocationAccessDialog user={editingLocs} locations={locs ?? []} onClose={() => setEditingLocs(null)} />}
      {adding && <AddUserDialog onClose={() => setAdding(false)} isSuper={isSuper} />}
    </div>
  );
}

function AddUserDialog({ onClose, isSuper }: { onClose: () => void; isSuper: boolean }) {
  const qc = useQueryClient();
  const create = useServerFn(adminCreateUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"super_admin" | "admin" | "regional_manager" | "store_manager">("store_manager");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ data: { email, password, displayName: displayName || null, role } });
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="new-email">Email</Label>
            <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="new-name">Display name (optional)</Label>
            <Input id="new-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-password">Temporary password</Label>
            <Input id="new-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <p className="text-xs text-muted-foreground mt-1">Share this with the user; they can change it after signing in.</p>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {isSuper && <SelectItem value="super_admin">Super Admin</SelectItem>}
                <SelectItem value="admin" disabled={!isSuper}>Admin{!isSuper ? " (super admin only)" : ""}</SelectItem>
                <SelectItem value="regional_manager">Regional Manager</SelectItem>
                <SelectItem value="store_manager">Store Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocationAccessDialog({ user, locations, onClose }: { user: any; locations: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(setUserLocations);
  const [selected, setSelected] = useState<Set<string>>(new Set(user.location_ids));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const submit = async () => {
    setSaving(true);
    try {
      await save({ data: { userId: user.id, locationIds: Array.from(selected) } });
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Location access — {user.email}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-80 overflow-auto">
          {locations.length === 0 && <p className="text-sm text-muted-foreground">No locations exist.</p>}
          {locations.map((l) => (
            <label key={l.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
              <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
              <span>{l.name}</span>
              {l.region && <span className="text-xs text-muted-foreground">— {l.region}</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}