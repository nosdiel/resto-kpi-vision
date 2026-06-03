import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing you in…" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errDesc =
          url.searchParams.get("error_description") || url.searchParams.get("error");

        if (errDesc) throw new Error(errDesc);

        if (code) {
          // PKCE / authorization code flow
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            window.location.href,
          );
          if (exchangeError) throw exchangeError;
        } else if (window.location.hash.includes("access_token")) {
          // Implicit flow — supabase-js parses the hash automatically; just wait for session.
          await supabase.auth.getSession();
        }

        const { data } = await supabase.auth.getUser();
        if (cancelled) return;

        if (data.user) {
          router.navigate({ to: "/dashboard", replace: true });
        } else {
          router.navigate({ to: "/auth", replace: true });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    };

    finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Sign-in failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <a href="/auth" className="mt-4 inline-block text-sm underline">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        )}
      </div>
    </div>
  );
}