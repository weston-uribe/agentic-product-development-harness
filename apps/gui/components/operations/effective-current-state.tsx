import type {
  OperationsCurrentModelSummary,
  OperationsCurrentWorkflowMapping,
} from "@harness/operations/types";

type EffectiveCurrentStateProps = {
  currentModel: OperationsCurrentModelSummary;
  mappings: OperationsCurrentWorkflowMapping[];
};

export function EffectiveCurrentState({
  currentModel,
  mappings,
}: EffectiveCurrentStateProps) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-medium">Effective current harness state</h2>
      <p className="text-xs text-muted-foreground">
        Runtime model: {currentModel.resolvedModelId} ({currentModel.source})
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{currentModel.draftOnlyNote}</p>
      <ul className="mt-3 space-y-1 text-xs">
        {mappings.slice(0, 8).map((mapping) => (
          <li key={mapping.mappingKey}>
            {mapping.mappingKey}: {mapping.configuredStatusName}{" "}
            <span className="text-muted-foreground">({mapping.state})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
