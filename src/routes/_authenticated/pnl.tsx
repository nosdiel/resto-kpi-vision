import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getPnlWeek,
  upsertWeeklyPnl,
  addPnlVendor,
  removePnlVendor,
  renamePnlVendor,
} from "@/lib/pnl.functions";
import { getMe } from "@/lib/admin.functions";
import {
  currentFiscalYearWeek,
  getPeriodRanges,
  periodForWeek,
  weeksInPeriod,
} from "@/lib/fiscal";
import { fmtCurrency } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Plus, X, Save, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pnl")({
  head: () => ({ meta: [{ title: "Weekly PNL" }] }),
  component: PnlPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function PnlPage() {
  const initial = currentFiscalYearWeek();
  const currentYear = new Date().getUTCFullYear();
  // Default to the week prior to the current fiscal week (clamped to 1)
  const defaultWeek = Math.max(1, initial.fiscalWeek - 1);

  const [fiscalYear, setFiscalYear] = useState(initial.fiscalYear);
  const [fiscalWeek, setFiscalWeek] = useState(defaultWeek);
  const [locationId, setLocationId] = useState<string | null>(null);

  const period = periodForWeek(fiscalWeek);

  const fetchData = useServerFn(getPnlWeek);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pnl-week", locationId, fiscalYear, fiscalWeek],
    queryFn: () => fetchData({ data: { locationId, fiscalYear, fiscalWeek } }),
  });

  const fetchMe = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isAdmin = !!me?.isAdmin;

  const years = [currentYear - 1, currentYear, currentYear + 1];
  const weeksForPeriod = weeksInPeriod(period);

  return (
    <div className="p-6 space-y-5 print:p-2 print:space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly PNL</h1>
          <p className="text-sm text-muted-foreground">
            {data?.locations.find((l) => l.id === data.locationId)?.name ?? "—"} · FY{fiscalYear} · Period {period} · Week {fiscalWeek}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" disabled>Weekly PNL</Button>
          <Link to="/pnl-qtr"><Button variant="outline" size="sm">QTR Report</Button></Link>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Filter label="Location">
            <Select value={locationId ?? data?.locationId ?? ""} onValueChange={(v) => setLocationId(v)}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {(data?.locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
                {!data?.locations?.length && <SelectItem value="none" disabled>No locations yet</SelectItem>}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Fiscal Year">
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>)}</SelectContent>
            </Select>
          </Filter>
          <Filter label="Fiscal Period">
            <Select value={String(period)} onValueChange={(v) => { const p = Number(v); setFiscalWeek(weeksInPeriod(p)[0]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {getPeriodRanges().map((r) => (
                  <SelectItem key={r.period} value={String(r.period)}>
                    P{r.period} (Q{r.quarter}, wk {r.startWeek}–{r.endWeek})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Fiscal Week">
            <Select value={String(fiscalWeek)} onValueChange={(v) => setFiscalWeek(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{weeksForPeriod.map((w) => <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>)}</SelectContent>
            </Select>
          </Filter>
        </div>
      </Card>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}

      {!isLoading && data?.locationId && data.week && (
        <WeeklyPnlCard
          locationId={data.locationId}
          fiscalYear={fiscalYear}
          fiscalWeek={fiscalWeek}
          week={data.week}
          vendors={data.vendors as VendorRow[]}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

type VendorRow = { id: string; section: "food_purchases" | "paper_supplies"; name: string };
type WeekRow = {
  fiscalWeek: number;
  weekStart: string;
  weekEnd: string;
  totalSales: number;
  wages: number;
  beerWineCost: number;
  repairs: number;
  catering: number;
  vendorAmounts: Record<string, number>;
  notes: string | null;
  hasEntry: boolean;
};

function WeeklyPnlCard({
  locationId,
  fiscalYear,
  fiscalWeek,
  week,
  vendors,
  isAdmin,
}: {
  locationId: string;
  fiscalYear: number;
  fiscalWeek: number;
  week: WeekRow;
  vendors: VendorRow[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertWeeklyPnl);
  const addVendor = useServerFn(addPnlVendor);
  const removeVendor = useServerFn(removePnlVendor);
  const renameVendor = useServerFn(renamePnlVendor);

  const [wages, setWages] = useState(week.wages);
  const [beerWineCost, setBeerWineCost] = useState(week.beerWineCost);
  const [repairs, setRepairs] = useState(week.repairs);
  const [catering, setCatering] = useState(week.catering);
  const [vendorAmounts, setVendorAmounts] = useState<Record<string, number>>(week.vendorAmounts);
  const [newFood, setNewFood] = useState("");
  const [newPaper, setNewPaper] = useState("");

  useEffect(() => {
    setWages(week.wages);
    setBeerWineCost(week.beerWineCost);
    setRepairs(week.repairs);
    setCatering(week.catering);
    setVendorAmounts(week.vendorAmounts);
  }, [week.wages, week.beerWineCost, week.repairs, week.catering, week.vendorAmounts]);

  const foodVendors = vendors.filter((v) => v.section === "food_purchases");
  const paperVendors = vendors.filter((v) => v.section === "paper_supplies");

  const foodTotal = foodVendors.reduce((s, v) => s + (Number(vendorAmounts[v.id]) || 0), 0);
  const paperTotal = paperVendors.reduce((s, v) => s + (Number(vendorAmounts[v.id]) || 0), 0);
  const totalCostOfGoods = foodTotal;
  const expensesTotal = wages + totalCostOfGoods + paperTotal + repairs;

  const sales = week.totalSales;
  const pct = (n: number) => (sales > 0 ? `${((n / sales) * 100).toFixed(2)}%` : "0.00%");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["pnl-week", locationId, fiscalYear, fiscalWeek] });

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          locationId,
          fiscalYear,
          fiscalWeek,
          wages,
          beerWineCost,
          repairs,
          catering,
          vendorAmounts,
        },
      }),
    onSuccess: () => { toast.success(`Week ${fiscalWeek} saved`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addVendorMut = useMutation({
    mutationFn: (v: { section: "food_purchases" | "paper_supplies"; name: string }) =>
      addVendor({ data: { locationId, ...v } }),
    onSuccess: () => { setNewFood(""); setNewPaper(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeVendorMut = useMutation({
    mutationFn: (vendorId: string) => removeVendor({ data: { vendorId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const renameVendorMut = useMutation({
    mutationFn: (v: { vendorId: string; name: string }) => renameVendor({ data: v }),
    onSuccess: () => { toast.success("Vendor renamed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAmt = (id: string, val: string) => {
    const n = val === "" ? 0 : Number(val);
    setVendorAmounts((prev) => ({ ...prev, [id]: isNaN(n) ? 0 : n }));
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-table-header text-table-header-foreground">
        <div>
          <div className="text-lg font-bold italic">Week {fiscalWeek}</div>
          <div className="text-xs opacity-90">{week.weekStart} → {week.weekEnd}</div>
        </div>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <Save className="h-4 w-4 mr-2" /> {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <Section title="">
          <Row label="Food Sales (from daily sales)" amount={sales} bold />
          <Row label="Catering" amount={0} muted />
          <RowTotal label="Total Sales" amount={sales} />
        </Section>

        <Section title="Payroll">
          <EditableRow label="Wages" value={wages} onChange={setWages} pct={pct(wages)} />
          <RowTotal label="Total Payroll 20%" amount={wages} pct={pct(wages)} />
        </Section>

        <Section title="Food Cost">
          {foodVendors.map((v) => (
            <EditableRow
              key={v.id}
              label={v.name}
              value={Number(vendorAmounts[v.id]) || 0}
              onChange={(n) => setAmt(v.id, String(n))}
              pct={pct(Number(vendorAmounts[v.id]) || 0)}
              onRemove={() => removeVendorMut.mutate(v.id)}
              onRename={isAdmin ? (name) => renameVendorMut.mutate({ vendorId: v.id, name }) : undefined}
            />
          ))}
          <AddVendor
            value={newFood}
            onChange={setNewFood}
            onAdd={() => newFood.trim() && addVendorMut.mutate({ section: "food_purchases", name: newFood.trim() })}
          />
          <RowTotal label="Food Cost - Goal 33%" amount={foodTotal} pct={pct(foodTotal)} />
        </Section>

        

        <Section title="Paper Supplies">
          {paperVendors.map((v) => (
            <EditableRow
              key={v.id}
              label={v.name}
              value={Number(vendorAmounts[v.id]) || 0}
              onChange={(n) => setAmt(v.id, String(n))}
              pct={pct(Number(vendorAmounts[v.id]) || 0)}
              onRemove={() => removeVendorMut.mutate(v.id)}
              onRename={isAdmin ? (name) => renameVendorMut.mutate({ vendorId: v.id, name }) : undefined}
            />
          ))}
          <AddVendor
            value={newPaper}
            onChange={setNewPaper}
            onAdd={() => newPaper.trim() && addVendorMut.mutate({ section: "paper_supplies", name: newPaper.trim() })}
          />
          <RowTotal label="Total (3%)" amount={paperTotal} pct={pct(paperTotal)} />
        </Section>

        <Section title="">
          <EditableRow label="Total Repairs 1%" value={repairs} onChange={setRepairs} pct={pct(repairs)} bold />
        </Section>

        <RowTotal label="Total Cost of Goods" amount={expensesTotal} pct={pct(expensesTotal)} emphasis />
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <div className="font-bold text-foreground mb-1">{title}</div>}
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </div>
  );
}

function Row({ label, amount, bold, muted }: { label: string; amount: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto_80px] gap-3 items-center py-1.5 px-2 text-sm ${muted ? "text-muted-foreground" : ""}`}>
      <div className={bold ? "font-semibold" : ""}>{label}</div>
      <div className="text-right tabular-nums">{fmtCurrency(amount)}</div>
      <div className="text-right text-xs text-muted-foreground tabular-nums">—</div>
    </div>
  );
}

function RowTotal({ label, amount, pct, emphasis }: { label: string; amount: number; pct?: string; emphasis?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto_80px] gap-3 items-center py-2 px-2 font-bold ${emphasis ? "bg-table-totals text-table-totals-foreground" : "bg-muted"}`}>
      <div>{label}</div>
      <div className="text-right tabular-nums">{fmtCurrency(amount)}</div>
      <div className="text-right text-xs tabular-nums">{pct ?? ""}</div>
    </div>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  pct,
  bold,
  onRemove,
  onRename,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  pct: string;
  bold?: boolean;
  onRemove?: () => void;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  useEffect(() => { setDraft(label); }, [label]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== label && onRename) onRename(next);
    setEditing(false);
  };
  return (
    <div className="grid grid-cols-[1fr_140px_80px_auto] gap-3 items-center py-1.5 px-2 text-sm">
      {editing && onRename ? (
        <div className="flex gap-1 items-center">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setDraft(label); setEditing(false); }
            }}
            autoFocus
            className="h-7"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={commit} title="Save name">
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className={`flex items-center gap-1 group ${bold ? "font-semibold" : ""}`}>
          <span>{label}</span>
          {onRename && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 print:hidden"
              onClick={() => setEditing(true)}
              title="Rename vendor"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-8 text-right tabular-nums"
        placeholder="0.00"
      />
      <div className="text-right text-xs text-muted-foreground tabular-nums">{pct}</div>
      {onRemove ? (
        <Button variant="ghost" size="icon" className="h-7 w-7 print:hidden" onClick={onRemove} title="Remove vendor">
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <div />
      )}
    </div>
  );
}

function AddVendor({ value, onChange, onAdd }: { value: string; onChange: (s: string) => void; onAdd: () => void }) {
  return (
    <div className="flex gap-2 items-center py-2 px-2 print:hidden">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add vendor…"
        className="h-8 max-w-xs"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
      />
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add
      </Button>
    </div>
  );
}
