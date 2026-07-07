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
}

export function parseHarnessMarkers(commentBody: string): HarnessMarkers {
  const markers: HarnessMarkers = {};
  const footerMatch = commentBody.match(/\n---\n([\s\S]*?)(?:\n---|$)/);
  const block = footerMatch?.[1] ?? commentBody;

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      if (trimmed === "harness-orchestrator-v1") {
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
      default:
        if (trimmed === "harness-orchestrator-v1") {
          markers.orchestratorMarker = trimmed;
        }
        break;
    }
  }

  if (block.includes("harness-orchestrator-v1")) {
    markers.orchestratorMarker = "harness-orchestrator-v1";
  }

  return markers;
}
