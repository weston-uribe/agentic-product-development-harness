import { Label } from "@/components/ui/label";
import type {
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsOutcome,
  OperationsRule,
  OperationsStatusRecord,
} from "@harness/operations/types";
import { ExecutorMaturityBadge } from "./executor-maturity-badge";

type RuleInspectorProps = {
  rule: OperationsRule;
  executors: OperationsExecutorCatalogEntry[];
  modelCatalog: OperationsModelCatalogEntry[];
  statuses: OperationsStatusRecord[];
  selectedOutcomeId?: string;
  disabled?: boolean;
  onChange: (patch: Partial<OperationsRule>) => void;
  onSelectModel: (modelId: string) => void;
  onUpdateModelParameter: (parameterId: string, value: string) => void;
  onAddOutcome: () => void;
  onUpdateOutcome: (outcomeId: string, patch: Partial<OperationsOutcome>) => void;
  onDeleteOutcome: (outcomeId: string) => void;
};

function SimpleSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RuleInspector({
  rule,
  executors,
  modelCatalog,
  statuses,
  selectedOutcomeId,
  disabled = false,
  onChange,
  onSelectModel,
  onUpdateModelParameter,
  onAddOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
}: RuleInspectorProps) {
  const executor = executors.find((entry) => entry.id === rule.executorId);
  const selectedModel = rule.modelSelection
    ? modelCatalog.find((entry) => entry.id === rule.modelSelection?.modelId)
    : undefined;

  return (
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        Rule enabled
      </label>
      <SimpleSelect
        label="Executor"
        value={rule.executorId}
        options={executors.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
        onChange={(executorId) => onChange({ executorId })}
      />
      {executor ? (
        <div className="rounded-md border border-border p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{executor.label}</span>
            <ExecutorMaturityBadge maturity={executor.maturity} />
            <span className="rounded bg-muted px-1.5 py-0.5">{executor.kind}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{executor.honestyNote}</p>
          {executor.id === "pr-review-agent" ? (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
              Prototype only: no PR Review Agent exists in the runtime today.
            </p>
          ) : null}
        </div>
      ) : null}
      {executor?.supportsDraftModelSelection ? (
        <div className="space-y-3 rounded-md border border-border p-2">
          <SimpleSelect
            label="Draft model"
            value={rule.modelSelection?.modelId ?? ""}
            options={[
              { value: "", label: "Select model" },
              ...modelCatalog
                .filter((entry) => entry.availability === "available")
                .map((entry) => ({ value: entry.id, label: entry.displayName })),
            ]}
            onChange={onSelectModel}
          />
          <p className="text-xs text-muted-foreground">
            Draft model selections are prototype-only and do not change the active runtime model.
          </p>
          {rule.modelSelection && !selectedModel ? (
            <p className="text-xs text-destructive">
              Selected model {rule.modelSelection.modelId} is no longer available in the current catalog.
            </p>
          ) : null}
          {selectedModel?.supportedParameters.map((parameter) => {
            const selectedValue =
              rule.modelSelection?.parameters.find((entry) => entry.id === parameter.id)
                ?.value ??
              parameter.defaultValue ??
              "";
            return parameter.allowedValues && parameter.allowedValues.length > 0 ? (
              <SimpleSelect
                key={parameter.id}
                label={parameter.label}
                value={selectedValue}
                options={parameter.allowedValues.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => onUpdateModelParameter(parameter.id, value)}
              />
            ) : (
              <div key={parameter.id} className="space-y-1">
                <Label>{parameter.label}</Label>
                <input
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={selectedValue}
                  onChange={(event) =>
                    onUpdateModelParameter(parameter.id, event.target.value)
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {rule.executorId === "merge-runner" ? (
        <div className="rounded-md border border-border p-2 text-xs">
          <p className="font-medium">Integration Repair (nested recovery policy)</p>
          <p className="mt-1 text-muted-foreground">
            Current runtime: deterministic integration repair with Cursor-agent fallback when deterministic repair fails. Integration Repair remains nested under Merge Runner and is not assignable on the canvas.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule.nestedRecoveryPolicy?.deterministicRepairEnabled ?? true}
              onChange={(event) =>
                onChange({
                  nestedRecoveryPolicy: {
                    deterministicRepairEnabled: event.target.checked,
                    cursorAgentFallbackEnabled:
                      rule.nestedRecoveryPolicy?.cursorAgentFallbackEnabled ?? true,
                  },
                })
              }
            />
            Deterministic repair enabled
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule.nestedRecoveryPolicy?.cursorAgentFallbackEnabled ?? true}
              onChange={(event) =>
                onChange({
                  nestedRecoveryPolicy: {
                    deterministicRepairEnabled:
                      rule.nestedRecoveryPolicy?.deterministicRepairEnabled ?? true,
                    cursorAgentFallbackEnabled: event.target.checked,
                  },
                })
              }
            />
            Cursor-agent fallback enabled
          </label>
        </div>
      ) : null}
      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>Outcomes</Label>
          <button
            type="button"
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
            onClick={onAddOutcome}
          >
            Add outcome
          </button>
        </div>
        <ul className="mt-2 space-y-2 text-xs">
          {rule.outcomes.map((outcome) => (
            <li
              key={outcome.id}
              className={`space-y-2 rounded border px-2 py-2 ${
                selectedOutcomeId === outcome.id
                  ? "border-ring ring-1 ring-ring"
                  : "border-border"
              }`}
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={outcome.enabled}
                  onChange={(event) =>
                    onUpdateOutcome(outcome.id, { enabled: event.target.checked })
                  }
                />
                Outcome enabled
              </label>
              <div className="space-y-1">
                <Label>Outcome label</Label>
                <input
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={outcome.label}
                  onChange={(event) =>
                    onUpdateOutcome(outcome.id, { label: event.target.value })
                  }
                />
              </div>
              <SimpleSelect
                label="Destination status"
                value={outcome.destinationStatusId ?? ""}
                options={[
                  { value: "", label: "Unresolved" },
                  ...statuses.map((status) => ({
                    value: status.id,
                    label: status.name,
                  })),
                ]}
                onChange={(destinationStatusId) =>
                  onUpdateOutcome(outcome.id, {
                    destinationStatusId: destinationStatusId || undefined,
                  })
                }
              />
              <button
                type="button"
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                onClick={() => onDeleteOutcome(outcome.id)}
              >
                Remove outcome
              </button>
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
