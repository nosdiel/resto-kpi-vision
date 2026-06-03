import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/desserts")({
  component: () => <div className="p-8 text-muted-foreground">Dessert of the Month config — coming in next iteration.</div>,
});