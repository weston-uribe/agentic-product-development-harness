import { createHash } from "node:crypto";
import type { WorkspaceSnapshotManifestFile } from "./workspace-snapshot-types.js";
import { computeGitTreeSha1 } from "./workspace-snapshot-git.js";

export function computeSnapshotFileSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function sortSnapshotManifestFiles(
  files: WorkspaceSnapshotManifestFile[],
): WorkspaceSnapshotManifestFile[] {
  return [...files].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
}

export function computeSnapshotSha256(
  files: WorkspaceSnapshotManifestFile[],
): string {
  const sorted = sortSnapshotManifestFiles(files);
  const hash = createHash("sha256");
  for (const file of sorted) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(String(file.size));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function computeSnapshotContentId(input: {
  packageVersion: string;
  sourceCommit: string;
  snapshotSha256: string;
}): string {
  return createHash("sha256")
    .update(input.packageVersion)
    .update("\0")
    .update(input.sourceCommit)
    .update("\0")
    .update(input.snapshotSha256)
    .digest("hex");
}

export function computeSnapshotRootTreeSha1(
  files: WorkspaceSnapshotManifestFile[],
): string {
  const childrenByDir = new Map<
    string,
    Array<{ name: string; mode: string; sha1: string }>
  >();

  for (const file of files) {
    const segments = file.path.split("/");
    const name = segments.pop();
    if (!name) {
      throw new Error(`Invalid snapshot file path: ${file.path}`);
    }
    const dir = segments.join("/");
    if (!childrenByDir.has(dir)) {
      childrenByDir.set(dir, []);
    }
    childrenByDir.get(dir)!.push({
      name,
      mode: file.mode,
      sha1: file.gitBlobSha1,
    });
  }

  const allDirs = new Set<string>(["", ...childrenByDir.keys()]);
  for (const dir of childrenByDir.keys()) {
    const parts = dir.split("/").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      allDirs.add(parts.slice(0, index).join("/"));
    }
  }

  const treeShaByDir = new Map<string, string>();
  const sortedDirs = [...allDirs].sort(
    (left, right) =>
      right.split("/").filter(Boolean).length -
      left.split("/").filter(Boolean).length,
  );

  for (const dir of sortedDirs) {
    const directChildren = childrenByDir.get(dir) ?? [];
    const entries: Array<{ mode: string; path: string; sha1: string }> = [];

    for (const otherDir of allDirs) {
      if (otherDir === dir) {
        continue;
      }
      const parent = otherDir.includes("/")
        ? otherDir.slice(0, otherDir.lastIndexOf("/"))
        : "";
      if (parent !== dir) {
        continue;
      }
      const name = dir ? otherDir.slice(dir.length + 1) : otherDir;
      if (name.includes("/")) {
        continue;
      }
      const subTreeSha = treeShaByDir.get(otherDir);
      if (!subTreeSha) {
        throw new Error(`Missing subtree SHA for ${otherDir}`);
      }
      entries.push({ mode: "040000", path: name, sha1: subTreeSha });
    }

    const subdirNames = new Set(entries.map((entry) => entry.path));
    for (const child of directChildren) {
      if (!subdirNames.has(child.name)) {
        entries.push({
          mode: child.mode,
          path: child.name,
          sha1: child.sha1,
        });
      }
    }

    treeShaByDir.set(dir, computeGitTreeSha1(entries));
  }

  const rootSha = treeShaByDir.get("");
  if (!rootSha) {
    throw new Error("Snapshot root tree SHA could not be computed.");
  }
  return rootSha;
}
