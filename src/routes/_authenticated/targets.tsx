import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/targets")({
  component: () => <div className="p-8 text-muted-foreground">Targets admin — coming in next iteration. Schema and server functions are ready.</div>,
});