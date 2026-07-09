"use client";

import { FORM } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/custom/status-badge";

export interface EnvironmentFormValues {
  harnessConfigPath: string;
  linearApiKey: string;
  cursorApiKey: string;
  githubToken: string;
}

export interface EnvironmentFormPresence {
  LINEAR_API_KEY: boolean;
  CURSOR_API_KEY: boolean;
  GITHUB_TOKEN: boolean;
}

interface EnvironmentConfigFormProps {
  values: EnvironmentFormValues;
  presence: EnvironmentFormPresence;
  onChange: (values: EnvironmentFormValues) => void;
}

export function EnvironmentConfigForm({
  values,
  presence,
  onChange,
}: EnvironmentConfigFormProps) {
  const update = (patch: Partial<EnvironmentFormValues>) => {
    onChange({ ...values, ...patch });
  };

  return (
    <div className={FORM.fieldGrid}>
      <div className={FORM.fieldStack}>
        <Label htmlFor="harness-config-path">HARNESS_CONFIG_PATH</Label>
        <Input
          id="harness-config-path"
          value={values.harnessConfigPath}
          onChange={(event) =>
            update({ harnessConfigPath: event.target.value })
          }
          autoComplete="off"
        />
        <p className={FORM.secretHint}>
          Recommended: .harness/config.local.json
        </p>
      </div>

      <SecretField
        id="linear-api-key"
        label="LINEAR_API_KEY"
        present={presence.LINEAR_API_KEY}
        value={values.linearApiKey}
        onChange={(linearApiKey) => update({ linearApiKey })}
      />
      <SecretField
        id="cursor-api-key"
        label="CURSOR_API_KEY"
        present={presence.CURSOR_API_KEY}
        value={values.cursorApiKey}
        onChange={(cursorApiKey) => update({ cursorApiKey })}
      />
      <SecretField
        id="github-token"
        label="GITHUB_TOKEN"
        present={presence.GITHUB_TOKEN}
        value={values.githubToken}
        onChange={(githubToken) => update({ githubToken })}
      />
    </div>
  );
}

function SecretField({
  id,
  label,
  present,
  value,
  onChange,
}: {
  id: string;
  label: string;
  present: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={FORM.fieldStack}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <StatusBadge
          label={present ? "Set" : "Missing"}
          variant={present ? "success" : "warning"}
        />
      </div>
      <Input
        id={id}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={present ? "Leave blank to keep existing value" : "Enter value"}
        autoComplete="off"
      />
      <p className={FORM.secretHint}>
        Existing values are never shown. Leave blank to preserve a set key.
      </p>
    </div>
  );
}
