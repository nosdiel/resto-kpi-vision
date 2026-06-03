import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getQtrReport } from "@/lib/pnl.functions";
import { currentFiscalYearWeek } from "@/lib/fiscal";
import { fmtCurrency } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pnl-qtr")({
  head: () => ({ meta: [{ title: "Quarter Report" }] }),
  component: QtrPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">Error: {error.message}</div>,
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

type CatKey = "sales" | "payroll" | "food" | "catering" | "paper";
const CATEGORIES: { key: CatKey; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "payroll", label: "Payroll" },
  { key: "food", label: "Food Cost" },
  { key: "catering", label: "Catering Order" },
  { key: "paper", label: "Paper Good" },
];

function QtrPage() {
  const initial = currentFiscalYearWeek();
  const currentYear = new Date().getUTCFullYear();
  const defaultQuarter = Math.min(4, Math.max(1, Math.ceil(Math.max(1, initial.fiscalWeek - 1) / 13)));

  const [fiscalYear, setFiscalYear] = useState(initial.fiscalYear);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [locationId, setLocationId] = useState<string | null>(null);

  const fetchData = useServerFn(getQtrReport);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pnl-qtr", locationId, fiscalYear, quarter],
    queryFn: () => fetchData({ data: { locationId, fiscalYear, quarter } }),
  });

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quarter Report</h1>
          <p className="text-sm text-muted-foreground">
            {data?.locations.find((l) => l.id === data.locationId)?.name ?? "—"} · FY{fiscalYear} · Q{quarter}
            {data?.startWeek ? ` · Weeks ${data.startWeek}–${data.endWeek}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/pnl"><Button variant="outline" size="sm">Weekly PNL</Button></Link>
          <Button variant="outline" size="sm" disabled>QTR Report</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <Filter label="Quarter">
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}</SelectContent>
            </Select>
          </Filter>
        </div>
      </Card>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}

      {!isLoading && data?.rows?.length ? <QtrTable rows={data.rows} quarter={quarter} /> : null}
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

type Row = {
  week: number;
  period: "Q" | "T" | "D";
  sales: { goal: number; actual: number };
  payroll: { goal: number; actual: number };
  food: { goal: number; actual: number };
  catering: { goal: number; actual: number };
  paper: { goal: number; actual: number };
};

function QtrTable({ rows, quarter }: { rows: Row[]; quarter: number }) {
  // QTD totals
  const totals = rows.reduce(
    (acc, r) => {
      for (const c of CATEGORIES) {
        acc[c.key].goal += r[c.key].goal;
        acc[c.key].actual += r[c.key].actual;
      }
      return acc;
    },
    Object.fromEntries(CATEGORIES.map((c) => [c.key, { goal: 0, actual: 0 }])) as Record<CatKey, { goal: number; actual: number }>,
  );

  // Group consecutive periods (Q,T,D)
  const periods: { label: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = periods[periods.length - 1];
    if (last && last.label === r.period) last.rows.push(r);
    else periods.push({ label: r.period, rows: [r] });
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-table-header text-table-header-foreground">
            <th className="p-2 text-left" colSpan={2}></th>
            {CATEGORIES.map((c) => (
              <th key={c.key} className="p-2 text-center border-l border-border" colSpan={3}>{c.label}</th>
            ))}
          </tr>
          <tr className="bg-muted text-foreground">
            <th className="p-2 text-left w-10"></th>
            <th className="p-2 text-left">Weeks</th>
            {CATEGORIES.map((c) => (
              <Fragment3 key={c.key} />
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p, pi) => (
            p.rows.map((r, ri) => (
              <tr key={r.week} className="border-t border-border">
                {ri === 0 ? (
                  <td className="p-2 align-middle font-bold text-center border-r border-border" rowSpan={p.rows.length}>
                    {p.label}{quarter > 1 || pi > 0 ? "" : ""}
                  </td>
                ) : null}
                <td className="p-2 font-medium">Week {r.week}</td>
                {CATEGORIES.map((c) => {
                  const cell = r[c.key];
                  const isSales = c.key === "sales";
                  const diff = isSales ? cell.goal - cell.actual : cell.actual - cell.goal;
                  const unfavorable = diff > 0;
                  return (
                    <Cells key={c.key} goal={cell.goal} actual={cell.actual} wtd={Math.abs(diff)} bad={unfavorable} />
                  );
                })}
              </tr>
            ))
          ))}
          <tr className="bg-table-totals text-table-totals-foreground font-bold border-t border-border">
            <td className="p-2 text-center border-r border-border">QTD {quarter}</td>
            <td className="p-2"></td>
            {CATEGORIES.map((c) => {
              const cell = totals[c.key];
              const isSales = c.key === "sales";
              const diff = isSales ? cell.goal - cell.actual : cell.actual - cell.goal;
              const unfavorable = diff > 0;
              return (
                <Cells key={c.key} goal={cell.goal} actual={cell.actual} wtd={Math.abs(diff)} bad={unfavorable} bold />
              );
            })}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function Fragment3() {
  return (
    <>
      <th className="p-2 text-right font-medium border-l border-border">Goal</th>
      <th className="p-2 text-right font-medium">Actual</th>
      <th className="p-2 text-right font-medium">WTD</th>
    </>
  );
}

function Cells({ goal, actual, wtd, bad, bold }: { goal: number; actual: number; wtd: number; bad: boolean; bold?: boolean }) {
  return (
    <>
      <td className={`p-2 text-right tabular-nums border-l border-border ${bold ? "font-bold" : ""}`}>{fmtCurrency(goal)}</td>
      <td className={`p-2 text-right tabular-nums ${bold ? "font-bold" : ""}`}>{fmtCurrency(actual)}</td>
      <td className={`p-2 text-right tabular-nums ${bad ? "text-destructive" : ""} ${bold ? "font-bold" : ""}`}>
        {wtd === 0 ? "—" : fmtCurrency(wtd)}
      </td>
    </>
  );
}