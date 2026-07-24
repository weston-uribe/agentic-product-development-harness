/**
 * Public-safe provenance coverage status for GUI / operator surfaces.
 * Never includes full digests, private paths, or provider IDs.
 */

import { resolveProvenanceMode } from "../../../provenance/mode.js";
import { COVERAGE_SCHEMA_KIND } from "../../../provenance/coverage.js";
import type { AuthoritativeCoverageStatus } from "../../../provenance/authoritative-coverage-inspect.js";
import { HISTORICAL_UNRECOVERABLE_SOURCE_DIGEST } from "../disposition/registry.js";
import {
  CURSOR_USAGE_COVERAGE_EXCLUSION_CONTRACT_VERSION,
  CURSOR_USAGE_PROVENANCE_SCOPE_CONTRACT_VERSION,
} from "./contracts.js";
import { resolveRegistryPinFromEnv } from "./resolve.js";

export type ProvenanceCoverageVerificationStatus =
  | AuthoritativeCoverageStatus
  | "unverified"
  | "unknown";

export interface ProvenanceCoveragePublicStatus {
  provenanceConfigured: boolean;
  mode: string;
  status: ProvenanceCoverageVerificationStatus;
  activeEpochId: string | null;
  earliestEligibleCsvUtc: string | null;
  latestSealedCompleteUtc: string | null;
  stateContractVersion: string | null;
  coverageContractVersion: string | null;
  activationDigestPrefix: string | null;
  coverageDigestPrefix: string | null;
  sealDigestPrefix: string | null;
  unresolvedOrGapCount: number;
  absenceBasedExclusionAuthorized: boolean;
  historicalDispositionNote: string | null;
  exportGuidance: string | null;
}

function prefix12(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 12);
}

export function resolveProvenanceCoveragePublicStatus(
  env: Record<string, string | undefined> = process.env,
  input?: { authoritativeStatus?: AuthoritativeCoverageStatus | null },
): ProvenanceCoveragePublicStatus {
  const mode = resolveProvenanceMode(env);
  const pinResolution = resolveRegistryPinFromEnv(env);
  const pin = pinResolution.pin;
  const earliest = env.P_DEV_PROVENANCE_EARLIEST_ELIGIBLE_CSV_UTC?.trim() || null;
  const latest = env.P_DEV_PROVENANCE_LATEST_SEALED_UTC?.trim() || null;
  const epochId = env.P_DEV_PROVENANCE_ACTIVE_EPOCH_ID?.trim() || null;
  const authoritative = input?.authoritativeStatus ?? null;
  const status: ProvenanceCoverageVerificationStatus = authoritative
    ? authoritative
    : pin
      ? "unverified"
      : "unknown";
  const absenceAuthorized = status === "sealed_complete";

  let exportGuidance: string | null = null;
  if (earliest && latest) {
    exportGuidance = `Export Cursor usage from ${earliest} through a time no later than ${latest}.`;
  } else if (!pin) {
    exportGuidance =
      "No sealed complete coverage interval is available yet. Complete provenance activation and seal before Apply.";
  }

  return {
    provenanceConfigured: mode !== "disabled" || pin != null,
    mode,
    status,
    activeEpochId: epochId,
    earliestEligibleCsvUtc: earliest,
    latestSealedCompleteUtc: latest,
    stateContractVersion: CURSOR_USAGE_PROVENANCE_SCOPE_CONTRACT_VERSION,
    coverageContractVersion: `${COVERAGE_SCHEMA_KIND}/${CURSOR_USAGE_COVERAGE_EXCLUSION_CONTRACT_VERSION}`,
    activationDigestPrefix: prefix12(
      env.P_DEV_PROVENANCE_ACTIVATION_PAYLOAD_DIGEST?.trim(),
    ),
    coverageDigestPrefix: prefix12(
      env.P_DEV_PROVENANCE_COVERAGE_DIGEST?.trim(),
    ),
    sealDigestPrefix: prefix12(env.P_DEV_PROVENANCE_SEAL_DIGEST?.trim()),
    unresolvedOrGapCount: Number.parseInt(
      env.P_DEV_PROVENANCE_UNRESOLVED_GAP_COUNT?.trim() || "0",
      10,
    ) || 0,
    absenceBasedExclusionAuthorized: absenceAuthorized,
    historicalDispositionNote: `Historical scope unrecoverable — diagnostic only (digest ${HISTORICAL_UNRECOVERABLE_SOURCE_DIGEST.slice(0, 16)}…)`,
    exportGuidance,
  };
}
