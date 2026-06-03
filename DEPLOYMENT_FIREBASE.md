# Deployment Guide — Firebase App Hosting

This app is a **TanStack Start SSR** project. The build emits:

- `dist/client/` — static assets (JS, CSS, images, fonts)
- `dist/server/server.js` — the SSR server entry

Firebase **App Hosting** (not classic Firebase Hosting) is the right product
because it runs a Node.js server backend on Cloud Run alongside a CDN for
static assets. Classic Firebase Hosting is static-only and cannot run your
server functions / SSR — do not use it.

> ⚠️ **Important caveat about this repo.** The current `dist/server/server.js`
> is built by `@lovable.dev/vite-tanstack-config` with the nitro
> `cloudflare-module` preset — it exports a Cloudflare Workers
> `{ default: { fetch } }` module, NOT a Node HTTP server. Firebase App
> Hosting runs Node.js on Cloud Run and expects a `node`-runnable entry that
> listens on `process.env.PORT`. You MUST switch the nitro preset to
> `node-server` (or `node`) before App Hosting will work. See section 7
> ("Production fork notes") for the exact change.

---

## 1. Prerequisites

- Node.js 20+ and npm
- A Firebase project on the **Blaze (pay-as-you-go)** plan — App Hosting
  requires Blaze
- Firebase CLI: `npm i -g firebase-tools` (need >= 13.15 for App Hosting)
- `firebase login` once to authenticate
- A GitHub repo containing this project (App Hosting deploys from GitHub)

---

## 2. Switch nitro preset to Node (required)

In your fork, replace the Lovable Vite wrapper so nitro emits a Node server
entry instead of a Cloudflare Worker. Edit `vite.config.ts`:

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
        entry: "server",
        preset: "node-server", // <-- key change for Firebase App Hosting
      },
    }),
    viteReact(),
  ],
});
```

Install the upstream deps and drop the Lovable wrapper:

```bash
npm i -D @tanstack/react-start @vitejs/plugin-react @tailwindcss/vite vite-tsconfig-paths nitropack
npm rm @lovable.dev/vite-tanstack-config @lovable.dev/cloud-auth-js
```

Also update `src/server.ts` — the Cloudflare-shaped `{ fetch }` default export
is not used by the Node preset. The nitro `node-server` preset wraps the
TanStack Start handler in an HTTP listener automatically; you can usually
delete the custom wrapper entirely and let nitro generate the entry. If you
want to keep the error-page wrapper, expose it as standard h3/Node middleware
rather than a Workers `fetch` handler.

After this change, `npm run build` should produce a runnable Node server
(typically `.output/server/index.mjs` from nitro, plus `.output/public/` for
static assets). The exact paths depend on the preset — confirm with
`ls -R .output` after a build.

---

## 3. `apphosting.yaml`

Place this at the repo root. It configures the App Hosting backend:

```yaml
# Firebase App Hosting backend config
# Docs: https://firebase.google.com/docs/app-hosting/configure
runConfig:
  # Cloud Run instance sizing
  cpu: 1
  memoryMiB: 512
  maxInstances: 10
  minInstances: 0
  concurrency: 80

# Public environment variables (committed to git, available at build + runtime)
env:
  - variable: VITE_SUPABASE_URL
    value: https://YOUR-PROJECT-REF.supabase.co
    availability:
      - BUILD
      - RUNTIME
  - variable: VITE_SUPABASE_PUBLISHABLE_KEY
    value: eyJhbGc...your-anon-key
    availability:
      - BUILD
      - RUNTIME
  - variable: VITE_SUPABASE_PROJECT_ID
    value: YOUR-PROJECT-REF
    availability:
      - BUILD
      - RUNTIME
  - variable: SUPABASE_URL
    value: https://YOUR-PROJECT-REF.supabase.co
    availability:
      - RUNTIME
  - variable: SUPABASE_PUBLISHABLE_KEY
    value: eyJhbGc...your-anon-key
    availability:
      - RUNTIME

  # Secrets — reference Secret Manager entries (see section 5)
  - variable: SUPABASE_SERVICE_ROLE_KEY
    secret: SUPABASE_SERVICE_ROLE_KEY
    availability:
      - RUNTIME
```

Notes:
- `availability: BUILD` is required for `VITE_*` vars because Vite inlines
  them at build time.
- `availability: RUNTIME` makes them readable via `process.env` inside server
  functions on Cloud Run.
- Use `secret:` (not `value:`) for anything sensitive — it pulls from Google
  Secret Manager at deploy time and never lands in git.

---

## 4. `firebase.json`

Minimal config so the Firebase CLI knows about the App Hosting backend.
If you already have a `firebase.json`, merge the `apphosting` key in.

```json
{
  "apphosting": {
    "backendId": "your-backend-id",
    "rootDir": "/",
    "ignore": ["node_modules", ".git", "firebase-debug.log", "dist", ".output"]
  }
}
```

And add the project alias in `.firebaserc`:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

---

## 5. Secrets (Google Secret Manager)

Anything sensitive — service role keys, third-party API keys — goes into
Secret Manager and is referenced from `apphosting.yaml`.

```bash
# Create / update a secret
firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY
# paste value when prompted

# Grant the App Hosting backend permission to read it
firebase apphosting:secrets:grantaccess SUPABASE_SERVICE_ROLE_KEY \
  --backend your-backend-id
