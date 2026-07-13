import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_JSON_RELATIVE = "../../package.json";

export function readHarnessPackageVersion(
  moduleUrl = import.meta.url,
): string {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(moduleUrl)),
    PACKAGE_JSON_RELATIVE,
  );
  const raw = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version?.trim() || "0.0.0";
}
