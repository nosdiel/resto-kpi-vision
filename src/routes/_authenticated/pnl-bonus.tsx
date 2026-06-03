import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
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
  { pct: 102, payout: 120 },
  { pct: 103, payout: 130 },
  { pct: 104, payout: 140 },
  { pct: 105, payout: 150 },
  { pct: 106, payout: 160 },
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
  const [annualSalary, setAnnualSalary] = useState<string>("");
  const [salesTarget, setSalesTarget] = useState<string>("");
  const [actualSales, setActualSales] = useState<string>("");
  const [bonusPctOfSalary, setBonusPctOfSalary] = useState<string>("15");
  const [payrollMet, setPayrollMet] = useState<boolean>(true);
  const [foodCostMet, setFoodCostMet] = useState<boolean>(true);

  const result = useMemo(() => {
    const salary = (parseFloat(annualSalary) || 0) / 4; // quarterly salary
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

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Annual Salary</Label>
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
            />
          </div>
          <div className="space-y-2">
            <Label>Actual Quarter Sales</Label>
            <Input
              type="number"
              value={actualSales}
              onChange={(e) => setActualSales(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={payrollMet}
              onCheckedChange={(v) => setPayrollMet(v === true)}
            />
            <span>Payroll % target met</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={foodCostMet}
              onCheckedChange={(v) => setFoodCostMet(v === true)}
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