```

Audit which secrets the code actually reads:

```bash
grep -rn "process\.env\." src/
```

Every name returned should either appear in `apphosting.yaml` under `env:`
(public values) or be created via `apphosting:secrets:set` and referenced
with `secret:` in `apphosting.yaml`.

Common ones in this repo:

| Name | Where |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager (admin client bypasses RLS) |
| `LOVABLE_API_KEY` | Secret Manager — only if you keep Lovable AI Gateway calls |
| `SQUARE_ACCESS_TOKEN` | Secret Manager — only if Square integration is used |

---

## 6. Create the backend and deploy

### One-time: create the App Hosting backend

From the repo root:

```bash
firebase apphosting:backends:create \
  --project your-firebase-project-id \
  --location us-central1
```

This walks you through:
1. Connecting your GitHub repo (you'll be redirected to authorize Firebase).
2. Picking a branch (typically `main`) for auto-deploys.
3. Choosing a backend ID — this becomes part of the default URL:
   `https://<backend-id>--<project-id>.<region>.hosted.app`.

Once linked, every push to the connected branch triggers a build (using
`npm ci && npm run build`) and a Cloud Run rollout.

### Manual deploy (without pushing to GitHub)

```bash
firebase deploy --only apphosting
```

### Smoke tests

```bash
BASE=https://<backend-id>--<project-id>.<region>.hosted.app

curl -I $BASE/
# expect: 200 OK, content-type: text/html

curl -I $BASE/favicon.ico
# expect: 200 OK, served from CDN

curl -I $BASE/some-deep-route
# expect: 200 OK, SSR HTML (not 404)
```

### Logs

```bash
# Tail Cloud Run logs for the backend
firebase apphosting:backends:logs your-backend-id --project your-firebase-project-id
```

Or open Cloud Run → your service → **Logs** in the Google Cloud console.

---

## 7. Build settings

App Hosting auto-detects Node projects and runs:

```
npm ci
npm run build
npm run start         # if a start script exists
```

Make sure `package.json` has:

```json
{
  "scripts": {
    "build": "vite build",
    "start": "node .output/server/index.mjs"
  }
}
```

The exact `start` command depends on what the `node-server` nitro preset
emits — check `.output/` after a local `npm run build` and point `start` at
the generated entry. App Hosting sets `PORT` automatically; nitro's
node-server entry already listens on `process.env.PORT`.

---

## 8. Custom Domain (incl. GoDaddy)

1. Firebase Console → **App Hosting** → your backend → **Domains** → **Add custom domain**.
2. Enter `yourdomain.com` (and add `www.yourdomain.com` as a second domain if you want both).
3. Firebase shows DNS records to add — typically:
   - **A** records on the apex pointing to Firebase's IPs
   - **TXT** record for domain verification
   - **CNAME** for `www` pointing to a `*.hosted.app` target
4. In GoDaddy → **My Products** → **Domains** → your domain → **DNS** → **Manage Zones**:
   - Delete conflicting `A` / `CNAME` records on `@` and `www`.
   - Add the records exactly as Firebase shows them. TTL 1 hour is fine.
5. Back in Firebase, click **Verify**. Status goes *Pending* → *Connected*
   (a few minutes to ~1 hour). SSL is auto-provisioned.

If you'd rather manage DNS in Cloudflare (better cache + easier TXT/ACME),
move GoDaddy's nameservers to Cloudflare first, then add the same Firebase
records there.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "preset cloudflare-module" output | `vite.config.ts` still uses the Lovable wrapper. Switch to `preset: "node-server"` per section 2. |
| Cloud Run container fails to start / "no process listening on PORT" | Your start command isn't pointing at the nitro node entry. Verify `.output/server/index.mjs` exists locally and update `package.json` `start`. |
| `process is not defined` / `Buffer is not defined` | You're still building with the Cloudflare preset. Node preset has these globally. |
| Static assets 404 | Nitro node preset serves `.output/public` automatically. If you deleted it, re-run `npm run build`. |
| Auth works locally, breaks in prod | `VITE_SUPABASE_*` vars don't have `availability: [BUILD]` in `apphosting.yaml`. Vite needs them at build time. |
| Service-role calls fail in prod | `SUPABASE_SERVICE_ROLE_KEY` not created in Secret Manager, or backend service account lacks read access. Re-run `apphosting:secrets:grantaccess`. |
| 404 on every route | Your start command is serving only static files. Make sure it boots the SSR server, not `serve dist/client`. |
| Need to roll back | Firebase Console → App Hosting → your backend → **Rollouts** → pick a previous rollout → **Promote**. |

---

## 10. Summary checklist

- [ ] Firebase project on Blaze plan
- [ ] `vite.config.ts` switched to `preset: "node-server"` (Lovable wrapper removed)
- [ ] `package.json` has a `start` script pointing at the nitro node entry
- [ ] `apphosting.yaml` at repo root with `env:` + `secret:` entries
- [ ] `firebase.json` + `.firebaserc` committed
- [ ] Secrets created via `firebase apphosting:secrets:set` + access granted
- [ ] `firebase apphosting:backends:create` run once, GitHub repo linked
- [ ] Push to `main` → backend builds and deploys
- [ ] Custom domain DNS configured at GoDaddy and verified in Firebase