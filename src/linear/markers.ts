export interface HarnessMarkers {
  orchestratorMarker?: string;
  phase?: string;
  runId?: string;
  cursorAgentId?: string;
  cursorRunId?: string;
  model?: string;
  promptVersion?: string;
  targetRepo?: string;
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
