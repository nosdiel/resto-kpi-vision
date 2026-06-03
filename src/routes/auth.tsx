import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Daily Sales Activity" }] }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.navigate({ to: "/dashboard" });
    });
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.navigate({ to: "/dashboard" }); });
    return () => subscription.unsubscribe();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally { setLoading(false); }
  };

  const googleSignIn = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-foreground">Daily Sales Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in to view your KPI dashboard</p>
        <form onSubmit={submit} className="space-y-4 mt-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : "Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={googleSignIn}>Continue with Google</Button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Accounts are created by an administrator. Contact your admin for access.
        </p>
        <p className="mt-4 text-xs text-center text-muted-foreground">
          <Link to="/" className="hover:underline">Back home</Link>
        </p>
      </Card>
    </div>
  );
}