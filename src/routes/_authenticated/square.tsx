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

type SquareLocationChoice = {
  id: string;
  name: string;
  merchantId: string | null;
  status: string | null;
  timezone: string | null;
  currency: string | null;
};

const requiredSquarePermissions = ["ORDERS_READ", "PAYMENTS_READ", "MERCHANT_PROFILE_READ", "ITEMS_READ"];
const squareConnectionError = "Square token missing permission or location does not belong to this Square account/environment.";

function ConnectDialog({ locationId, initial, onClose }: { locationId: string; initial: any; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveSquareConnection);
  const testToken = useServerFn(testSquareConnection);
  const loadStoredLocations = useServerFn(getSquareConnectionLocations);
  const [sqLoc, setSqLoc] = useState(initial?.square_location_id ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant_id ?? "");
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState<"production" | "sandbox">(initial?.environment ?? "production");
  const [squareLocations, setSquareLocations] = useState<SquareLocationChoice[]>([]);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyValidationResult = (result: { ok: boolean; merchantId: string | null; locations: SquareLocationChoice[]; missingPermissions: string[]; error: string | null }) => {
    setMerchant(result.merchantId ?? "");
    setSquareLocations(result.locations ?? []);
    setMissingPermissions(result.missingPermissions ?? []);
    setValidationError(result.ok ? null : result.error ?? squareConnectionError);

    if (result.locations.length > 0 && !result.locations.some((loc) => loc.id === sqLoc)) {
      setSqLoc(result.locations[0].id);
    }
  };

  const runTokenTest = async () => {
    if (!token.trim()) return toast.error("Access token is required to load Square locations");
    setTesting(true);
    try {
      const result = await testToken({ data: { accessToken: token.trim(), environment } });
      applyValidationResult(result);
      if (result.ok) toast.success("Square connection verified");
      else toast.error(squareConnectionError);
    } catch (e) {
      setValidationError(squareConnectionError);
      toast.error(e instanceof Error ? e.message : squareConnectionError);
    } finally { setTesting(false); }
  };

  const loadSaved = async () => {
    if (!initial) return toast.error("Save a Square token before loading saved locations");
    setTesting(true);
    try {
      const result = await loadStoredLocations({ data: { locationId } });
      applyValidationResult(result);
      if (result.ok) toast.success("Square locations loaded");
      else toast.error(squareConnectionError);
    } catch (e) {
      setValidationError(squareConnectionError);
      toast.error(e instanceof Error ? e.message : squareConnectionError);
    } finally { setTesting(false); }
  };

  const submit = async () => {
    if (!sqLoc) return toast.error("Select a Square location from the connected account");
    if (!initial && !token.trim()) return toast.error("Access token is required");
    setSaving(true);
    try {
      const payload = token.trim()
        ? { locationId, squareLocationId: sqLoc, accessToken: token.trim(), environment }
        : { locationId, squareLocationId: sqLoc, environment };
      const result = await save({ data: payload });
      applyValidationResult(result);
      if (!result.ok) {
        toast.error(squareConnectionError);
        return;
      }
      toast.success("Square location mapping saved");
      qc.invalidateQueries({ queryKey: ["square-conns"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const selectedLocation = squareLocations.find((loc) => loc.id === sqLoc);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Update Square connection" : "Connect Square"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Environment</Label>
              <Select
                value={environment}
                onValueChange={(v) => {
                  setEnvironment(v as "production" | "sandbox");
                  setSquareLocations([]);
                  setSqLoc("");
                  setValidationError(null);
                  setMissingPermissions([]);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Connected merchant</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                {merchant || "Not verified"}
              </div>
            </div>
          </div>

          <div>
            <Label>Access token</Label>
            <div className="flex gap-2">
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={initial ? "Paste new token or load saved token" : "Paste Square access token"} />
              <Button type="button" variant="outline" onClick={runTokenTest} disabled={testing}>{testing ? "Testing…" : "Test"}</Button>
              {initial && <Button type="button" variant="ghost" onClick={loadSaved} disabled={testing}>Load saved</Button>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Testing calls Square List Locations and verifies ORDERS_READ, PAYMENTS_READ, MERCHANT_PROFILE_READ, and ITEMS_READ.</p>
          </div>

          <div className="space-y-2">
            <Label>Required permissions</Label>
            <div className="flex flex-wrap gap-2">
              {requiredSquarePermissions.map((permission) => {
                const missing = missingPermissions.includes(permission);
                return (
                  <Badge key={permission} variant={missing ? "destructive" : "outline"} className="gap-1">
                    {missing ? <ShieldAlert className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {permission}
                  </Badge>
                );
              })}
            </div>
          </div>

          {validationError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {validationError}
            </div>
          )}

          <div>
            <Label>Square location</Label>
            <Select value={sqLoc} onValueChange={setSqLoc} disabled={squareLocations.length === 0}>
              <SelectTrigger><SelectValue placeholder="Test token to load Square locations" /></SelectTrigger>
              <SelectContent>
                {squareLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name} — {loc.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLocation && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedLocation.status ?? "Unknown status"} · {selectedLocation.timezone ?? "No timezone"} · {selectedLocation.currency ?? "No currency"}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || testing || !sqLoc}>{saving ? "Saving…" : "Save mapping"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}