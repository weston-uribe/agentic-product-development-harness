# Local GUI

Launch the Product Development Harness GUI for guided setup and workflow operations.

## Canonical start

From the source repository:

```bash
npm run dev
```

From anywhere (after `npm run p-dev:install` in the source checkout):

```bash
p-dev
```

PDev automatically opens Initial Harness Configuration until setup is complete, then opens the Workflow page.

## Useful flags

```bash
p-dev --workspace ~/.p-dev
p-dev --no-open
p-dev --port 3000 --host localhost
```

## Compatibility scripts (deprecated)

These still delegate to the same launcher but print a deprecation notice:

- `npm run harness:gui`
- `npm run harness:configure`
- `npm run harness:configure:stable`

Prefer `npm run dev`.

## Troubleshooting

If the page looks unstyled, stop the server and run `npm run dev` again. The launcher performs one automatic `apps/gui/.next` cleanup when a styling health check fails.

For GitHub Codespaces and remote port forwarding, see [`docs/gui-remote-setup.md`](gui-remote-setup.md).

## Restore published package command

To switch back from a source-linked `p-dev` to the published package:

```bash
npm unlink -g agentic-product-development-harness
npx --yes p-dev-harness@0.4.0
```
