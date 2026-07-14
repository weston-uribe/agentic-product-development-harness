# Release process

Operator guide for harness releases: GitHub source release plus public npm package `p-dev-harness`.

**Related:** [`v0.3.0.md`](v0.3.0.md) (current release contract), [`v0.2.0.md`](v0.2.0.md) (historical), [`CHANGELOG.md`](../../CHANGELOG.md), [`docs/p-dev.md`](../p-dev.md)

## Summary

The release process has distinct phases:

1. **Release-preparation PR** — versions, docs, tests, release contract (no tag/npm/release mutations)
2. **Embedded workspace snapshot validation** — deterministic snapshot/manifest generation from `RELEASE_SHA`, tarball inspection
3. **Exact tarball validation** — build and smoke-test `p-dev-harness-<version>.tgz` at `RELEASE_SHA`
4. **npm publication** — publish the exact validated tarball (human-gated)
5. **Annotated git tag** — primary `v<version>` at `RELEASE_SHA` (human-gated)
6. **GitHub release** — curated notes from `docs/releases/v<version>.md` (human-gated)
7. **Post-release finalization PR** — record immutable tag/npm evidence

Do **not** push directly to `main`, force-push, overwrite tags, or republish npm versions.

### Legacy template containment (v0.3.0 only)

`weston-uribe/p-dev-harness-template` is a **frozen legacy compatibility artifact** for `p-dev-harness@0.3.0` template-based provisioning.

For **0.3.1 and later**:

- Do **not** advance, repurpose, or resync the template repository `main` branch for new package versions.
- Do **not** move or recreate the existing template `v0.3.0` tag.
- Snapshot transparency comes from the primary repository release commit plus the npm tarball `workspace-snapshot/manifest.json`.

---

## Phase 1 — Release-preparation PR

Merge to `main`:

- Version bumps (`0.3.0` root, `p-dev-harness@0.3.0`)
- `CHANGELOG.md`, `docs/releases/v0.3.0.md`, truth-audit docs
- Package publication metadata and tests
- Validation on the PR branch

**Do not run during the release-prep PR:**

- `git tag`, `git push` (tags)
- `npm publish`
- `gh release create`
- Live remote setup mutations

---

## Phase 2 — Embedded workspace snapshot validation

After primary release-prep PR merges:

1. Record `RELEASE_SHA` (merge commit on `main`)
2. From a clean checkout at `RELEASE_SHA`, run:

```bash
npm ci
npm run build
P_DEV_SNAPSHOT_SOURCE_REF="$RELEASE_SHA" npm run package:p-dev:prepare
npm run package:p-dev:pack
```

3. Inspect `packages/p-dev/workspace-snapshot/manifest.json`:
   - `packageVersion` matches `packages/p-dev/package.json`
   - `sourceCommit` equals `RELEASE_SHA`
   - `snapshotSha256`, `snapshotContentId`, and `gitRootTreeSha1` are present
4. Inspect the packed tarball:
   - Contains `package/workspace-snapshot/manifest.json` and curated `package/workspace-snapshot/files/**`
   - Excludes local secrets, operator state, generated caches, and unrelated generated package outputs
5. Record tarball byte size and SHA-256 for release evidence

**Do not** mutate `weston-uribe/p-dev-harness-template` for 0.3.1+ releases.

---

## Phase 3 — npm preflight

Before publication:

```bash
npm config get registry
npm whoami --registry=https://registry.npmjs.org/
npm view p-dev-harness --registry=https://registry.npmjs.org/ --json
npm view p-dev-harness@0.3.0 --registry=https://registry.npmjs.org/ --json
```

**Stop** if:

- Not authenticated or not authorized to publish
- `p-dev-harness@0.3.0` already exists
- Package name is owned by someone else

Never print tokens, OTPs, or secrets.

---

## Phase 4 — Exact tarball and validation

At `RELEASE_SHA` in a clean working tree:

```bash
git checkout RELEASE_SHA
npm ci
npm run build
npm test
npm run test:webhook
npm run package:p-dev:pack
npm run package:p-dev:inspect
```

Record tarball bytes, SHA-1, SHA-256, manifest, unpacked size, file count.

Tarball smoke:

