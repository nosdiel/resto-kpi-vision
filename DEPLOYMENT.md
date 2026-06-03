# Deployment Guide — Cloudflare Workers

This app is a **TanStack Start SSR** project. The build emits:

- `dist/client/` — static assets (JS, CSS, images, fonts)
- `dist/server/server.js` — the SSR Worker entry (a Cloudflare Workers module
  with a `default export { fetch }`)

Deploy target: **Cloudflare Workers with Static Assets** (NOT Cloudflare Pages).
Pages cannot natively run this SSR worker; Workers + Static Assets binding can.

---

## 1. Prerequisites

- Node.js 20+ and npm
- A Cloudflare account
- Wrangler CLI: `npm i -g wrangler` (or use `npx wrangler`)
- `wrangler login` once to authenticate

---

## 2. `wrangler.jsonc`

Place this at the repo root:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "your-app-name",
  "main": "dist/server/server.js",
  "compatibility_date": "2025-05-01",
  "compatibility_flags": ["nodejs_compat"],

  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },

  "observability": {
    "enabled": true
  },

  "vars": {
    "VITE_SUPABASE_URL": "https://YOUR-PROJECT-REF.supabase.co",
    "VITE_SUPABASE_PUBLISHABLE_KEY": "eyJhbGc...your-anon-key",
    "VITE_SUPABASE_PROJECT_ID": "YOUR-PROJECT-REF",
    "SUPABASE_URL": "https://YOUR-PROJECT-REF.supabase.co",
    "SUPABASE_PUBLISHABLE_KEY": "eyJhbGc...your-anon-key"
  }
}
```

Notes:
- `main` points at the SSR Worker entry produced by the build.
- `assets.directory` serves `dist/client` automatically — no asset handling
  code in the Worker is required. Static files (e.g. `/favicon.ico`,
  hashed JS/CSS) are returned by Cloudflare's edge before your Worker runs.
- `not_found_handling: "single-page-application"` ensures that any path that
  doesn't match a static asset falls through to the Worker (SSR), which is
  what TanStack Start needs.
- `nodejs_compat` is required — TanStack Start's server runtime uses Node
  built-ins (`crypto`, `buffer`, `stream`, etc.).
- Replace `your-app-name` with a unique Worker name (becomes
  `your-app-name.<account-subdomain>.workers.dev`).

---

## 3. Environment Variables / Secrets

There are two kinds of config:

### Public (safe to commit in `wrangler.jsonc` under `vars`)

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL, read at build time + runtime |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref |
| `SUPABASE_URL` | Same URL, read by server fns via `process.env` |
| `SUPABASE_PUBLISHABLE_KEY` | Same anon key, read by server fns |

The `VITE_*` versions must also be present **at build time** (in `.env` or
exported in the shell) so Vite can inline them into the client bundle.

### Secrets (NEVER commit — set via `wrangler secret`)

| Name | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (bypasses RLS) — used by `src/integrations/supabase/client.server.ts` |
| `LOVABLE_API_KEY` | Only needed if you keep Lovable AI Gateway calls. Remove if not used. |
| `SQUARE_ACCESS_TOKEN` | Only if Square integration is used |
| any other API keys your server fns read via `process.env` | — |

Set them with:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# paste value when prompted

wrangler secret put SQUARE_ACCESS_TOKEN
# etc.
```

Audit which secrets the code actually reads:

```bash
grep -rn "process\.env\." src/
```

Every name returned must either appear in `wrangler.jsonc` `vars` (public) or
be set via `wrangler secret put` (private).

---

## 4. Build

Local `.env` for the Vite build step:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...your-anon-key
VITE_SUPABASE_PROJECT_ID=YOUR-PROJECT-REF
```

Then:

```bash
npm ci
npm run build
```

Verify output:

```
dist/
├── client/
│   ├── assets/...
│   ├── favicon.ico
│   └── ...
└── server/
    └── server.js
