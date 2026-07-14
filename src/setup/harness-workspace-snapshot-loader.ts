import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolvePackageRootFromModule,
  resolveWorkspaceSnapshotDirectory,
} from "../p-dev/package-paths.js";
import { readPDevPackageVersionFromPackageRoot } from "../p-dev/package-version.js";
import {
  fingerprintWorkspaceSnapshotManifest,
  parseWorkspaceSnapshotManifestJson,
} from "../p-dev/workspace-snapshot-manifest.js";
import type { WorkspaceSnapshotManifest } from "../p-dev/workspace-snapshot-types.js";
import { validateEmbeddedSnapshotFiles } from "../p-dev/workspace-snapshot-validation.js";

export type EmbeddedWorkspaceSnapshotLoadResult =
  | {
      ok: true;
      packageRoot: string;
      snapshotRoot: string;
      packageVersion: string;
      manifest: WorkspaceSnapshotManifest;
      fingerprint: string;
    }
  | { ok: false; state: "snapshot-unavailable" | "snapshot-manifest-missing" | "snapshot-manifest-invalid" | "snapshot-incompatible" | "snapshot-tampered"; message: string };

export async function loadEmbeddedWorkspaceSnapshot(
  moduleUrl: string = import.meta.url,
): Promise<EmbeddedWorkspaceSnapshotLoadResult> {
  let packageRoot: string;
  try {
    packageRoot = resolvePackageRootFromModule(moduleUrl);
  } catch (error) {
    return {
      ok: false,
      state: "snapshot-unavailable",
      message:
        error instanceof Error
          ? error.message
          : "Could not resolve packaged workspace snapshot root.",
    };
  }

  const snapshotRoot = resolveWorkspaceSnapshotDirectory(packageRoot);
  const manifestPath = path.join(snapshotRoot, "manifest.json");
  let manifestRaw: string;
  try {
    manifestRaw = await readFile(manifestPath, "utf8");
  } catch {
    return {
      ok: false,
      state: "snapshot-manifest-missing",
      message: "Embedded workspace snapshot manifest is missing from the package.",
    };
  }

  const parsed = parseWorkspaceSnapshotManifestJson(manifestRaw);
  if (!parsed.ok) {
    return {
      ok: false,
      state: "snapshot-manifest-invalid",
      message: parsed.reason,
    };
  }

  let packageVersion: string;
  try {
    packageVersion = readPDevPackageVersionFromPackageRoot(packageRoot);
  } catch (error) {
    return {
      ok: false,
      state: "snapshot-incompatible",
      message:
        error instanceof Error ? error.message : "Packaged version metadata is invalid.",
    };
  }

  if (parsed.manifest.packageVersion !== packageVersion) {
    return {
      ok: false,
      state: "snapshot-incompatible",
      message: `Embedded snapshot package version ${parsed.manifest.packageVersion} does not match installed package ${packageVersion}.`,
    };
  }

  const embeddedValidation = await validateEmbeddedSnapshotFiles({
    snapshotRoot,
    manifest: parsed.manifest,
  });
  if (!embeddedValidation.ok) {
    return {
      ok: false,
      state: "snapshot-tampered",
      message: embeddedValidation.reason,
    };
  }

  return {
    ok: true,
    packageRoot,
    snapshotRoot,
    packageVersion,
    manifest: parsed.manifest,
    fingerprint: fingerprintWorkspaceSnapshotManifest(parsed.manifest),
  };
}
