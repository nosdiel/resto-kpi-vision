import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDashboard } from "@/lib/dashboard.functions";
import { DAY_NAMES, currentFiscalYearWeek, getPeriodRanges, periodForWeek, weeksInPeriod } from "@/lib/fiscal";
import { fmtCurrency, fmtInt, fmtPct, safeDiv } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Daily Sales Activity" }] }),
  component: DashboardPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">Error: {error.message}</div>,
});

function DashboardPage() {
  const currentYear = new Date().getUTCFullYear();
  const initial = currentFiscalYearWeek();
  const [fiscalYear, setFiscalYear] = useState(initial.fiscalYear);
  const [fiscalWeek, setFiscalWeek] = useState(initial.fiscalWeek);
  const [locationId, setLocationId] = useState<string | null>(null);

  const period = periodForWeek(fiscalWeek);
  const fetchDash = useServerFn(getDashboard);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", locationId, fiscalYear, fiscalWeek],
    queryFn: () => fetchDash({ data: { locationId, fiscalYear, fiscalWeek } }),
  });

  const rows = data?.days ?? [];
  const target = data?.target;
  const targetPct = Number(target?.target_pct_over_ly ?? 0);

  const computed = useMemo(() => {
    const dayRows = rows.map((d, i) => {
      const salesTarget = d.last_year_sales * (1 + targetPct / 100);
      return {
        ...d,
        dayName: DAY_NAMES[i],
        salesTarget,
        salesVariance: d.actual_sales - salesTarget,
        lyAvgTicket: safeDiv(d.last_year_sales, d.last_year_customer_count),
        actualAvgTicket: safeDiv(d.actual_sales, d.actual_customer_count),
        custVariance: d.actual_customer_count - d.last_year_customer_count,
      };
    });
    const totals = dayRows.reduce(
      (a, d) => ({
        last_year_sales: a.last_year_sales + d.last_year_sales,
        salesTarget: a.salesTarget + d.salesTarget,
        actual_sales: a.actual_sales + d.actual_sales,
        salesVariance: a.salesVariance + d.salesVariance,
        last_year_customer_count: a.last_year_customer_count + d.last_year_customer_count,
        actual_customer_count: a.actual_customer_count + d.actual_customer_count,
        custVariance: a.custVariance + d.custVariance,
        dessert_count: a.dessert_count + d.dessert_count,
      }),
      { last_year_sales: 0, salesTarget: 0, actual_sales: 0, salesVariance: 0, last_year_customer_count: 0, actual_customer_count: 0, custVariance: 0, dessert_count: 0 },
    );
    const lyAvgTicketTotal = safeDiv(totals.last_year_sales, totals.last_year_customer_count);
    const actualAvgTicketTotal = safeDiv(totals.actual_sales, totals.actual_customer_count);
    return { dayRows, totals, lyAvgTicketTotal, actualAvgTicketTotal };
  }, [rows, targetPct]);

  const variancePct = computed.totals.salesTarget ? (computed.totals.salesVariance / computed.totals.salesTarget) * 100 : 0;
  const avgTicketGoal = Number(target?.avg_ticket_goal ?? 0);
  const avgTicketVariance = computed.actualAvgTicketTotal - avgTicketGoal;

  const years = [currentYear - 1, currentYear, currentYear + 1];
  const weeksForPeriod = weeksInPeriod(period);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Daily Sales Activity</h1>
          <p className="text-sm text-muted-foreground">
            {data?.locations.find((l) => l.id === data.locationId)?.name ?? "—"} · FY{fiscalYear} · Period {period} · Week {fiscalWeek}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Filter label="Location">
            <Select value={locationId ?? data?.locationId ?? ""} onValueChange={(v) => setLocationId(v)}>
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {(data?.locations ?? []).map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header text-table-header-foreground">
                {["DAYS", "LY SALES", "TARGET", "ACTUAL SALES", "VAR SALES", "LY AVG", "ACTUAL AVG", "LY CUST", "ACTUAL CUST", "VAR CUST", "DESSERT MONTH"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (<tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>)}
              {!isLoading && computed.dayRows.map((d, i) => (
                <tr key={d.business_date} className={i % 2 === 1 ? "bg-table-row-alt" : "bg-card"}>
                  <td className="px-3 py-2 text-left font-medium">{d.dayName}<div className="text-xs text-muted-foreground">{d.business_date}</div></td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(d.last_year_sales)}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(d.salesTarget)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(d.actual_sales)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${d.salesVariance >= 0 ? "text-success" : "text-destructive"}`}>{fmtCurrency(d.salesVariance)}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(d.lyAvgTicket)}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(d.actualAvgTicket)}</td>
                  <td className="px-3 py-2 text-right">{fmtInt(d.last_year_customer_count)}</td>
                  <td className="px-3 py-2 text-right">{fmtInt(d.actual_customer_count)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${d.custVariance >= 0 ? "text-success" : "text-destructive"}`}>{fmtInt(d.custVariance)}</td>
                  <td className="px-3 py-2 text-right">{fmtInt(d.dessert_count)}</td>
                </tr>
              ))}
              <tr className="bg-table-totals text-table-totals-foreground font-semibold">
                <td className="px-3 py-3 text-left">Totals</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(computed.totals.last_year_sales)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(computed.totals.salesTarget)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(computed.totals.actual_sales)}</td>
                <td className={`px-3 py-3 text-right ${computed.totals.salesVariance >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtCurrency(computed.totals.salesVariance)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(computed.lyAvgTicketTotal)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(computed.actualAvgTicketTotal)}</td>
                <td className="px-3 py-3 text-right">{fmtInt(computed.totals.last_year_customer_count)}</td>
                <td className="px-3 py-3 text-right">{fmtInt(computed.totals.actual_customer_count)}</td>
                <td className={`px-3 py-3 text-right ${computed.totals.custVariance >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtInt(computed.totals.custVariance)}</td>
                <td className="px-3 py-3 text-right">{fmtInt(computed.totals.dessert_count)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryBox
          primaryLabel="SALES TARGET"
          primaryValue={fmtCurrency(computed.totals.salesTarget)}
          varianceLabel="VARIANCE"
          varianceValue={fmtCurrency(computed.totals.salesVariance)}
          variancePositive={computed.totals.salesVariance >= 0}
          sub={fmtPct(variancePct)}
        />
        <SummaryBox
          primaryLabel="AVG GOAL"
          primaryValue={fmtCurrency(avgTicketGoal)}
          varianceLabel="VARIANCE"
          varianceValue={fmtCurrency(avgTicketVariance)}
          variancePositive={avgTicketVariance >= 0}
        />
        <SummaryBox
          primaryLabel="LY CUST"
          primaryValue={fmtInt(computed.totals.last_year_customer_count)}
          varianceLabel="VARIANCE"
          varianceValue={fmtInt(computed.totals.custVariance)}
          variancePositive={computed.totals.custVariance >= 0}
        />
      </div>
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

function Kpi({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${positive === undefined ? "text-foreground" : positive ? "text-success" : "text-destructive"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function SummaryBox({
  primaryLabel,
  primaryValue,
  varianceLabel,
  varianceValue,
  variancePositive,
  sub,
}: {
  primaryLabel: string;
  primaryValue: string;
  varianceLabel: string;
  varianceValue: string;
  variancePositive: boolean;
  sub?: string;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] divide-x divide-border">
        <div className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{primaryLabel}</div>
          <div className="mt-1 text-2xl font-bold text-foreground">{primaryValue}</div>
        </div>
        <div className="p-4 min-w-[180px]">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            {varianceLabel}
            <span className={variancePositive ? "text-success" : "text-destructive"}>
              {variancePositive ? "▲" : "▼"}
            </span>
          </div>
          <div className={`mt-1 text-2xl font-bold ${variancePositive ? "text-success" : "text-destructive"}`}>{varianceValue}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}