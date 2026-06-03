import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listLocations } from "@/lib/admin.functions";
import { getSquareConnectionLocations, listSquareConnections, saveSquareConnection, syncSquareLocation, testSquareConnection } from "@/lib/square.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plug, RefreshCw, Plus, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/square")({
  head: () => ({ meta: [{ title: "Square Sync" }] }),
  component: SquarePage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function SquarePage() {
  const fetchLocs = useServerFn(listLocations);
  const fetchConns = useServerFn(listSquareConnections);
  const { data: locs } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });
  const { data: conns } = useQuery({ queryKey: ["square-conns"], queryFn: () => fetchConns() });
  const [editingLocId, setEditingLocId] = useState<string | null>(null);

  const sync = useServerFn(syncSquareLocation);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const runSync = async (locationId: string) => {
    try {
      toast.info("Syncing…");
      const result = await sync({ data: { locationId, startDate: weekAgo, endDate: today } });
      if (!result.ok) {
        toast.error(result.error ?? "Square sync failed");
        return;
      }
      toast.success(`Sync complete: ${result.daysSynced} day${result.daysSynced === 1 ? "" : "s"} updated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  };

  const connByLoc = new Map((conns ?? []).map((c) => [c.location_id, c]));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Square Sync</h1>
          <p className="text-sm text-muted-foreground">Connect each dashboard location to a Square location. Sync runs nightly and on demand.</p>
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
              <TableHead>Square Location ID</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(locs ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <p className="mb-3">No locations yet. Add one to start connecting Square.</p>
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
                  <TableCell className="text-muted-foreground">{c?.square_location_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c?.environment ? <Badge variant="outline">{c.environment}</Badge> : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c?.merchant_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c?.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingLocId(l.id)}>
                      <Plug className="h-4 w-4 mr-1" /> {c ? "Update" : "Connect"}
                    </Button>
                    {c && (
                      <Button size="sm" variant="ghost" onClick={() => runSync(l.id)}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Sync 7d
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      {editingLocId && <ConnectDialog locationId={editingLocId} initial={connByLoc.get(editingLocId)} onClose={() => setEditingLocId(null)} />}
    </div>
  );
}

function ConnectDialog({ locationId, initial, onClose }: { locationId: string; initial: any; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveSquareConnection);
  const [sqLoc, setSqLoc] = useState(initial?.square_location_id ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant_id ?? "");
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<"production" | "sandbox">(initial?.environment ?? "production");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!sqLoc.trim() || !token.trim()) return toast.error("Square Location ID and access token are required");
    setSaving(true);
    try {
      await save({ data: { locationId, squareLocationId: sqLoc, accessToken: token, merchantId: merchant || null, environment } });
      toast.success("Connection saved");
      qc.invalidateQueries({ queryKey: ["square-conns"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Update Square connection" : "Connect Square"}</DialogTitle>
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
            <p className="text-xs text-muted-foreground mt-1">Must match the token type. Sandbox tokens require Sandbox Location IDs.</p>
          </div>
          <div><Label>Square Location ID</Label><Input value={sqLoc} onChange={(e) => setSqLoc(e.target.value)} placeholder="LXXXXXXXXXX" /></div>
          <div><Label>Merchant ID (optional)</Label><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></div>
          <div>
            <Label>Access Token</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={initial ? "Leave blank to keep existing" : "EAAA..."} />
            <p className="text-xs text-muted-foreground mt-1">Use a token from the selected environment with ORDERS_READ permission.</p>
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