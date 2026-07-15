import { Label } from "@/components/ui/label";
import type {
  OperationsExecutorCatalogEntry,
  OperationsModelCatalogEntry,
  OperationsRule,
} from "@harness/operations/types";

type RuleInspectorProps = {
  rule: OperationsRule;
  executors: OperationsExecutorCatalogEntry[];
  modelCatalog: OperationsModelCatalogEntry[];
  onChange: (patch: Partial<OperationsRule>) => void;
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
  onChange,
}: RuleInspectorProps) {
  const executor = executors.find((entry) => entry.id === rule.executorId);

  return (
    <div className="space-y-3">
      <SimpleSelect
        label="Executor"
        value={rule.executorId}
        options={executors.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
        onChange={(executorId) => onChange({ executorId })}
      />
      {executor?.supportsDraftModelSelection ? (
        <SimpleSelect
          label="Draft model"
          value={rule.modelSelection?.modelId ?? ""}
          options={[
            { value: "", label: "Select model" },
            ...modelCatalog
              .filter((entry) => entry.availability === "available")
              .map((entry) => ({ value: entry.id, label: entry.displayName })),
          ]}
          onChange={(modelId) =>
            onChange({
              modelSelection: modelId
                ? {
                    modelId,
                    displayNameAtSelection:
                      modelCatalog.find((entry) => entry.id === modelId)
                        ?.displayName ?? modelId,
                    parameters: [],
                  }
                : undefined,
            })
          }
        />
      ) : null}
      {rule.executorId === "merge-runner" ? (
        <div className="rounded-md border border-border p-2 text-xs">
          <p className="font-medium">Integration Repair (nested recovery policy)</p>
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
        <Label>Outcomes</Label>
        <ul className="mt-1 space-y-1 text-xs">
          {rule.outcomes.map((outcome) => (
            <li key={outcome.id} className="rounded border border-border px-2 py-1">
              {outcome.label} → {outcome.destinationStatusId ?? "unset"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
