import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listLocations } from "@/lib/admin.functions";
import { deleteDessert, listDesserts, setDessertOfMonth, upsertDessert } from "@/lib/desserts.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, CalendarCheck2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/desserts")({
  head: () => ({ meta: [{ title: "Desserts of the Month" }] }),
  component: DessertsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

type DessertRow = {
  id: string;
  name: string;
  location_id: string | null;
  active_from: string | null;
  active_to: string | null;
  square_item_id: string | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function DessertsPage() {
  const fetchDesserts = useServerFn(listDesserts);
  const fetchLocs = useServerFn(listLocations);
  const { data: desserts } = useQuery({ queryKey: ["desserts"], queryFn: () => fetchDesserts() });
  const { data: locs } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });
  const [editing, setEditing] = useState<DessertRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const locName = useMemo(
    () => new Map((locs ?? []).map((l) => [l.id, l.name])),
    [locs],
  );
  const today = new Date().toISOString().slice(0, 10);

  const isActive = (d: DessertRow) =>
    (!d.active_from || d.active_from <= today) && (!d.active_to || d.active_to >= today);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dessert of the Month</h1>
          <p className="text-sm text-muted-foreground">Pick the featured dessert to track in daily sales activity.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <CalendarCheck2 className="h-4 w-4 mr-1" /> Set dessert of the month
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> New dessert
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dessert</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Active window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(desserts ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No desserts yet. Set one for this month to start tracking.
                </TableCell>
              </TableRow>
            ) : (desserts as DessertRow[]).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.location_id ? (locName.get(d.location_id) ?? "—") : "All locations"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(d.active_from ?? "—")} → {(d.active_to ?? "—")}
                </TableCell>
                <TableCell>
                  {isActive(d) ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                </TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(d)}><Pencil className="h-4 w-4" /></Button>
                  <DeleteButton id={d.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(creating || editing) && (
        <EditDialog
          initial={editing}
          locations={locs ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
      {pickerOpen && (
        <PickMonthDialog locations={locs ?? []} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteDessert);
  const onDelete = async () => {
    if (!confirm("Delete this dessert?")) return;
    try {
      await del({ data: { id } });
      toast.success("Dessert deleted");
      qc.invalidateQueries({ queryKey: ["desserts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };
  return <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>;
}

function EditDialog({ initial, locations, onClose }: { initial: DessertRow | null; locations: Array<{ id: string; name: string }>; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertDessert);
  const [name, setName] = useState(initial?.name ?? "");
  const [locationId, setLocationId] = useState<string>(initial?.location_id ?? "__all");
  const [activeFrom, setActiveFrom] = useState(initial?.active_from ?? "");
  const [activeTo, setActiveTo] = useState(initial?.active_to ?? "");
  const [squareItemId, setSquareItemId] = useState(initial?.square_item_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await save({ data: {
        id: initial?.id,
        name: name.trim(),
        locationId: locationId === "__all" ? null : locationId,
        activeFrom: activeFrom || null,
        activeTo: activeTo || null,
        squareItemId: squareItemId.trim() || null,
      }});
      toast.success("Dessert saved");
      qc.invalidateQueries({ queryKey: ["desserts"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit dessert" : "New dessert"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pumpkin Cheesecake" /></div>
          <div>
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All locations</SelectItem>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Active from</Label><Input type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} /></div>
            <div><Label>Active to</Label><Input type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} /></div>
          </div>
          <div><Label>Square item ID (optional)</Label><Input value={squareItemId} onChange={(e) => setSquareItemId(e.target.value)} placeholder="Link to a Square catalog item" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickMonthDialog({ locations, onClose }: { locations: Array<{ id: string; name: string }>; onClose: () => void }) {
  const qc = useQueryClient();
  const setMonth = useServerFn(setDessertOfMonth);
  const [name, setName] = useState("");
  const [month, setMonth_] = useState(currentMonth());
  const [squareItemId, setSquareItemId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = async () => {
    if (!name.trim()) return toast.error("Dessert name is required");
    setSaving(true);
    try {
      const res = await setMonth({ data: {
        name: name.trim(),
        month,
        locationIds: selected,
        squareItemId: squareItemId.trim() || null,
      }});
      toast.success(`Set for ${res.count} location${res.count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["desserts"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Set dessert of the month</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Dessert name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pumpkin Cheesecake" /></div>
          <div><Label>Month</Label><Input type="month" value={month} onChange={(e) => setMonth_(e.target.value)} /></div>
          <div>
            <Label>Locations</Label>
            <p className="text-xs text-muted-foreground mb-2">Leave empty to apply to all locations.</p>
            <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-3">
              {locations.length === 0 && <p className="text-sm text-muted-foreground">No locations yet.</p>}
              {locations.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.includes(l.id)} onCheckedChange={() => toggle(l.id)} />
                  {l.name}
                </label>
              ))}
            </div>
          </div>
          <div><Label>Square item ID (optional)</Label><Input value={squareItemId} onChange={(e) => setSquareItemId(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Set for month"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}