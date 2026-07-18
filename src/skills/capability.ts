/**
 * Cursor execution-surface capability for native Agent Skills.
 * Classifications are from @cursor/sdk@1.0.23 contract evidence only.
 * Do not promote sdk_cloud_agent to supported without a real canary.
 */

import type {
  CursorExecutionSurface,
  NativeSkillCapabilityState,
} from "../prompts/contracts.js";

export const NATIVE_SKILL_CAPABILITY_REGISTRY_VERSION = "2026-07-18.v1" as const;

export interface NativeSkillSurfaceCapability {
  surface: CursorExecutionSurface;
  state: NativeSkillCapabilityState;
  evidence: string;
  notes: string;
}

/**
 * Production Cloud Agents must treat native skills as unproven.
 * Explicit SDK invoke API is unsupported (no skill fields on Agent.create/send).
 */
export const NATIVE_SKILL_SURFACE_CAPABILITIES: readonly NativeSkillSurfaceCapability[] =
  [
    {
      surface: "cursor_editor",
      state: "unproven",
      evidence:
        "No editor types in @cursor/sdk; repo docs describe operator-invoked SKILL.md packages under .agents/skills with optional manual .cursor/skills adapter. Not proven via typed SDK contract.",
      notes: "Operator may invoke skills in the editor; not a harness Cloud Agent path.",
    },
    {
      surface: "cursor_cli_interactive",
      state: "unsupported",
      evidence:
        "Zero skill/Skill fields in @cursor/sdk@1.0.23 .d.ts; harness does not invoke Cursor CLI.",
      notes: "No skill API surface for CLI interactive mode in installed SDK types.",
    },
    {
      surface: "cursor_cli_non_interactive",
      state: "unsupported",
      evidence:
        "Zero skill/Skill fields in @cursor/sdk@1.0.23 .d.ts; harness does not invoke Cursor CLI.",
      notes: "No skill API surface for CLI non-interactive mode in installed SDK types.",
    },
    {
      surface: "sdk_local_agent",
      state: "unsupported",
      evidence:
        "No skill fields on AgentOptions/SendOptions. Related: settingSources, customTools, customSubagents — none named skill. Harness does not use local agents.",
      notes: "Explicit skill invoke API absent.",
    },
    {
      surface: "sdk_cloud_agent",
      state: "unproven",
      evidence:
        "V1CreateAgentRequest has prompt/model/mcpServers/customSubagents/repos — no skill field. Cloud project/team/plugins settings layers are always on in VM per SDK comments, but that is not proof Agent Skills are discovered or invocable. SDKMessage has no skill load/invoke events. Ambient discovery from target-repo checkout layouts remains unproven pending final remote canary.",
      notes:
        "Production must use rendered_into_prompt. Do not mark supported without direct canary evidence.",
    },
    {
      surface: "background_agent",
      state: "unsupported",
      evidence:
        "No BackgroundAgent create API; TaskSuccess.isBackground is subagent/task telemetry, not a skill contract.",
      notes: "Not a skill execution surface.",
    },
  ] as const;

export function getNativeSkillCapability(
  surface: CursorExecutionSurface,
): NativeSkillSurfaceCapability {
  const found = NATIVE_SKILL_SURFACE_CAPABILITIES.find(
    (c) => c.surface === surface,
  );
  if (!found) {
    return {
      surface,
      state: "unproven",
      evidence: "Surface not listed in capability registry.",
      notes: "Default to unproven.",
    };
  }
  return found;
}

/** Production Cloud Agent path used by the harness runner. */
export function productionNativeSkillCapability(): NativeSkillCapabilityState {
  return getNativeSkillCapability("sdk_cloud_agent").state;
}

/**
 * Whether production may attempt native skill invocation.
 * Unproven and unsupported both forbid production native attempts.
 */
export function mayAttemptNativeSkillInProduction(
  surface: CursorExecutionSurface = "sdk_cloud_agent",
): boolean {
  return getNativeSkillCapability(surface).state === "supported";
}

/** Candidate layouts for disposable canary fixtures only — not production. */
export const NATIVE_SKILL_CANARY_CANDIDATE_LAYOUTS = [
  ".agents/skills/<skillId>/SKILL.md",
  ".cursor/skills/<skillId>/SKILL.md",
] as const;
