import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const P_DEV_PACKAGE_NAME = "p-dev-harness";

export function normalizeModuleReferenceToPath(moduleUrl: string): string {
  if (moduleUrl.startsWith("file://")) {
    return fileURLToPath(moduleUrl);
  }
  return path.resolve(moduleUrl);
}

export function resolvePackageRootFromModule(moduleUrl: string): string {
  let current = path.resolve(
    path.dirname(normalizeModuleReferenceToPath(moduleUrl)),
  );

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          name?: string;
        };
        if (parsed.name === P_DEV_PACKAGE_NAME) {
          return current;
        }
      } catch {
        // keep walking
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(
    `Could not resolve ${P_DEV_PACKAGE_NAME} package root from ${moduleUrl}.`,
  );
}

export function resolveGuiDirectory(packageRoot: string): string {
  return path.join(packageRoot, "gui");
}

export function resolveTemplatesDirectory(packageRoot: string): string {
  return path.join(packageRoot, "templates");
}

export function resolveWorkspaceSnapshotDirectory(packageRoot: string): string {
  return path.join(packageRoot, "workspace-snapshot");
}
