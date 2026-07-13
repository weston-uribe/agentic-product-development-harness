# p-dev (unpublished packaging spike)

This directory holds the **unpublished** `p-dev` npm package boundary for a local packaging proof of concept.

**Status:** spike only — not published to npm. Public `npx p-dev` is not available yet.

## What it proves

- A packed tarball can expose a `p-dev` executable.
- macOS operators can launch the existing Configure GUI without cloning the harness source repo.
- Operator files (`.env.local`, `.harness/config.local.json`) resolve under a durable workspace such as `~/.p-dev` or `P_DEV_HOME`, not inside the npm install directory.
- Packaged guided setup can auto-provision a private `OWNER/p-dev-harness` workspace during Step 1 when `P_DEV_RUNTIME_MODE=packaged` and a classic PAT with `repo` + `workflow` scopes is saved.

## External template prerequisite (operator-owned)

Automatic workspace provisioning uses the public GitHub template repository `weston-uribe/p-dev-harness-template`. That repo must exist, be marked as a GitHub template, and include `.harness/p-dev-template.json` before real-account validation can complete. Automated tests mock all GitHub mutations and do not create real repositories.

## Local validation (maintainers)

From the repository root after `npm run package:p-dev:pack`:

```bash
TMPDIR=$(mktemp -d)
export P_DEV_HOME="$TMPDIR/workspace"
npx --yes "file:/absolute/path/to/packages/p-dev/p-dev-0.0.0.tgz" --no-open
```

Then verify `http://localhost:3000/settings/configure` (or the printed port) responds successfully.

Generated runtime assets under `bin/`, `dist/`, `gui/`, `templates/`, and `*.tgz` are build outputs and must not be committed.
