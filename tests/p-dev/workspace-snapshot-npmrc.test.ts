import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeGitBlobSha1, computeSnapshotRootTreeSha1 } from "../../src/p-dev/git-object-plumbing.js";
import {
  computeSnapshotContentId,
  computeSnapshotSha256,
} from "../../src/p-dev/workspace-snapshot-digest.js";
import { buildWorkspaceSnapshotManifest } from "../../src/p-dev/workspace-snapshot-manifest.js";
import { loadWorkspaceSnapshotEntryContent } from "../../src/p-dev/workspace-snapshot-generator.js";
import {
  listGitTreeEntries,
  readGitBlobContents,
  resolveGitCommit,
  selectSnapshotTreeEntries,
} from "../../src/p-dev/workspace-snapshot-git.js";
import {
  ALLOWED_NPMRC_SNAPSHOT_BYTES,
  assertAllowedNpmrcSnapshotEntry,
  assertRequiredSnapshotPaths,
  isIncludedSnapshotPath,
  PACKAGED_STORAGE_PREFIX,
  resolveSnapshotLegacyOutputPath,
  resolveSnapshotOutputPath,
  resolveSnapshotStoragePath,
  WORKSPACE_SNAPSHOT_POLICY,
} from "../../src/p-dev/workspace-snapshot-policy.js";
import { validateEmbeddedSnapshotFiles } from "../../src/p-dev/workspace-snapshot-validation.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const EXPECTED_NPMRC = "legacy-peer-deps=true\n";

const SECRET_BEARING_NPMRC_PATTERNS = [
  /_auth(Token)?\s*=/i,
  /\/\/[^:]+:_password\s*=/i,
  /\/\/[^:]+:_authToken\s*=/i,
  /authToken/i,
  /always-auth\s*=\s*true/i,
  /registry\s*=\s*https?:\/\/[^\s]*:[^\s]+@/i,
  /BEGIN (RSA |OPENSSH )?PRIVATE KEY/,
  /sk-[a-z0-9-]+/i,
  /pk-lf-/i,
  /sk-lf-/i,
];

function assertNpmrcIsNonSecret(contents: string): void {
  expect(contents).toBe(EXPECTED_NPMRC);
  for (const pattern of SECRET_BEARING_NPMRC_PATTERNS) {
    expect(contents).not.toMatch(pattern);
  }
}

