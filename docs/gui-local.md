# Local GUI

Launch the local Product Development Harness GUI for guided Settings / Configure setup.

## Start

```bash
npm run harness:gui
```

Alias:

```bash
npm run harness:configure
```

Default bind: `http://127.0.0.1:3000/settings/configure`

If port `3000` is busy, the launcher auto-picks the next available port.

## Port configuration

- CLI: `npm run harness:gui -- --port 3333`
- Env: `HARNESS_GUI_PORT=3333 npm run harness:gui`
- Host: `HARNESS_GUI_HOST=127.0.0.1` (default)
- Repo root: `HARNESS_REPO_ROOT` is set automatically by `harness:gui`; setup files are resolved from the harness repo root, not `apps/gui`.

## Scope (Milestone 4)

The GUI is local-first and supports guided local setup:

- setup state summary
- guided environment and target-repo forms
- redacted preview before apply
- explicit confirmation before local file writes
- apply `.env.local` and `.harness/config.local.json` through setup core only
- missing setup steps and local/static doctor summary

It does **not** write GitHub Actions secrets, target repo workflows, Linear issues, cloud workflow dispatches, or harness phases.

Remote harness secret writes and target workflow branch/PR installs are available in the **Remote setup** section — see [`docs/gui-remote-setup.md`](gui-remote-setup.md).

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
