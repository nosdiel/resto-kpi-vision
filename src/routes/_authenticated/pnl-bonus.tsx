import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pnl-bonus")({
  head: () => ({ meta: [{ title: "Bonus Calculator" }] }),
  component: BonusCalculatorPage,
});

function BonusCalculatorPage() {
  const [netSales, setNetSales] = useState<string>("");
  const [targetProfit, setTargetProfit] = useState<string>("");
  const [actualProfit, setActualProfit] = useState<string>("");
  const [bonusPct, setBonusPct] = useState<string>("10");

  const result = useMemo(() => {
    const tp = parseFloat(targetProfit) || 0;
    const ap = parseFloat(actualProfit) || 0;
    const pct = parseFloat(bonusPct) || 0;
    const over = Math.max(0, ap - tp);
    const bonus = over * (pct / 100);
    return { over, bonus };
  }, [targetProfit, actualProfit, bonusPct]);

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bonus Calculator</h1>
        <p className="text-sm text-muted-foreground">
          Calculate manager bonus based on profit performance vs. target.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Net Sales</Label>
            <Input
              type="number"
              value={netSales}
              onChange={(e) => setNetSales(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Bonus % of profit over target</Label>
            <Input
              type="number"
              value={bonusPct}
              onChange={(e) => setBonusPct(e.target.value)}
              placeholder="10"
            />
          </div>
          <div className="space-y-2">
            <Label>Target Profit</Label>
            <Input
              type="number"
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Actual Profit</Label>
            <Input
              type="number"
              value={actualProfit}
              onChange={(e) => setActualProfit(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Profit over target</span>
          <span className="font-medium">{fmtCurrency(result.over)}</span>
        </div>
        <div className="flex justify-between text-lg">
          <span className="font-semibold">Bonus payout</span>
          <span className="font-bold text-primary">{fmtCurrency(result.bonus)}</span>
        </div>
      </Card>
    </div>
  );
}