```bash
TARBALL="packages/p-dev/p-dev-harness-0.3.0.tgz"
WORKDIR=$(mktemp -d)
export P_DEV_HOME="$WORKDIR/workspace"
cd "$WORKDIR"
npx --yes "file:/absolute/path/to/$TARBALL" --no-open
# verify /settings/configure HTTP 200, stop, relaunch with same P_DEV_HOME
```

Dry-run publish:

```bash
npm publish packages/p-dev/p-dev-harness-0.3.0.tgz --dry-run --access public --registry=https://registry.npmjs.org/
```

---

## Phase 5 — npm publication

Publish the **exact already-tested tarball** (do not rebuild between smoke and publish):

```bash
npm publish packages/p-dev/p-dev-harness-0.3.0.tgz --access public --registry=https://registry.npmjs.org/
```

If npm requests OTP, enter it interactively. **Never** place OTP or token in files, commands reported in PRs, or logs.

Verify:

```bash
npm view p-dev-harness@0.3.0 name version dist-tags.latest dist.shasum dist.integrity engines bin repository license
```

Registry smoke from fresh directory:

```bash
WORKDIR=$(mktemp -d)
export P_DEV_HOME="$WORKDIR/workspace"
cd "$WORKDIR"
npx --yes p-dev-harness@0.3.0 --no-open
```

---

## Phase 6 — Primary tag and GitHub release

**After** npm publication verification:

```bash
git tag -a v0.3.0 RELEASE_SHA -m "v0.3.0"
git rev-parse v0.3.0^{}   # must equal RELEASE_SHA
git push origin v0.3.0
```

Verify remote tag resolves to `RELEASE_SHA`.

Create GitHub release:

```bash
gh release create v0.3.0 \
  --title "v0.3.0 — Guided setup, canonical skills, and p-dev" \
  --notes-file docs/releases/v0.3.0.md \
  --latest
```

- Do **not** use `--generate-notes` as primary body
- Do **not** mark prerelease unless an actual blocker requires it
- Do **not** overwrite an existing tag (`git tag -f`, `git push --force`)

If npm succeeds but GitHub release fails: **do not republish**. Recover tag/release against the same `RELEASE_SHA`.

---

## Phase 7 — Post-release finalization PR

Branch `docs/finalize-v0.3.0-release`:

- Update `docs/releases/v0.3.0.md` with tagged/published status, URLs, SHAs, registry shasum/integrity, tarball metadata, template SHA, registry smoke result, timestamp
- Do **not** change released package contents or version

Merge after checks pass.

---

## V0.3.0 — exact commands (reference)

```bash
# After release-prep PR merge
RELEASE_SHA=$(git rev-parse origin/main)
git checkout main && git pull --ff-only origin main

# Validate at release commit
git checkout "$RELEASE_SHA"
npm ci && npm run build && npm test && npm run test:webhook
npm run package:p-dev:pack && npm run package:p-dev:inspect

# npm preflight + publish (interactive OTP if required)
npm whoami --registry=https://registry.npmjs.org/
npm view p-dev-harness@0.3.0 --registry=https://registry.npmjs.org/
npm publish packages/p-dev/p-dev-harness-0.3.0.tgz --access public --registry=https://registry.npmjs.org/

# Tag and release
git tag -a v0.3.0 "$RELEASE_SHA" -m "v0.3.0"
git push origin v0.3.0
gh release create v0.3.0 \
  --title "v0.3.0 — Guided setup, canonical skills, and p-dev" \
  --notes-file docs/releases/v0.3.0.md \
  --latest
```

---

## V0.2.0 — historical commands

V0.2.0 was source-release only (no npm). See [`v0.2.0.md`](v0.2.0.md) for the historical contract.

---

## Operator notes

### Root repo vs npm package

| Artifact | `private` | Published |
|----------|-----------|-----------|
| Root `agentic-product-development-harness` | `true` | GitHub source release only |
| `packages/p-dev` (`p-dev-harness`) | no | Public npm |

### What not to run during release-doc PRs

- `git tag`, `git push` (tags)
- `npm publish`
- `gh release create`
- Live `harness:run` against production issues
- Linear writes
- Secret inspection, printing, or rotation in reports
