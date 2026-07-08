export interface HarnessMarkers {
  orchestratorMarker?: string;
  phase?: string;
  runId?: string;
  cursorAgentId?: string;
  cursorRunId?: string;
  model?: string;
  promptVersion?: string;
  targetRepo?: string;
  baseBranch?: string;
  branch?: string;
  prUrl?: string;
  previewUrl?: string;
  previousImplementationRunId?: string;
  previousHandoffRunId?: string;
  pmFeedbackCommentId?: string;
  previousRevisionRunId?: string;
  mergeCommitSha?: string;
  deploymentUrl?: string;
  githubActionsRunUrl?: string;
  issueKey?: string;
  prNumber?: string;
  productionBranch?: string;
  integrationSuccessStatus?: string;
  productionHeadSha?: string;
  previousMergeRunId?: string;
  promotionProofMethod?: string;
  repairAttempt?: string;
  repairPath?: string;
  triggerReason?: string;
  conflictFiles?: string;
  dependencyClosureFiles?: string;
  touchedFiles?: string;
  repairCycleId?: string;
}

const HARNESS_HTML_METADATA_PATTERN = /<!--\s*([\s\S]*?)\s*-->/g;

export function extractHarnessMetadataBlock(commentBody: string): string | null {
  const matches = [...commentBody.matchAll(HARNESS_HTML_METADATA_PATTERN)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const block = matches[index]?.[1]?.trim();
    if (
      block &&
      (block.includes("harness-orchestrator-v1") ||
        /\nphase:\s*\S+/m.test(block) ||
        /^phase:\s*\S+/m.test(block))
    ) {
      return block;
    }
  }
  return null;
}

function parseHarnessMarkerLines(block: string): HarnessMarkers {
  const markers: HarnessMarkers = {};

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      if (trimmed.startsWith("harness-orchestrator")) {
        markers.orchestratorMarker = trimmed;
      }
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    switch (key) {
      case "phase":
        markers.phase = value;
        break;
      case "run_id":
        markers.runId = value;
        break;
      case "cursor_agent_id":
        markers.cursorAgentId = value;
        break;
      case "cursor_run_id":
        markers.cursorRunId = value;
        break;
      case "model":
        markers.model = value;
        break;
      case "prompt_version":
        markers.promptVersion = value;
        break;
      case "target_repo":
        markers.targetRepo = value;
        break;
      case "base_branch":
        markers.baseBranch = value;
        break;
      case "branch":
        markers.branch = value;
        break;
      case "pr_url":
        markers.prUrl = value;
        break;
      case "preview_url":
        markers.previewUrl = value;
        break;
      case "previous_implementation_run_id":
        markers.previousImplementationRunId = value;
        break;
      case "previous_handoff_run_id":
        markers.previousHandoffRunId = value;
        break;
      case "pm_feedback_comment_id":
        markers.pmFeedbackCommentId = value;
        break;
      case "previous_revision_run_id":
        markers.previousRevisionRunId = value;
        break;
      case "merge_commit_sha":
        markers.mergeCommitSha = value;
        break;
      case "deployment_url":
        markers.deploymentUrl = value;
        break;
      case "github_actions_run_url":
        markers.githubActionsRunUrl = value;
        break;
      case "issue_key":
        markers.issueKey = value;
        break;
      case "pr_number":
        markers.prNumber = value;
        break;
      case "production_branch":
        markers.productionBranch = value;
        break;
      case "integration_success_status":
        markers.integrationSuccessStatus = value;
        break;
      case "production_head_sha":
        markers.productionHeadSha = value;
        break;
      case "previous_merge_run_id":
        markers.previousMergeRunId = value;
        break;
      case "promotion_proof_method":
        markers.promotionProofMethod = value;
        break;
      case "repair_attempt":
        markers.repairAttempt = value;
        break;
      case "repair_path":
        markers.repairPath = value;
        break;
      case "trigger_reason":
        markers.triggerReason = value;
        break;
      case "conflict_files":
        markers.conflictFiles = value;
        break;
      case "dependency_closure_files":
        markers.dependencyClosureFiles = value;
        break;
      case "touched_files":
        markers.touchedFiles = value;
        break;
      case "repair_cycle_id":
        markers.repairCycleId = value;
        break;
      default:
        if (trimmed.startsWith("harness-orchestrator")) {
          markers.orchestratorMarker = trimmed;
        }
        break;
    }
  }

  if (block.includes("harness-orchestrator-v1") && !markers.orchestratorMarker) {
    markers.orchestratorMarker = "harness-orchestrator-v1";
  }

  return markers;
}

function parseLegacyVisibleFooter(commentBody: string): HarnessMarkers {
  const segments = commentBody.split(/\n---\n/);
  const footerSegment =
    [...segments]
      .reverse()
      .find(
        (segment) =>
          segment.includes("harness-orchestrator-v1") ||
          /\nphase:\s*\S+/m.test(segment) ||
          /^phase:\s*\S+/m.test(segment),
      ) ?? segments.at(-1) ?? commentBody;

  return parseHarnessMarkerLines(footerSegment);
}

export function parseHarnessMarkers(commentBody: string): HarnessMarkers {
  const htmlBlock = extractHarnessMetadataBlock(commentBody);
  if (htmlBlock) {
    return parseHarnessMarkerLines(htmlBlock);
  }
  return parseLegacyVisibleFooter(commentBody);
}