describe("workspace snapshot .npmrc contract", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("requires and includes .npmrc in the snapshot policy", () => {
    expect(WORKSPACE_SNAPSHOT_POLICY.requiredPaths).toContain(".npmrc");
    expect(WORKSPACE_SNAPSHOT_POLICY.includeFiles).toContain(".npmrc");
    expect(isIncludedSnapshotPath(".npmrc")).toBe(true);
    expect(resolveSnapshotStoragePath(".npmrc")).toBe(`${PACKAGED_STORAGE_PREFIX}npmrc`);
  });

  it("selects the committed .npmrc into the workspace snapshot selection", async () => {
    const sourceCommit = await resolveGitCommit(repoRoot, "HEAD");
    const treeEntries = await listGitTreeEntries(repoRoot, sourceCommit);
    const selected = selectSnapshotTreeEntries(treeEntries);
    const selectedPaths = selected.map((entry) => entry.path);

    expect(selectedPaths).toContain(".npmrc");
    assertRequiredSnapshotPaths(selectedPaths);

    const npmrcEntries = selected.filter((entry) => entry.path === ".npmrc");
    expect(npmrcEntries).toHaveLength(1);
    const [npmrcBlob] = await readGitBlobContents(repoRoot, npmrcEntries);
    assertNpmrcIsNonSecret(npmrcBlob.content.toString("utf8"));
  });

  it("enforces the exact-byte .npmrc allowlist", () => {
    assertAllowedNpmrcSnapshotEntry({
      type: "file",
      mode: "100644",
      content: ALLOWED_NPMRC_SNAPSHOT_BYTES,
    });

    expect(() =>
      assertAllowedNpmrcSnapshotEntry({
        type: "file",
        mode: "100644",
        content: Buffer.from("legacy-peer-deps=true", "utf8"),
      }),
    ).toThrow(/exactly legacy-peer-deps=true/);

    expect(() =>
      assertAllowedNpmrcSnapshotEntry({
        type: "file",
        mode: "100644",
        content: Buffer.from("//registry.npmjs.org/:_authToken=secret\n", "utf8"),
      }),
    ).toThrow(/exactly legacy-peer-deps=true/);

    expect(() =>
      assertAllowedNpmrcSnapshotEntry({
        type: "symlink",
        mode: "120000",
        content: ALLOWED_NPMRC_SNAPSHOT_BYTES,
      }),
    ).toThrow(/must be a file/);
  });

  it("writes .npmrc into encoded storage with only non-secret npm config", async () => {
    const sourceCommit = await resolveGitCommit(repoRoot, "HEAD");
    const treeEntries = await listGitTreeEntries(repoRoot, sourceCommit);
    const npmrcTree = selectSnapshotTreeEntries(treeEntries).find(
      (entry) => entry.path === ".npmrc",
    );
    expect(npmrcTree).toBeDefined();
    const [npmrcBlob] = await readGitBlobContents(repoRoot, [npmrcTree!]);
    const content = npmrcBlob.content;
    assertNpmrcIsNonSecret(content.toString("utf8"));

    const snapshotRoot = await mkdtemp(path.join(tmpdir(), "p-dev-npmrc-snapshot-"));
    tempDirs.push(snapshotRoot);
    const encodedDestination = resolveSnapshotOutputPath(snapshotRoot, ".npmrc");
    const legacyDestination = resolveSnapshotLegacyOutputPath(snapshotRoot, ".npmrc");
    await mkdir(path.dirname(encodedDestination), { recursive: true });
    await writeFile(encodedDestination, content);

    const managedWorkspace = await mkdtemp(path.join(tmpdir(), "p-dev-managed-ws-"));
    tempDirs.push(managedWorkspace);
    await writeFile(path.join(managedWorkspace, ".npmrc"), content);

    const manifest = buildWorkspaceSnapshotManifest({
      packageVersion: "0.4.0-test",
      sourceCommit,
      entries: [
        {
          path: ".npmrc",
          type: "file",
          mode: "100644",
          size: content.byteLength,
          content,
          gitBlobSha1: computeGitBlobSha1(content),
        },
      ],
    });

    expect(manifest.files.some((file) => file.path === ".npmrc")).toBe(true);
    expect(await readFile(encodedDestination, "utf8")).toBe(EXPECTED_NPMRC);
    await expect(access(legacyDestination)).rejects.toThrow();
    expect(await readFile(path.join(managedWorkspace, ".npmrc"), "utf8")).toBe(
      EXPECTED_NPMRC,
    );
    assertNpmrcIsNonSecret(await readFile(path.join(managedWorkspace, ".npmrc"), "utf8"));
  });

  it("keeps manifest digests independent of encoded storage paths", async () => {
    const sourceCommit = await resolveGitCommit(repoRoot, "HEAD");
    const treeEntries = await listGitTreeEntries(repoRoot, sourceCommit);
    const npmrcTree = selectSnapshotTreeEntries(treeEntries).find(
      (entry) => entry.path === ".npmrc",
    );
    expect(npmrcTree).toBeDefined();
    const [npmrcBlob] = await readGitBlobContents(repoRoot, [npmrcTree!]);
    const content = npmrcBlob.content;

    const manifest = buildWorkspaceSnapshotManifest({
      packageVersion: "0.4.0-test",
      sourceCommit,
      entries: [
        {
          path: ".npmrc",
          type: "file",
          mode: "100644",
          size: content.byteLength,
          content,
          gitBlobSha1: computeGitBlobSha1(content),
        },
      ],
    });

    expect(manifest.files[0]?.path).toBe(".npmrc");
    expect(computeSnapshotSha256(manifest.files)).toBe(manifest.snapshotSha256);
    expect(computeSnapshotRootTreeSha1(manifest.files)).toBe(manifest.gitRootTreeSha1);
    expect(
      computeSnapshotContentId({
        packageVersion: manifest.packageVersion,
        sourceCommit: manifest.sourceCommit,
        snapshotSha256: manifest.snapshotSha256,
      }),
    ).toBe(manifest.snapshotContentId);
    expect(resolveSnapshotStoragePath(".npmrc")).not.toBe(".npmrc");
  });

  it("loads .npmrc from encoded storage, legacy storage, and rejects ambiguity", async () => {
    const sourceCommit = await resolveGitCommit(repoRoot, "HEAD");
    const treeEntries = await listGitTreeEntries(repoRoot, sourceCommit);
    const npmrcTree = selectSnapshotTreeEntries(treeEntries).find(
      (entry) => entry.path === ".npmrc",
    );
    expect(npmrcTree).toBeDefined();
    const [npmrcBlob] = await readGitBlobContents(repoRoot, [npmrcTree!]);
    const content = npmrcBlob.content;
    const manifest = buildWorkspaceSnapshotManifest({
      packageVersion: "0.4.0-test",
      sourceCommit,
      entries: [
        {
          path: ".npmrc",
          type: "file",
          mode: "100644",
          size: content.byteLength,
          content,
          gitBlobSha1: computeGitBlobSha1(content),
        },
      ],
    });
    const npmrcFile = manifest.files.find((file) => file.path === ".npmrc");
    expect(npmrcFile).toBeDefined();

    const snapshotRoot = await mkdtemp(path.join(tmpdir(), "p-dev-npmrc-load-"));
    tempDirs.push(snapshotRoot);
    const encodedDestination = resolveSnapshotOutputPath(snapshotRoot, ".npmrc");
    const legacyDestination = resolveSnapshotLegacyOutputPath(snapshotRoot, ".npmrc");
    await mkdir(path.dirname(encodedDestination), { recursive: true });

    await writeFile(encodedDestination, content);
    const encodedLoaded = await loadWorkspaceSnapshotEntryContent({
      snapshotRoot,
      path: ".npmrc",
      expectedSha256: npmrcFile!.sha256,
    });
    expect(encodedLoaded.toString("utf8")).toBe(EXPECTED_NPMRC);

    await rm(encodedDestination);
    await mkdir(path.dirname(legacyDestination), { recursive: true });
    await writeFile(legacyDestination, content);
    const legacyLoaded = await loadWorkspaceSnapshotEntryContent({
      snapshotRoot,
      path: ".npmrc",
      expectedSha256: npmrcFile!.sha256,
    });
    expect(legacyLoaded.toString("utf8")).toBe(EXPECTED_NPMRC);

    await writeFile(encodedDestination, content);
    await writeFile(legacyDestination, Buffer.from("legacy-peer-deps=false\n", "utf8"));
    await expect(
      loadWorkspaceSnapshotEntryContent({
        snapshotRoot,
        path: ".npmrc",
        expectedSha256: npmrcFile!.sha256,
      }),
    ).rejects.toThrow(/Ambiguous workspace snapshot representations/);
  });

  it("validates embedded snapshots that store .npmrc under encoded storage", async () => {
    const sourceCommit = await resolveGitCommit(repoRoot, "HEAD");
    const treeEntries = await listGitTreeEntries(repoRoot, sourceCommit);
    const npmrcTree = selectSnapshotTreeEntries(treeEntries).find(
      (entry) => entry.path === ".npmrc",
    );
    expect(npmrcTree).toBeDefined();
    const [npmrcBlob] = await readGitBlobContents(repoRoot, [npmrcTree!]);
    const content = npmrcBlob.content;
    const manifest = buildWorkspaceSnapshotManifest({
      packageVersion: "0.4.0-test",
      sourceCommit,
      entries: [
        {
          path: ".npmrc",
          type: "file",
          mode: "100644",
          size: content.byteLength,
          content,
          gitBlobSha1: computeGitBlobSha1(content),
        },
      ],
    });

    const snapshotRoot = await mkdtemp(path.join(tmpdir(), "p-dev-npmrc-validate-"));
    tempDirs.push(snapshotRoot);
    await mkdir(path.join(snapshotRoot, "files", PACKAGED_STORAGE_PREFIX), {
      recursive: true,
    });
    await writeFile(
      resolveSnapshotOutputPath(snapshotRoot, ".npmrc"),
      content,
    );
    await writeFile(
      path.join(snapshotRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const result = await validateEmbeddedSnapshotFiles({
      snapshotRoot,
      manifest,
    });
    expect(result).toEqual({ ok: true });
  });
});
