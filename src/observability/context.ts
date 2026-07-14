import os from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OBSERVABILITY_SCHEMA_VERSION } from "./constants.js";
import type {
  CpuArchFamily,
  ObservabilityContext,
  OsFamily,
  WorkspaceKind,
} from "./types.js";
import { resolveHarnessPackageVersion } from "../p-dev/package-version.js";
import { resolvePackageRootFromModule } from "../p-dev/package-paths.js";

export function resolveOsFamily(platform = process.platform): OsFamily {
  if (platform === "darwin") {
    return "macos";
  }
  if (platform === "linux") {
    return "linux";
  }
  if (platform === "win32") {
    return "windows";
  }
  return "unknown";
}

export function resolveCpuArchFamily(arch: string = process.arch): CpuArchFamily {
  if (arch === "arm64") {
    return "arm64";
  }
  if (arch === "x64") {
    return "x64";
  }
  if (arch) {
    return "other";
  }
  return "unknown";
}

export function resolveNodeMajorVersion(
  version = process.versions.node,
): number {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

export function readReleaseShaFromPackageRoot(packageRoot: string): string {
  const manifestPath = path.join(
    packageRoot,
    "workspace-snapshot",
    "manifest.json",
  );
  try {
    const raw = readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as { sourceCommit?: string };
    return parsed.sourceCommit?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export interface BuildObservabilityContextInput {
  sessionId: string;
  installationId?: string;
  firstLaunchForPDevHome: boolean;
  workspaceKind?: WorkspaceKind;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export function buildObservabilityContext(
  input: BuildObservabilityContextInput,
): ObservabilityContext {
  const env = input.env ?? process.env;
  const moduleUrl = input.moduleUrl ?? import.meta.url;
  let packageVersion: string;
  let releaseSha = "unknown";

  try {
    packageVersion = resolveHarnessPackageVersion(env, moduleUrl);
    const packageRoot = resolvePackageRootFromModule(moduleUrl);
    releaseSha = readReleaseShaFromPackageRoot(packageRoot);
  } catch {
    packageVersion = env.P_DEV_PACKAGE_VERSION?.trim() || "0.0.0";
  }

  return {
    observabilitySchemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    packageVersion,
    releaseSha,
    runtimeMode: "packaged",
    osFamily: resolveOsFamily(os.platform()),
    cpuArchFamily: resolveCpuArchFamily(os.arch()),
    nodeMajorVersion: resolveNodeMajorVersion(),
    sessionId: input.sessionId,
    installationId: input.installationId,
    firstLaunchForPDevHome: input.firstLaunchForPDevHome,
    workspaceKind: input.workspaceKind ?? "unknown",
  };
}
