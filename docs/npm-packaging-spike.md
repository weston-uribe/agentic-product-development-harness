# npm packaging spike (`p-dev`)

**Status:** unpublished packaging spike — **not** publicly available on npm.

This document describes the local proof of concept for a future operator experience:

```bash
npx p-dev
```

That public command is **not** shipped yet. This spike validates packaging and launch mechanics only.

## What is implemented

- A dedicated unpublished package boundary at [`packages/p-dev/`](../packages/p-dev/).
- A `p-dev` executable that:
  - fails early when Node.js is below 22
  - resolves operator workspace data under `P_DEV_HOME`, `--workspace`, or `~/.p-dev`
  - seeds safe template files without overwriting existing operator files
  - starts the existing Configure GUI from a packed artifact
  - opens the Configure route in the default browser on **macOS** using `open`
  - reports the selected URL and uses deterministic port scanning from port 3000
  - shuts down cleanly on normal termination signals

## What is not implemented

- npm publication or package-name reservation
- Linux/Windows browser launching (`xdg-open`, `cmd /c start`, etc.)
- GitHub sign-in, private repo creation, automatic Node installation, Electron, or onboarding redesign

## Maintainer validation

From a clean repository checkout:

```bash
npm ci
npm run build
npm test
npm run test:webhook
npm run package:p-dev:pack
npm run package:p-dev:inspect
```

Packed tarball validation from a clean temporary directory:

```bash
TARBALL="/absolute/path/to/repo/packages/p-dev/p-dev-0.0.0.tgz"
WORKDIR=$(mktemp -d)
export P_DEV_HOME="$WORKDIR/workspace"
cd "$WORKDIR"
npx --yes "file:$TARBALL" --no-open
```

Equivalent explicit package form:

```bash
npx --yes -p "$TARBALL" p-dev --no-open
```

On npm 10, the bare tarball path (`npx --yes /path/to/p-dev-0.0.0.tgz`) is not accepted; use the `file:` URL form above to prove the future `npx p-dev` install path.

In another terminal, verify the printed Configure URL:

```bash
curl -fsS "http://localhost:3000/settings/configure" | head
```

Stop the process, then rerun the same `npx --yes ...` command against the same `P_DEV_HOME` to confirm operator files are preserved.

## Source-development path unchanged

Existing repo-local commands remain the source-development path:

- `npm run harness:gui`
- `npm run harness:configure`
- `npm run harness:configure:stable`

## Remaining before real publication

- Cross-platform browser launch policy
- Dependency and bundle size optimization for install time
- Stable versioning, release process, and npm publication approval
- Broader onboarding/product decisions beyond this launch-path spike
