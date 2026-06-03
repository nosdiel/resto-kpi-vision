import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listVendorContacts, upsertVendorContact, deleteVendorContact } from "@/lib/vendor-contacts.functions";
import { listLocations } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Phone, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/who-to-call")({
  head: () => ({ meta: [{ title: "Who To Call" }] }),
  component: WhoToCallPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

type VendorRow = {
  id: string;
  location_id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  notes: string | null;
  active: boolean;
};

const DEFAULT_CATEGORIES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Refrigeration",
  "Appliance Repair",
  "General Maintenance",
  "Pest Control",
  "Locksmith",
  "Cleaning",
  "IT / POS",
  "Other",
];

function WhoToCallPage() {
  const fetchVendors = useServerFn(listVendorContacts);
  const fetchLocations = useServerFn(listLocations);
  const removeFn = useServerFn(deleteVendorContact);
  const qc = useQueryClient();

  const { data: vendors, isLoading } = useQuery({ queryKey: ["vendor_contacts"], queryFn: () => fetchVendors() });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations() });

  const [editing, setEditing] = useState<Partial<VendorRow> | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const locMap = useMemo(() => {
    const m = new Map<string, string>();
    (locations ?? []).forEach((l) => m.set(l.id, l.name));
    return m;
  }, [locations]);

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    (vendors ?? []).forEach((v) => set.add(v.category));
    return Array.from(set).sort();
  }, [vendors]);

  const filtered = (vendors ?? []).filter((v) => {
    if (locationFilter !== "all" && v.location_id !== locationFilter) return false;
    if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vendor?")) return;
    try {
      await removeFn({ data: { id } });
      toast.success("Vendor deleted");
      qc.invalidateQueries({ queryKey: ["vendor_contacts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Who To Call</h1>
          <p className="text-sm text-muted-foreground">Approved vendors for maintenance and repairs.</p>
        </div>
        <Button
          onClick={() =>
            setEditing({
              active: true,
              location_id: locations?.[0]?.id,
              category: DEFAULT_CATEGORIES[0],
            })
          }
          disabled={!locations?.length}
        >
          <Plus className="h-4 w-4 mr-2" /> Add vendor
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <Label className="text-xs">Location</Label>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {(locations ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Label className="text-xs">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No vendors yet.</TableCell></TableRow>
            ) : filtered.map((v) => (
              <TableRow key={v.id}>
                <TableCell><span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-accent text-accent-foreground">{v.category}</span></TableCell>
                <TableCell className="font-medium">
                  {v.name}
                  {v.notes && <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{v.notes}</div>}
                </TableCell>
                <TableCell className="text-muted-foreground">{v.contact_person ?? "—"}</TableCell>
                <TableCell>
                  {v.phone ? (
                    <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Phone className="h-3 w-3" /> {v.phone}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  {v.email ? (
                    <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Mail className="h-3 w-3" /> {v.email}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{locMap.get(v.location_id) ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${v.active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {v.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <VendorDialog
          initial={editing}
          locations={locations ?? []}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function VendorDialog({
  initial,
  locations,
  categories,
  onClose,
}: {
  initial: Partial<VendorRow>;
  locations: { id: string; name: string }[];
  categories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(upsertVendorContact);
  const [form, setForm] = useState({
    id: initial.id,
    location_id: initial.location_id ?? locations[0]?.id ?? "",
    name: initial.name ?? "",
    category: initial.category ?? DEFAULT_CATEGORIES[0],
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    contact_person: initial.contact_person ?? "",
    notes: initial.notes ?? "",
    active: initial.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.location_id) return toast.error("Location is required");
    if (!form.category.trim()) return toast.error("Category is required");
    setSaving(true);
    try {
      await save({
        data: {
          id: form.id,
          location_id: form.location_id,
          name: form.name,
          category: form.category,
          phone: form.phone || null,
          email: form.email || null,
          contact_person: form.contact_person || null,
          notes: form.notes || null,
          active: form.active,
        },
      });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["vendor_contacts"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit vendor" : "Add vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([...DEFAULT_CATEGORIES, ...categories])).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Vendor / Company name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Contact person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Account #, hours, preferred contact method, etc." /></div>
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