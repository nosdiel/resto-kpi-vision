import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/locations")({
  component: () => <div className="p-8 text-muted-foreground">Locations admin — coming in next iteration.</div>,
});