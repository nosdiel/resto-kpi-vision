import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listLocations } from "@/lib/admin.functions";
import { backfillToastFiscalPeriods, listToastConnections, saveToastConnection, syncToastLocation } from "@/lib/toast.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarRange, Plug, Plus, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/toast")({
  head: () => ({ meta: [{ title: "Toast Sync" }] }),
  component: ToastPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function ToastPage() {
  const fetchLocs = useServerFn(listLocations);
  const fetchConns = useServerFn(listToastConnections);
  const { data: locs } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });
  const { data: conns } = useQuery({ queryKey: ["toast-conns"], queryFn: () => fetchConns() });
  const [editingLocId, setEditingLocId] = useState<string | null>(null);

  const sync = useServerFn(syncToastLocation);
  const backfill = useServerFn(backfillToastFiscalPeriods);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const runSync = async (locationId: string) => {
    try {
      toast.info("Syncing…");
      await sync({ data: { locationId, startDate: weekAgo, endDate: today } });
      toast.success("Sync complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  };

  const runBackfill = async (locationId: string) => {
    try {
      toast.info("Loading previous fiscal periods…");
      const result = await backfill({ data: { locationId } });
      toast.success(`Backfill complete: ${result.daysSynced} day${result.daysSynced === 1 ? "" : "s"} loaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    }
  };

  const connByLoc = new Map((conns ?? []).map((c) => [c.location_id, c]));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Toast Sync</h1>
          <p className="text-sm text-muted-foreground">Connect each location to a Toast restaurant. Sync runs nightly and on demand.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/locations"><Plus className="h-4 w-4 mr-1" /> Add location</Link>
        </Button>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Toast Restaurant GUID</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(locs ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No locations yet. Add one to start connecting Toast.</p>
                  <Button asChild size="sm">
                    <Link to="/locations"><Plus className="h-4 w-4 mr-1" /> Add location</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ) : (locs ?? []).map((l) => {
              const c = connByLoc.get(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c?.toast_restaurant_guid ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{c?.environment ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c?.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingLocId(l.id)}>
                      <Plug className="h-4 w-4 mr-1" /> {c ? "Update" : "Connect"}
                    </Button>
                    {c && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => runSync(l.id)}>
                          <RefreshCw className="h-4 w-4 mr-1" /> Sync 7d
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => runBackfill(l.id)}>
                          <CalendarRange className="h-4 w-4 mr-1" /> Backfill fiscal
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      {editingLocId && (
        <ConnectDialog
          locationId={editingLocId}
          initial={connByLoc.get(editingLocId)}
          onClose={() => setEditingLocId(null)}
          onConnected={(id) => runBackfill(id)}
        />
      )}
    </div>
  );
}

function ConnectDialog({ locationId, initial, onClose, onConnected }: { locationId: string; initial: any; onClose: () => void; onConnected?: (locationId: string) => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveToastConnection);
  const [guid, setGuid] = useState(initial?.toast_restaurant_guid ?? "");
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [environment, setEnvironment] = useState<"production" | "sandbox">(initial?.environment ?? "production");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!guid.trim() || !clientId.trim() || !clientSecret.trim()) {
      return toast.error("Restaurant GUID, Client ID, and Client Secret are required");
    }
    setSaving(true);
    try {
      await save({ data: { locationId, toastRestaurantGuid: guid, clientId, clientSecret, environment } });
      toast.success("Connection saved");
      qc.invalidateQueries({ queryKey: ["toast-conns"] });
      if (!initial && onConnected) onConnected(locationId);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Update Toast connection" : "Connect Toast"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Environment</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as "production" | "sandbox")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Restaurant GUID</Label><Input value={guid} onChange={(e) => setGuid(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div>
          <div><Label>API Client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} /></div>
          <div>
            <Label>API Client Secret</Label>
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={initial ? "Leave blank to keep existing" : ""} />
            <p className="text-xs text-muted-foreground mt-1">Create credentials in the Toast Developer Portal (Toast Web → Integrations → API Access).</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}