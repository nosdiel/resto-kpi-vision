import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, MapPin, Target, IceCream, Plug, Utensils, Users, LogOut, Receipt, Shield, Menu, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyPermissions } from "@/lib/permissions.functions";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  const fetchPerms = useServerFn(getMyPermissions);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session?.access_token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session?.access_token);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const { data: me } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => fetchPerms(),
    enabled: hasSession,
    retry: false,
  });
  const allowed = new Set(me?.permissions ?? []);
  const allItems = [
    { key: "dashboard", to: "/dashboard", label: "Daily Sales", icon: LayoutDashboard },
    { key: "pnl", to: "/pnl", label: "Weekly PNL", icon: Receipt },
    { key: "targets", to: "/targets", label: "Targets", icon: Target },
    { key: "locations", to: "/locations", label: "Locations", icon: MapPin },
    { key: "desserts", to: "/desserts", label: "Dessert of Month", icon: IceCream },
    { key: "square", to: "/square", label: "Square Sync", icon: Plug },
    { key: "toast", to: "/toast", label: "Toast Sync", icon: Utensils },
    { key: "users", to: "/users", label: "Users", icon: Users },
    { key: "permissions", to: "/permissions", label: "Role Permissions", icon: Shield },
  ];
  const items = allItems.filter((it) => allowed.has(it.key));
  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 border-b border-sidebar-border">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-2 rounded-md hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold">Daily Sales Activity</div>
        <div className="w-9" />
      </header>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-64 md:w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 ease-out`}
      >
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between">
          <div>
            <div className="text-sm uppercase tracking-wider opacity-60">KPI Dashboard</div>
            <div className="text-lg font-semibold">Daily Sales Activity</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden p-2 -mr-2 rounded-md hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              onClick={() => setMobileOpen(false)}
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

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}