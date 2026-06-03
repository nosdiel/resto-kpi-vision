import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pnl")({
  head: () => ({ meta: [{ title: "Weekly PNL" }] }),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/pnl" || location.pathname === "/pnl/") {
      throw redirect({ to: "/pnl/$quarter", params: { quarter: "q1" } });
    }
  },
  component: PnlLayout,
});

function PnlLayout() {
  return <Outlet />;
}

export function QuarterTabs({ current }: { current: "q1" | "q2" | "q3" | "q4" }) {
  const tabs: Array<{ id: "q1" | "q2" | "q3" | "q4"; label: string }> = [
    { id: "q1", label: "Q1 (wk 1–13)" },
    { id: "q2", label: "Q2 (wk 14–26)" },
    { id: "q3", label: "Q3 (wk 27–39)" },
    { id: "q4", label: "Q4 (wk 40–52)" },
  ];
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {tabs.map((t) => (
        <Link
          key={t.id}
          to="/pnl/$quarter"
          params={{ quarter: t.id }}
          className={`px-3 py-1.5 rounded-md text-sm border transition ${
            current === t.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground hover:bg-muted border-border"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}