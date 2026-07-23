import { createHash } from "node:crypto";

export const LAUNCH_SURFACES_SCHEMA_KIND =
  "p-dev.cursor-cloud-agent-launch-surfaces.v1" as const;

export const PROVENANCE_WRITER_VERSION = "cursor-provenance-writer-v1" as const;

/**
 * Exhaustive live production Linear-harness launch surfaces.
 * Kept in sync with LinearHarnessAgentProvider surface union.
 */
export const PRODUCTION_LAUNCH_SURFACES = [
  "planning.create",
  "plan_review.create",
  "plan_review.resume",
  "implementation.initial_create",
  "implementation.resume",
  "implementation.replacement",
  "revision.resume",
  "revision.replacement",
  "code_review.create",
  "code_revision.create",
  "integration_repair.resume",
  "integration_repair.replacement",
] as const;

export type ProductionLaunchSurface =
  (typeof PRODUCTION_LAUNCH_SURFACES)[number];

export interface LaunchSurfacesManifest {
  kind: typeof LAUNCH_SURFACES_SCHEMA_KIND;
  version: "1";
  surfaces: readonly ProductionLaunchSurface[];
  writerVersion: typeof PROVENANCE_WRITER_VERSION;
}

export function getLaunchSurfacesManifest(): LaunchSurfacesManifest {
  return {
    kind: LAUNCH_SURFACES_SCHEMA_KIND,
    version: "1",
    surfaces: PRODUCTION_LAUNCH_SURFACES,
    writerVersion: PROVENANCE_WRITER_VERSION,
  };
}

export function launchSurfacesManifestDigest(
  manifest: LaunchSurfacesManifest = getLaunchSurfacesManifest(),
): string {
  const canonical = JSON.stringify({
    kind: manifest.kind,
    version: manifest.version,
    surfaces: [...manifest.surfaces].sort(),
    writerVersion: manifest.writerVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function assertKnownLaunchSurface(
  surface: string,
): asserts surface is ProductionLaunchSurface {
  if (
    !(PRODUCTION_LAUNCH_SURFACES as readonly string[]).includes(surface)
  ) {
    throw new Error(
      `Unknown production launch surface: ${surface.slice(0, 64)}`,
    );
  }
}

/** Production wrapper method/surface pairs for structural exhaustiveness. */
export const PRODUCTION_WRAPPER_SURFACE_UNION: readonly ProductionLaunchSurface[] =
  PRODUCTION_LAUNCH_SURFACES;
