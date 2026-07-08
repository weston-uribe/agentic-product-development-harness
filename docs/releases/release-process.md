# Release process

Operator guide for creating git tags and GitHub releases for this harness repo.

**This is a GitHub source release process.** The repo is `private: true` and is not published to npm. `package.json` version is a source-release marker only.

**Related:** [`v0.2.0.md`](v0.2.0.md) (release contract), [`CHANGELOG.md`](../../CHANGELOG.md)

## Summary

The release process is intentionally separate from the release-doc PR.

First, merge the release documentation and version bump to `main`. Then verify the merge commit, create an annotated tag, push the tag, and create the GitHub release from the curated release notes.

---

## When to tag

Only **after**:

1. The release-doc PR (changelog, release contract, truth-audit docs, version bump) merges to `main`
2. Required checks are green on the merge commit: `test`, `Analyze (javascript-typescript)`

Do **not** create tags or GitHub releases inside the release-doc PR.

---

## V0.2.0 — exact commands

Run from a clean local clone with push access:

```bash
git checkout main
git pull --ff-only origin main
git fetch --tags origin
git rev-parse -q --verify refs/tags/v0.2.0 && echo "Tag exists; stop" && exit 1 || true
npm ci
npm run build
npm test
npm run test:webhook
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0" --notes-file docs/releases/v0.2.0.md --latest
```

After publishing the GitHub release, open a small follow-up PR that changes the **Tag status** in [`v0.2.0.md`](v0.2.0.md) from **Not yet tagged** to **Tagged**.

---

## Operator notes

### Tag existence preflight

Before `git tag`:

```bash
git fetch --tags origin
git rev-parse -q --verify refs/tags/v0.2.0
```

If the tag already exists, **stop and inspect**. Do not overwrite or force-update the tag (`git tag -f`, `git push --force`).

### Release notes

- **Do not** use `--generate-notes` as the primary release notes — the release contract in [`v0.2.0.md`](v0.2.0.md) is curated.
- You may derive a shorter summary for the GitHub release body, but the contract doc is the canonical source.

### Prerelease

- **Do not** pass `--prerelease` unless explicitly decided that V0.2.0 is not stable enough for a latest release.

### Annotated tag vs `gh release create`

- Prefer creating an **explicit annotated tag first** (`git tag -a`).
- If you run `gh release create` without an existing tag, the GitHub CLI may create a lightweight tag automatically — avoid that path.

### Draft releases / immutability

If the repository has release immutability enabled, draft releases can be useful before publishing. Do not add this complexity unless repo settings require it.

---

## What not to run during the release-doc PR

- `git tag`, `git push` (tags)
- `gh release create`
- `workflow_dispatch`, `repository_dispatch`
- Live `harness:run` or harness phases against production issues
- Linear writes
- GitHub settings / ruleset / allowlist changes
- Secret inspection, printing, rotation, or changes

---

## Future releases

For releases after V0.2.0:

1. Update `CHANGELOG.md` and create `docs/releases/vX.Y.Z.md`
2. Bump `package.json` / `package-lock.json` version in a release-doc PR
3. Merge, verify checks, run the same preflight + validation + tag + `gh release create` pattern with the new version
