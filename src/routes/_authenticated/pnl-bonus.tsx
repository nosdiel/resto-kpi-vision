import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, Fragment } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getQtrReport } from "@/lib/pnl.functions";
import { currentFiscalYearWeek } from "@/lib/fiscal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pnl-bonus")({
  head: () => ({ meta: [{ title: "Bonus Calculator" }] }),
  component: BonusCalculatorPage,
});

// Payout multiplier table based on Sales Target % achievement.
// Mirrors the QTR bonus structure spreadsheet.
const PAYOUT_TABLE: Array<{ pct: number; payout: number }> = [
  { pct: 95, payout: 0 },
  { pct: 96, payout: 50 },
  { pct: 97, payout: 60 },
  { pct: 98, payout: 70 },
  { pct: 99, payout: 80 },
  { pct: 100, payout: 100 },
  { pct: 105, payout: 130 },
  { pct: 110, payout: 150 },
  { pct: 130, payout: 170 },
];

function lookupPayoutPct(salesPct: number): number {
  if (salesPct < 95) return 0;
  let match = 0;
  for (const row of PAYOUT_TABLE) {
    if (salesPct >= row.pct) match = row.payout;
  }
  return match;
}

function BonusCalculatorPage() {
  const initial = currentFiscalYearWeek();
  const currentYear = new Date().getUTCFullYear();
  const defaultQuarter = Math.min(4, Math.max(1, Math.ceil(Math.max(1, initial.fiscalWeek - 1) / 13)));

  const [fiscalYear, setFiscalYear] = useState(initial.fiscalYear);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [locationId, setLocationId] = useState<string | null>(null);

  const [annualSalary, setAnnualSalary] = useState<string>("");
  const [salesTarget, setSalesTarget] = useState<string>("");
  const [actualSales, setActualSales] = useState<string>("");
  const [bonusPctOfSalary, setBonusPctOfSalary] = useState<string>("15");
  const [payrollMet, setPayrollMet] = useState<boolean>(true);
  const [foodCostMet, setFoodCostMet] = useState<boolean>(true);
  const [autoPull, setAutoPull] = useState<boolean>(true);

  const fetchQtr = useServerFn(getQtrReport);
  const { data: qtr, isFetching } = useQuery({
    queryKey: ["bonus-qtr", locationId, fiscalYear, quarter],
    queryFn: () => fetchQtr({ data: { locationId, fiscalYear, quarter } }),
    enabled: autoPull,
  });

  const locations = (qtr?.locations ?? []) as { id: string; name: string }[];

  // QTD totals from the report
  const qtdTotals = useMemo(() => {
    const rows = qtr?.rows ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.salesGoal += r.sales.goal;
        acc.salesActual += r.sales.actual;
        acc.payrollGoal += r.payroll.goal;
        acc.payrollActual += r.payroll.actual;
        acc.foodGoal += r.food.goal;
        acc.foodActual += r.food.actual;
        return acc;
      },
      { salesGoal: 0, salesActual: 0, payrollGoal: 0, payrollActual: 0, foodGoal: 0, foodActual: 0 },
    );
  }, [qtr]);

  // Auto-populate fields from the QTR report
  useEffect(() => {
    if (!autoPull || !qtr?.rows?.length) return;
    setSalesTarget(qtdTotals.salesGoal.toFixed(2));
    setActualSales(qtdTotals.salesActual.toFixed(2));
    // payroll/food are "met" when actual is at or under goal (lower is better)
    setPayrollMet(qtdTotals.payrollActual <= qtdTotals.payrollGoal);
    setFoodCostMet(qtdTotals.foodActual <= qtdTotals.foodGoal);
  }, [autoPull, qtr, qtdTotals]);

  const result = useMemo(() => {
    const input = parseFloat(annualSalary) || 0;
    const isAssistantManager = bonusPctOfSalary === "7.5";
    // Assistant Manager: input is hourly rate -> quarterly = hourly * 40 hrs * 13 weeks
    // Store Manager: input is annual salary -> quarterly = annual / 4
    const salary = isAssistantManager ? input * 40 * 13 : input / 4;
    const target = parseFloat(salesTarget) || 0;
    const actual = parseFloat(actualSales) || 0;
    const basePct = parseFloat(bonusPctOfSalary) || 0;

    const salesPct = target > 0 ? (actual / target) * 100 : 0;
    const payoutPct = lookupPayoutPct(salesPct);
    const gateMet = payrollMet && foodCostMet;
    const baseBonus = salary * (basePct / 100);
    const fullBonus = baseBonus * (payoutPct / 100);
    const bonus = gateMet ? fullBonus : fullBonus * 0.4;

    return { salesPct, payoutPct, baseBonus, fullBonus, bonus, gateMet };
  }, [annualSalary, salesTarget, actualSales, bonusPctOfSalary, payrollMet, foodCostMet]);

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bonus Calculator</h1>
        <p className="text-sm text-muted-foreground">
          Store manager bonus: 15% of QTR salary (annual ÷ 4) at 100% sales target, scaled by
          payout table. If payroll or food cost targets are missed, bonus is
          reduced to 40%.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Pull from QTR Report</Label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox checked={autoPull} onCheckedChange={(v) => setAutoPull(v === true)} />
            <span>Auto-fill sales & gates {isFetching ? "…" : ""}</span>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location</Label>
            <Select
              value={locationId ?? qtr?.locationId ?? ""}
              onValueChange={(v) => setLocationId(v)}
            >
              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
                {!locations.length && <SelectItem value="none" disabled>No locations</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fiscal Year</Label>
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quarter</Label>
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {autoPull && qtr?.rows?.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
            <div className="text-muted-foreground">Payroll QTD: <span className={`font-medium ${qtdTotals.payrollActual <= qtdTotals.payrollGoal ? "text-foreground" : "text-destructive"}`}>{fmtCurrency(qtdTotals.payrollActual)} / {fmtCurrency(qtdTotals.payrollGoal)}</span></div>
            <div className="text-muted-foreground">Food QTD: <span className={`font-medium ${qtdTotals.foodActual <= qtdTotals.foodGoal ? "text-foreground" : "text-destructive"}`}>{fmtCurrency(qtdTotals.foodActual)} / {fmtCurrency(qtdTotals.foodGoal)}</span></div>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{bonusPctOfSalary === "7.5" ? "Hourly Rate" : "Annual Salary"}</Label>
            <Input
              type="number"
              value={annualSalary}
              onChange={(e) => setAnnualSalary(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={bonusPctOfSalary}
              onValueChange={(v) => setBonusPctOfSalary(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">Store Manager</SelectItem>
                <SelectItem value="7.5">Assistant Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quarter Sales Target</Label>
            <Input
              type="number"
              value={salesTarget}
              onChange={(e) => setSalesTarget(e.target.value)}
              placeholder="0.00"
              disabled={autoPull}
            />
          </div>
          <div className="space-y-2">
            <Label>Actual Quarter Sales</Label>
            <Input
              type="number"
              value={actualSales}
              onChange={(e) => setActualSales(e.target.value)}
              placeholder="0.00"
              disabled={autoPull}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={payrollMet}
              onCheckedChange={(v) => setPayrollMet(v === true)}
              disabled={autoPull}
            />
            <span>Payroll % target met</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={foodCostMet}
              onCheckedChange={(v) => setFoodCostMet(v === true)}
              disabled={autoPull}
            />
            <span>Food cost % target met</span>
          </label>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sales Target %</span>
          <span className="font-medium">{result.salesPct.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Payout % of Target</span>
          <span className="font-medium">{result.payoutPct}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Base bonus (at 100%)</span>
          <span className="font-medium">{fmtCurrency(result.baseBonus)}</span>
        </div>
        {!result.gateMet && (
          <div className="flex justify-between text-sm text-destructive">
            <span>Payroll or food cost target missed</span>
            <span>-60% penalty applied</span>
          </div>
        )}
        <div className="flex justify-between text-lg">
          <span className="font-semibold">Bonus payout</span>
          <span className="font-bold text-primary">{fmtCurrency(result.bonus)}</span>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold mb-3">Payout Table</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="font-medium text-muted-foreground">Sales Target %</div>
          <div className="font-medium text-muted-foreground">Payout %</div>
          <div>&lt; 95%</div><div>0%</div>
          {PAYOUT_TABLE.map((r) => (
            <Fragment key={r.pct}>
              <div>{r.pct}%</div>
              <div>{r.payout}%</div>
            </Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}