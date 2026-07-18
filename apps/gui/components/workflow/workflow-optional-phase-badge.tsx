/**
 * Reusable optional-phase badge. Hidden until later chunks activate optional reviewers.
 */

export function WorkflowOptionalPhaseBadge(props: {
  visible?: boolean;
  label?: string;
}) {
  if (!props.visible) return null;
  return (
    <span className="workflow-optional-phase-badge" data-testid="optional-phase-badge">
      {props.label ?? "Optional"}
    </span>
  );
}
