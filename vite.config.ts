// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Firebase App Hosting needs a Node HTTP server listening on process.env.PORT.
// When BUILD_TARGET=firebase, force nitro to the `node-server` preset and emit
// to `.output/` so `node .output/server/index.mjs` boots a real Node listener.
// Outside Lovable's sandbox builds, these nitro overrides take effect; inside
// the Lovable build the preset stays Cloudflare (see config docs).
const isFirebase = process.env.BUILD_TARGET === "firebase";

export default defineConfig({
  tanstackStart: isFirebase
    ? {
        // Use TanStack Start's default server entry (Node HTTP listener).
        // The Cloudflare `{ fetch }` wrapper in src/server.ts is Workers-only.
      }
    : {
        // Redirect TanStack Start's bundled server entry to src/server.ts
        // (our SSR error wrapper). nitro/vite builds from this for Cloudflare.
        server: { entry: "server" },
      },
  nitro: isFirebase
    ? {
        preset: "node-server",
        output: {
          dir: ".output",
          publicDir: ".output/public",
          serverDir: ".output/server",
        },
      }
    : undefined,
});