```

If `dist/server/server.js` is missing, the nitro preset is wrong — see
"Production fork notes" at the bottom.

---

## 5. Deploy

```bash
wrangler deploy
```

Wrangler:
1. Uploads `dist/server/server.js` as the Worker script.
2. Uploads `dist/client/**` as static assets, bound as `ASSETS`.
3. Returns a URL like `https://your-app-name.<subdomain>.workers.dev`.

Hit that URL — every route should SSR correctly and static assets should
load from the same origin.

### Smoke tests

```bash
curl -I https://your-app-name.<subdomain>.workers.dev/
# expect: 200 OK, content-type: text/html

curl -I https://your-app-name.<subdomain>.workers.dev/favicon.ico
# expect: 200 OK, served by ASSETS (cf-cache-status header present)

curl -I https://your-app-name.<subdomain>.workers.dev/some-deep-route
# expect: 200 OK, SSR HTML (not 404)
```

### Tail logs

```bash
wrangler tail
```

Combined with the SSR error wrapper in `src/server.ts`, any 500 will print
the captured stack trace here.

---

## 6. Custom Domain on GoDaddy

You have two options. **Option A is strongly recommended** because it gives
you Cloudflare's edge cache, automatic SSL, and the cleanest setup.

### Option A — Move DNS to Cloudflare (recommended)

1. **Add the site to Cloudflare**
   - Cloudflare Dashboard → *Add a Site* → enter `yourdomain.com` → Free plan is fine.
   - Cloudflare will scan existing DNS records. Review them.
   - Cloudflare gives you 2 nameservers, e.g.
     `xxx.ns.cloudflare.com` and `yyy.ns.cloudflare.com`.

2. **Change nameservers at GoDaddy**
   - GoDaddy → *My Products* → *Domains* → your domain → *DNS* → *Nameservers* → *Change*.
   - Choose *Enter my own nameservers* and paste the two Cloudflare nameservers.
   - Save. Propagation: usually < 1 hour, up to 24h.

3. **Attach the domain to the Worker**
   - Cloudflare Dashboard → *Workers & Pages* → your Worker → *Settings* → *Domains & Routes* → *Add* → *Custom Domain*.
   - Enter `yourdomain.com` (and repeat for `www.yourdomain.com` if desired).
   - Cloudflare automatically creates the required DNS records and issues SSL.
   - Status will go from *Pending* → *Active* (a few minutes).

4. **Done.** `https://yourdomain.com` now serves your Worker.

### Option B — Keep DNS at GoDaddy (CNAME to workers.dev)

This works only for subdomains, not the apex (`yourdomain.com`), because
GoDaddy doesn't support CNAME flattening on the root.

1. In GoDaddy DNS, add a record:
   - **Type:** CNAME
   - **Name:** `www` (or `app`, etc.)
   - **Value:** `your-app-name.<subdomain>.workers.dev`
   - **TTL:** 1 hour

2. In Cloudflare Workers → your Worker → *Settings* → *Domains & Routes* → *Add* → *Custom Domain* → enter `www.yourdomain.com`. Cloudflare will verify via the CNAME and issue SSL.

3. For the apex, use GoDaddy's domain forwarding to redirect `yourdomain.com` → `https://www.yourdomain.com`.

---

## 7. Production Fork Notes

This repo currently uses `@lovable.dev/vite-tanstack-config`, which wraps
the upstream TanStack Start Vite plugin and pins the nitro preset to
`cloudflare-module`. That's why the build already emits
`dist/server/server.js` in the right shape for `wrangler deploy`.

When you remove the Lovable wrapper in your external fork, replicate this
in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: {
        entry: "server", // -> src/server.ts (SSR error wrapper)
        preset: "cloudflare-module",
      },
    }),
    viteReact(),
  ],
});
```

Dependencies to add in the fork:

```bash
npm i -D @tanstack/react-start @vitejs/plugin-react @tailwindcss/vite vite-tsconfig-paths nitropack
npm rm @lovable.dev/vite-tanstack-config @lovable.dev/cloud-auth-js
```

Then `npm run build` will produce the same `dist/client` + `dist/server/server.js`
layout this guide assumes.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| 404 on every route | `assets.not_found_handling` missing or set wrong — must be `"single-page-application"`. |
| 500 on every route with `{"unhandled":true,"message":"HTTPError"}` | An env var is missing at runtime. `wrangler tail` to see the real stack (the `src/server.ts` wrapper captures it). |
| `process is not defined` / `Buffer is not defined` | `compatibility_flags` missing `"nodejs_compat"`. |
| Static assets 404 | Build didn't run, or `assets.directory` path is wrong. Re-run `npm run build` and verify `dist/client/` exists. |
| Auth works locally, breaks in prod | `VITE_SUPABASE_*` vars not present at build time. Re-build with them set. |
| Service-role calls fail in prod | `SUPABASE_SERVICE_ROLE_KEY` not set via `wrangler secret put`. |
