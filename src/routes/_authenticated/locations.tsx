import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listLocations, upsertLocation } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/locations")({
  head: () => ({ meta: [{ title: "Locations" }] }),
  component: LocationsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

type LocRow = { id: string; name: string; address: string | null; region: string | null; timezone: string; active: boolean };

function LocationsPage() {
  const fetchLocations = useServerFn(listLocations);
  const { data, isLoading } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations() });
  const [editing, setEditing] = useState<Partial<LocRow> | null>(null);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Locations</h1>
          <p className="text-sm text-muted-foreground">Manage restaurant and bakery locations.</p>
        </div>
        <Button onClick={() => setEditing({ active: true, timezone: "America/New_York" })}>
          <Plus className="h-4 w-4 mr-2" /> New location
        </Button>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No locations yet.</TableCell></TableRow>
            ) : (data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell>{l.region ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{l.timezone}</TableCell>
                <TableCell className="text-muted-foreground">{l.address ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${l.active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {l.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(l)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <LocationDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function LocationDialog({ initial, onClose }: { initial: Partial<LocRow>; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertLocation);
  const [form, setForm] = useState({
    id: initial.id,
    name: initial.name ?? "",
    region: initial.region ?? "",
    timezone: initial.timezone ?? "America/New_York",
    address: initial.address ?? "",
    active: initial.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await save({ data: { id: form.id, name: form.name, region: form.region || null, timezone: form.timezone, address: form.address || null, active: form.active } });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["locations"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit location" : "New location"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Region</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
            <div><Label>Timezone</Label><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}