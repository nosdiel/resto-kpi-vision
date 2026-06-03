import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, MapPin, Target, IceCream, Plug, Utensils, Users, LogOut, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  const items = [
    { to: "/dashboard", label: "Daily Sales", icon: LayoutDashboard },
    { to: "/pnl", label: "Weekly PNL", icon: Receipt },
    { to: "/targets", label: "Targets", icon: Target },
    { to: "/locations", label: "Locations", icon: MapPin },
    { to: "/desserts", label: "Dessert of Month", icon: IceCream },
    { to: "/square", label: "Square Sync", icon: Plug },
    { to: "/toast", label: "Toast Sync", icon: Utensils },
    { to: "/users", label: "Users", icon: Users },
  ];
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-sm uppercase tracking-wider opacity-60">KPI Dashboard</div>
          <div className="text-lg font-semibold">Daily Sales Activity</div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent transition"
              activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary" }}
            >
              <it.icon className="h-4 w-4" /> {it.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}