import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/square")({
  component: () => <div className="p-8 text-muted-foreground">Square Sync setup — coming in next iteration.</div>,
});