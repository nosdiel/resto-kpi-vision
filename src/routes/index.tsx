import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, Store } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Sales Activity — Restaurant KPI Dashboard" },
      { name: "description", content: "Executive KPI dashboard for restaurants and bakeries. Track weekly sales targets, customer counts, and Dessert of the Month performance powered by Square." },
      { property: "og:title", content: "Daily Sales Activity" },
      { property: "og:description", content: "Executive KPI dashboard powered by Square." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary-dark text-primary-foreground">
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs uppercase tracking-wider">
          <BarChart3 className="h-3.5 w-3.5" /> Executive KPI Dashboard
        </div>
        <h1 className="mt-6 text-5xl font-bold leading-tight">Daily Sales Activity</h1>
        <p className="mt-4 max-w-2xl text-lg opacity-90">
          A modern weekly KPI dashboard for restaurants and bakeries. Compare actual vs target vs last year — every day, every location — synced from Square.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg" variant="secondary"><Link to="/auth">Sign in</Link></Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent text-primary-foreground border-white/30 hover:bg-white/10"><Link to="/dashboard">Open dashboard</Link></Button>
        </div>
        <div className="mt-16 grid sm:grid-cols-3 gap-6">
          {[
            { icon: TrendingUp, title: "Weekly variance at a glance", body: "Sales, average ticket, and customer count vs last year and target." },
            { icon: Store, title: "Multi-location", body: "Filter by location, fiscal period and week — admins manage everything." },
            { icon: BarChart3, title: "Square-powered", body: "Nightly sync of orders, totals, and item-level Dessert of the Month counts." },
          ].map((f, i) => (
            <div key={i} className="rounded-xl bg-white/5 backdrop-blur p-5 border border-white/10">
              <f.icon className="h-5 w-5 mb-3" />
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm opacity-80 mt-1">{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
