/**
 * Reusable workflow phase controls prepared for later chunks.
 * Enable/disable, cycle-limit, bypass path, and role displays stay hidden
 * until optional reviewers are activated.
 */

export function WorkflowOptionalEnableControl(props: {
  visible?: boolean;
  enabled?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  if (!props.visible) return null;
  return (
    <label className="workflow-optional-enable" data-testid="optional-phase-enable">
      <input
        type="checkbox"
        checked={props.enabled ?? false}
        disabled={props.disabled ?? true}
        readOnly
      />
      {props.label ?? "Enable optional phase"}
    </label>
  );
}

export function WorkflowCycleLimitDisplay(props: {
  visible?: boolean;
  cycleName?: string;
  limit?: number;
  count?: number;
}) {
  if (!props.visible) return null;
  return (
    <div className="workflow-cycle-limit" data-testid="cycle-limit-display">
      {props.cycleName ?? "cycles"}: {props.count ?? 0}/{props.limit ?? 0}
    </div>
  );
}

export function WorkflowBypassPathDisplay(props: {
  visible?: boolean;
  bypassLabel?: string;
}) {
  if (!props.visible) return null;
  return (
    <div className="workflow-bypass-path" data-testid="bypass-path-display">
      Bypass: {props.bypassLabel ?? "—"}
    </div>
  );
}

export function WorkflowAgentModelRoleDisplay(props: {
  visible?: boolean;
  agentRole?: string | null;
  modelRole?: string | null;
}) {
  if (!props.visible) return null;
  return (
    <div className="workflow-role-display" data-testid="agent-model-role-display">
      Agent: {props.agentRole ?? "—"} · Model: {props.modelRole ?? "—"}
    </div>
  );
}
