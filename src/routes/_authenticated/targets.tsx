import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listLocations } from "@/lib/admin.functions";
import { listTargets, upsertTarget, copyTargetsFromPriorWeek } from "@/lib/targets.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { periodForWeek } from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Weekly Targets" }] }),
  component: TargetsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function TargetsPage() {
  const currentYear = new Date().getUTCFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [locationId, setLocationId] = useState<string | null>(null);

  const fetchLocs = useServerFn(listLocations);
  const { data: locs } = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocs() });
  useEffect(() => { if (!locationId && locs?.length) setLocationId(locs[0].id); }, [locs, locationId]);

  const fetchTargets = useServerFn(listTargets);
  const qc = useQueryClient();
  const { data: targets, isLoading } = useQuery({
    queryKey: ["targets", locationId, fiscalYear],
    queryFn: () => fetchTargets({ data: { locationId: locationId!, fiscalYear } }),
    enabled: !!locationId,
  });

  const save = useServerFn(upsertTarget);
  const copy = useServerFn(copyTargetsFromPriorWeek);

  const targetByWeek = new Map((targets ?? []).map((t) => [t.fiscal_week, t]));

  const updateWeek = async (week: number, pct: number, avg: number | null) => {
    if (!locationId) return;
    try {
      await save({ data: { locationId, fiscalYear, fiscalWeek: week, targetPctOverLy: pct, avgTicketGoal: avg } });
      toast.success(`Week ${week} saved`);
      qc.invalidateQueries({ queryKey: ["targets", locationId, fiscalYear] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const copyAll = async () => {
    if (!locationId || !targets || targets.length === 0) return toast.error("Set week 1 first");
    const src = targets[0];
    for (let w = 1; w <= 52; w++) {
      if (!targetByWeek.has(w)) {
        await save({ data: { locationId, fiscalYear, fiscalWeek: w, targetPctOverLy: Number(src.target_pct_over_ly), avgTicketGoal: src.avg_ticket_goal ? Number(src.avg_ticket_goal) : null } });
      }
    }
    qc.invalidateQueries({ queryKey: ["targets", locationId, fiscalYear] });
    toast.success("Filled all weeks");
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Weekly Targets</h1>
        <p className="text-sm text-muted-foreground">Target is expressed as a percentage over last year's sales.</p>
      </div>
      <div className="flex gap-3 items-end">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Location</div>
          <Select value={locationId ?? undefined} onValueChange={setLocationId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>{(locs ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Fiscal Year</div>
          <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={copyAll}>Fill empty weeks from week 1</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Target % over LY</TableHead>
              <TableHead>Avg Ticket Goal</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
              const t = targetByWeek.get(w);
              return <TargetRow key={w} week={w} target={t} onSave={updateWeek} />;
            })}
          </TableBody>
        </Table>
      </Card>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}

function TargetRow({ week, target, onSave }: { week: number; target: any; onSave: (w: number, pct: number, avg: number | null) => void }) {
  const [pct, setPct] = useState(target ? String(target.target_pct_over_ly) : "");
  const [avg, setAvg] = useState(target?.avg_ticket_goal ? String(target.avg_ticket_goal) : "");
  useEffect(() => {
    setPct(target ? String(target.target_pct_over_ly) : "");
    setAvg(target?.avg_ticket_goal ? String(target.avg_ticket_goal) : "");
  }, [target]);
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">P{periodForWeek(week)}</TableCell>
      <TableCell className="font-medium">Week {week}</TableCell>
      <TableCell><Input type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} className="w-28" placeholder="0.0" /></TableCell>
      <TableCell><Input type="number" step="0.01" value={avg} onChange={(e) => setAvg(e.target.value)} className="w-32" placeholder="—" /></TableCell>
      <TableCell>
        <Button size="sm" variant="outline" onClick={() => onSave(week, Number(pct || 0), avg ? Number(avg) : null)}>Save</Button>
      </TableCell>
    </TableRow>
  );
}