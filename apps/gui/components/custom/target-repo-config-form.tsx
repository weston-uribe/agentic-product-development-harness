"use client";

import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import { FORM } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TargetRepoConfigFormProps {
  values: LocalConfigFormInput;
  highlightStaleTarget?: boolean;
  onChange: (values: LocalConfigFormInput) => void;
}

export function TargetRepoConfigForm({
  values,
  highlightStaleTarget = false,
  onChange,
}: TargetRepoConfigFormProps) {
  const repo = values.repos[0] ?? {
    id: "",
    targetRepo: "",
  };

  const updateRepo = (patch: Partial<typeof repo>) => {
    onChange({
      ...values,
      repos: [{ ...repo, ...patch }],
    });
  };

  return (
    <div className="space-y-6">
      <div className={FORM.fieldGrid}>
        <div className={FORM.fieldStack}>
          <Label htmlFor="linear-team-key">Linear team key</Label>
          <Input
            id="linear-team-key"
            value={values.linearTeamKey ?? ""}
            onChange={(event) =>
              onChange({ ...values, linearTeamKey: event.target.value })
            }
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="model-id">Model ID</Label>
          <Input
            id="model-id"
            value={values.modelId ?? ""}
            onChange={(event) =>
              onChange({ ...values, modelId: event.target.value })
            }
          />
          <p className={FORM.secretHint}>
            Local setup only. Harness runs use standard Composer 2.5 policy.
          </p>
        </div>
      </div>

      <div className={FORM.fieldGrid}>
        <div className={FORM.fieldStack}>
          <Label htmlFor="repo-id">Repo config ID</Label>
          <Input
            id="repo-id"
            value={repo.id}
            onChange={(event) => updateRepo({ id: event.target.value })}
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="target-repo">Target repo URL</Label>
          <Input
            id="target-repo"
            value={repo.targetRepo}
            onChange={(event) => updateRepo({ targetRepo: event.target.value })}
            className={highlightStaleTarget ? "border-destructive/60" : undefined}
          />
          {highlightStaleTarget ? (
            <p className={FORM.secretHint}>
              Enter the target repo you actually intend to use. The app will not
              guess or invent a replacement repo for you.
            </p>
          ) : null}
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="linear-projects">Linear projects</Label>
          <Input
            id="linear-projects"
            value={repo.linearProjects ?? ""}
            onChange={(event) =>
              updateRepo({ linearProjects: event.target.value })
            }
            placeholder="Comma-separated"
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="linear-teams">Linear teams</Label>
          <Input
            id="linear-teams"
            value={repo.linearTeams ?? ""}
            onChange={(event) => updateRepo({ linearTeams: event.target.value })}
            placeholder="Comma-separated"
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="base-branch">Base branch</Label>
          <Input
            id="base-branch"
            value={repo.baseBranch ?? "dev"}
            onChange={(event) => updateRepo({ baseBranch: event.target.value })}
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="production-branch">Production branch</Label>
          <Input
            id="production-branch"
            value={repo.productionBranch ?? "main"}
            onChange={(event) =>
              updateRepo({ productionBranch: event.target.value })
            }
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="preview-provider">Preview provider</Label>
          <Input
            id="preview-provider"
            value={repo.previewProvider ?? "vercel"}
            onChange={(event) =>
              updateRepo({ previewProvider: event.target.value })
            }
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="integration-preview-url">Integration preview URL</Label>
          <Input
            id="integration-preview-url"
            value={repo.integrationPreviewUrl ?? ""}
            onChange={(event) =>
              updateRepo({ integrationPreviewUrl: event.target.value })
            }
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="production-url">Production URL</Label>
          <Input
            id="production-url"
            value={repo.productionUrl ?? ""}
            onChange={(event) => updateRepo({ productionUrl: event.target.value })}
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="integration-success-status">
            Integration success status
          </Label>
          <Input
            id="integration-success-status"
            value={repo.integrationSuccessStatus ?? "Merged to Dev"}
            onChange={(event) =>
              updateRepo({ integrationSuccessStatus: event.target.value })
            }
          />
        </div>
        <div className={FORM.fieldStack}>
          <Label htmlFor="production-success-status">
            Production success status
          </Label>
          <Input
            id="production-success-status"
            value={repo.productionSuccessStatus ?? "Merged / Deployed"}
            onChange={(event) =>
              updateRepo({ productionSuccessStatus: event.target.value })
            }
          />
        </div>
      </div>

      <div className={FORM.fieldStack}>
        <Label htmlFor="validation-commands">Validation commands</Label>
        <Textarea
          id="validation-commands"
          value={repo.validationCommands ?? ""}
          onChange={(event) =>
            updateRepo({ validationCommands: event.target.value })
          }
          placeholder="One command per line"
          rows={4}
        />
      </div>
    </div>
  );
}
