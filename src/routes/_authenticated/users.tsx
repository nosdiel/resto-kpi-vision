import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/users")({
  component: () => <div className="p-8 text-muted-foreground">Users & roles admin — coming in next iteration.</div>,
});