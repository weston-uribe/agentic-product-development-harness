import { Label } from "@/components/ui/label";
import type {
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsOutcome,
  OperationsRule,
  OperationsStatusRecord,
} from "@harness/operations/types";

type RuleInspectorProps = {
  rule: OperationsRule;
  executors: OperationsExecutorCatalogEntry[];
  modelCatalog: OperationsModelCatalogEntry[];
  statuses: OperationsStatusRecord[];
  selectedOutcomeId?: string;
  connectionView?: boolean;
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
  disabled,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-60"
        value={value}
        disabled={disabled}
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

function BooleanSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label>{label}</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
          checked ? "border-primary bg-primary" : "border-input bg-muted"
        }`}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onChange(!checked);
          }
        }}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-background transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export function RuleInspector({
  rule,
  executors,
  modelCatalog,
  statuses,
  selectedOutcomeId,
  connectionView = false,
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
  const selectedOutcome = selectedOutcomeId
    ? rule.outcomes.find((outcome) => outcome.id === selectedOutcomeId)
    : undefined;

  if (connectionView && selectedOutcome) {
    return (
      <fieldset disabled={disabled} className="space-y-3 text-sm disabled:opacity-60">
        <p className="text-xs text-muted-foreground">Connection</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedOutcome.enabled}
            onChange={(event) =>
              onUpdateOutcome(selectedOutcome.id, { enabled: event.target.checked })
            }
          />
          Enabled
        </label>
        <div className="space-y-1">
          <Label htmlFor="connection-outcome-name">Name</Label>
          <input
            id="connection-outcome-name"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={selectedOutcome.label}
            disabled={disabled}
            onChange={(event) =>
              onUpdateOutcome(selectedOutcome.id, { label: event.target.value })
            }
          />
        </div>
        <SimpleSelect
          label="Destination"
          value={selectedOutcome.destinationStatusId ?? ""}
          disabled={disabled}
          options={[
            { value: "", label: "Unresolved" },
            ...statuses.map((status) => ({
              value: status.id,
              label: status.name,
            })),
          ]}
          onChange={(destinationStatusId) =>
            onUpdateOutcome(selectedOutcome.id, {
              destinationStatusId: destinationStatusId || undefined,
            })
          }
        />
        <button
          type="button"
          className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
          disabled={disabled}
          onClick={() => onDeleteOutcome(selectedOutcome.id)}
        >
          Remove outcome
        </button>
      </fieldset>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        Automation enabled
      </label>
      <SimpleSelect
        label="Executor"
        value={rule.executorId}
        disabled={disabled}
        options={executors.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
        onChange={(executorId) => onChange({ executorId })}
      />
      {executor?.supportsDraftModelSelection ? (
        <div className="space-y-3 rounded-md border border-border p-2">
          <SimpleSelect
            label="Model"
            value={rule.modelSelection?.modelId ?? ""}
            disabled={disabled}
            options={[
              { value: "", label: "Select model" },
              ...modelCatalog
                .filter((entry) => entry.availability === "available")
                .map((entry) => ({ value: entry.id, label: entry.displayName })),
            ]}
            onChange={onSelectModel}
          />
          {rule.modelSelection && !selectedModel ? (
            <p className="text-xs text-destructive">
              Selected model is no longer available in the current catalog.
            </p>
          ) : null}
          {selectedModel?.supportedParameters.map((parameter) => {
            const selectedValue =
              rule.modelSelection?.parameters.find((entry) => entry.id === parameter.id)
                ?.value ??
              parameter.defaultValue ??
              "";
            if (parameter.type === "boolean") {
              return (
                <BooleanSwitch
                  key={parameter.id}
                  label={parameter.label}
                  checked={selectedValue === "true"}
                  disabled={disabled}
                  onChange={(checked) =>
                    onUpdateModelParameter(parameter.id, checked ? "true" : "false")
                  }
                />
              );
            }
            if (parameter.allowedValues && parameter.allowedValues.length > 0) {
              return (
                <SimpleSelect
                  key={parameter.id}
                  label={parameter.label}
                  value={selectedValue}
                  disabled={disabled}
                  options={parameter.allowedValues.map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(value) => onUpdateModelParameter(parameter.id, value)}
                />
              );
            }
            return (
              <div key={parameter.id} className="space-y-1">
                <Label>{parameter.label}</Label>
                <input
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={selectedValue}
                  disabled={disabled}
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
          <p className="font-medium">Integration repair</p>
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
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
            disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
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
