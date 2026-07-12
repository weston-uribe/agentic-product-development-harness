# Local GUI

Launch the local Product Development Harness GUI for guided Settings / Configure setup.

## Canonical local testing (recommended)

Run the stable dev server in **your own terminal** (not a read-only agent terminal):

```bash
npm run harness:configure:stable
```

Open:

**http://localhost:3000/settings/configure**

This is the operator-facing convention for M6 Configure GUI testing. `localhost` and `127.0.0.1` are equivalent loopback hosts, but this harness standardizes on **`localhost:3000`**.

`harness:configure:stable` will:

1. Stop stale Next.js GUI dev servers on ports **3000** and **3001** when they look like harness GUI processes.
2. Refuse to start if port **3000** is occupied by a **non-GUI** process (clear error instead of switching ports).
3. Start Next.js dev on **`localhost:3000`** without silently falling back to another port.
4. Run a lightweight health check on `/settings/configure` and verify Next.js CSS assets load.
5. If the page would render unstyled (missing `/_next/static` CSS), delete only **`apps/gui/.next`** and restart **once**.

### If the page looks unstyled

1. Stop the dev server (`Ctrl+C`).
2. Run `npm run harness:configure:stable` again — it cleans `apps/gui/.next` when the health check detects broken static assets.
3. Hard-refresh the browser on **http://localhost:3000/settings/configure**.

Do **not** delete source files, `.env`, `.env.local`, `.harness/config.local.json`, backups, or secrets.

## GitHub Codespaces

Keep the dev server running in one terminal (do not Ctrl+C it). In another terminal, verify:

```bash
curl -I http://127.0.0.1:3000/settings/configure
```

That should return `HTTP/1.1 200 OK`.

Start the GUI for port forwarding:

```bash
npm run harness:configure -- --host 0.0.0.0 --port 3000
```

Open the app from the **Ports** panel (globe icon on port **3000**), not by guessing the URL. Set port visibility to **Public** if the forwarded link fails. Append `/settings/configure` if needed.

Next.js 15 blocks unknown dev origins by default. This repo allows `*.app.github.dev` in `apps/gui/next.config.ts` (`allowedDevOrigins`). Restart the dev server after changing that file.

## Quick start (auto port fallback)

```bash
npm run harness:gui
```

Alias:

```bash
npm run harness:configure
```

Default bind: `http://localhost:3000/settings/configure`

If port `3000` is busy, the quick launcher auto-picks the next available port. For repeatable operator testing, prefer **`npm run harness:configure:stable`** instead.

## Port configuration

- Stable canonical server: `npm run harness:configure:stable` (fixed `localhost:3000`)
- CLI override (quick launcher): `npm run harness:gui -- --port 3333`
- Env: `HARNESS_GUI_PORT=3333 npm run harness:gui`
- Host: `HARNESS_GUI_HOST=localhost` (default)
- Repo root: `HARNESS_REPO_ROOT` is set automatically by GUI launchers; setup files are resolved from the harness repo root, not `apps/gui`.

## Scope (Milestone 4+)

The GUI is local-first and supports guided local setup:

- setup state summary
- guided environment and target-repo forms
- redacted preview before apply
- explicit confirmation before local file writes
- apply `.env.local` and `.harness/config.local.json` through setup core only
- missing setup steps and local/static doctor summary

It does **not** write GitHub Actions secrets, target repo workflows, Linear issues, cloud workflow dispatches, or harness phases from the guided flow without explicit remote-setup confirmation.

Remote harness secret writes and target workflow branch/PR installs are available in guided Steps 4–5 and the advanced **Remote setup** section — see [`docs/gui-remote-setup.md`](gui-remote-setup.md).

## Guided local setup flow

1. Open **Settings / Configure**.
2. Edit environment fields (`.env.local`) and target repo config fields (`.harness/config.local.json`).
3. Click **Generate preview** — required before apply.
4. Review redacted `.env.local` preview and config JSON preview.
5. Check the confirmation box and click **Apply local setup files**.

Existing secret values in `.env.local` are shown as **Set** / **Missing** only. Leave a secret field blank to preserve an existing value.

## API routes (local server only)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/setup/summary` | GET | Read-only setup summary |
| `/api/setup/preview-local-files` | POST | Dry-run preview with redaction |
| `/api/setup/apply-local-files` | POST | Confirmation-gated local file writes |

All writes go through setup core (`src/setup/local-apply-actions.ts`). Apply requires `confirmed: true` and a matching preview fingerprint.

## Security

- Secrets are never stored in browser `localStorage`, `sessionStorage`, or query params.
- Existing secret values are never returned to the browser — presence only.
- Newly entered secrets exist only in transient form state and POST bodies.
- Secret values are never printed in GUI logs or API error responses.
- Setup action previews use setup-core redaction before crossing the server boundary.

## Design system

The GUI uses Tailwind CSS v4 and shadcn/ui:

- `apps/gui/components/ui/` — generated shadcn primitives
- `apps/gui/components/custom/` — harness-specific reusable components
- `apps/gui/lib/constants/` — layout, spacing, form, and responsive tokens
- `apps/gui/styles/globals.css` — semantic theme variables

Use named token constants for layout and responsive patterns. Do not scatter arbitrary Tailwind values across page JSX.

## Related

- [`docs/operator-config.md`](operator-config.md)
- [`docs/getting-started.md`](getting-started.md)
- [`docs/design/product-development-harness-gui.md`](design/product-development-harness-gui.md)
