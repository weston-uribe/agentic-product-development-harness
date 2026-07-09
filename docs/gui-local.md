# Local GUI

Launch the local Product Development Harness GUI for read-only Settings / Configure views.

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

## Scope (Milestone 3)

The GUI is local-first and read-only:

- setup state summary
- config source preview
- redacted generated previews
- missing setup steps
- local/static doctor summary

It does **not** write local files, GitHub secrets, target repo workflows, Linear issues, or harness phases.

## Security

- Secrets are never stored in browser `localStorage`.
- Secret values are never returned to the browser or printed in GUI logs.
- Setup action previews use setup-core redaction before crossing the server boundary.

## Design system

The GUI uses Tailwind CSS v4 and shadcn/ui:

- `apps/gui/components/ui/` — generated shadcn primitives
- `apps/gui/components/custom/` — harness-specific reusable components
- `apps/gui/lib/constants/` — layout, spacing, and responsive tokens
- `apps/gui/styles/globals.css` — semantic theme variables

Use named token constants for layout and responsive patterns. Do not scatter arbitrary Tailwind values across page JSX.

## Related

- [`docs/operator-config.md`](operator-config.md)
- [`docs/getting-started.md`](getting-started.md)
- [`docs/design/product-development-harness-gui.md`](design/product-development-harness-gui.md)
