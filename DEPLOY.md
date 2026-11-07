# Deploy Hidden Partner

One Cloudflare Worker serves the website and the room Durable Object. Friends open the `*.workers.dev` link. There is no offline mode.

Nothing in this repository is a Cloudflare token. `wrangler login` stores the login in your user profile, outside the repo. Do not paste an API token into a file here.

`pnpm deploy` is a pnpm command that packs a workspace, so it will not upload the game. The upload command is `pnpm run deploy`.

## One-time login

Open PowerShell in the repository folder.

```powershell
cd apps\server
pnpm exec wrangler login
```

A browser opens. Approve the login for your free Cloudflare account, then return to PowerShell. Check it:

```powershell
pnpm exec wrangler whoami
```

## Set the public address

After the first upload, Wrangler prints a URL like `https://hidden-partner.<account>.workers.dev`. Put that origin in `apps/server/wrangler.toml`:

```toml
[vars]
PUBLIC_SITE_URL = "https://hidden-partner.<account>.workers.dev"
```

No path and no trailing slash. The build reads this one value and writes it into the Open Graph and Twitter image URLs. The invite link, the copy button, the QR code, and WhatsApp use it too. Leave it as `""` only for a local trial. An empty value keeps preview images relative, which chat apps will not fetch.

Change the value, then run `pnpm run deploy` again so the built page picks it up.

## Deploy

From the repository folder:

```powershell
pnpm run deploy
```

That runs the unit tests, builds the web app, bundles the Worker, and uploads only if the tests pass. The browser Playwright suite is separate (`pnpm e2e`). It is not part of deploy.

The first successful upload prints the `*.workers.dev` address. Set `PUBLIC_SITE_URL` to it and deploy once more before you share the link.

Then, still from the repository folder:

```powershell
pnpm smoke -- https://hidden-partner.<account>.workers.dev
```

The script creates a room, seats five players, plays one round, and prints `PASS` or `FAIL`. It does not print seeds or secrets.

## Logs

From `apps\server`:

```powershell
pnpm exec wrangler tail
```

This streams the live Worker logs. Stop it with Ctrl+C. Room secrets are not written to those logs on purpose. Do not add a log line that prints a secret, a seed, or a hand.

## Roll back

From `apps\server`, list recent versions:

```powershell
pnpm exec wrangler versions list
```

Roll back to the version that was live before the latest upload:

```powershell
pnpm exec wrangler rollback --message "Roll back to the previous version"
```

Or pick a version id from the list:

```powershell
pnpm exec wrangler rollback <VERSION_ID> --message "Roll back"
```

A rollback switches traffic immediately. It does not change saved rooms. Do not roll back across a Durable Object migration that removed or renamed the `RoomServer` class.

## A custom domain later

1. Add the domain to the same Cloudflare account.
2. In `apps/server/wrangler.toml`, add:

```toml
[[routes]]
pattern = "play.example.com"
custom_domain = true
```

3. Set `PUBLIC_SITE_URL` to `https://play.example.com`.
4. From the repository folder, run `pnpm run deploy` again.

Wrangler creates the DNS record when the zone is on this account. Share links and the preview image then use the new name.

## What the Worker is doing

- `apps/web/dist` is served as static files. `/r/<CODE>` falls back to `index.html`, so a refresh stays on the table.
- `/api/*` and `/parties/*` run the Worker. WebSocket rooms stay on the PartyServer path.
- `RoomServer` is created with `new_sqlite_classes`, which is the free-plan Durable Object storage. The room still uses `ctx.storage.get`, `put`, and alarms. Those methods work on SQLite-backed objects, so the saved match did not move to a new storage API.
- WebSocket hibernation is on. An idle room can sleep while its sockets stay connected, and the match is loaded again from storage when someone plays.
- The 128-bit shuffle seed is drawn with `crypto.getRandomValues` in the Worker. The deal runs there. The web bundle is refused if it includes the deal or the seed generator.
- Source maps are off for the site build and are not uploaded for the Worker.
- Hashed files under `/assets/` are cached for a year. `index.html`, including a refreshed `/r/<CODE>` page, is `no-cache`. API responses are `no-store`. Pages send `nosniff`, a referrer policy, a frame denial, a locked-down permissions policy, and a content security policy.

## Local production-style check

This does not upload anything.

```powershell
pnpm build
cd apps\server
pnpm exec wrangler dev --port 8787
```

Open `http://127.0.0.1:8787`. In another PowerShell window, from the repository folder:

```powershell
pnpm smoke -- http://127.0.0.1:8787
```

Stop Wrangler with Ctrl+C. `pnpm dev` is the hot-reload setup (Vite plus the Worker) and is separate from this check.
