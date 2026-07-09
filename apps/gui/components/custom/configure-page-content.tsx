import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { SetupChecklist, DoctorChecklist } from "@/components/custom/setup-checklist";
import { PreviewPanel } from "@/components/custom/preview-panel";
import { ConfigureWorkflow } from "@/components/custom/configure-workflow";
import { Separator } from "@/components/ui/separator";

interface ConfigurePageContentProps {
  summary: SetupGuiViewModel;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
}

export function ConfigurePageContent({
  summary,
  formDefaults,
}: ConfigurePageContentProps) {
  return (
    <div className={LAYOUT.sectionStack}>
      <section className={SPACING.section}>
        <div className={SPACING.stackSm}>
          <h2 className={RESPONSIVE.pageTitle}>Settings / Configure</h2>
          <p className={RESPONSIVE.pageDescription}>
            Guided local setup for the Product Development Harness. Edit setup
            files, preview redacted changes, and apply local writes after
            confirmation.
          </p>
        </div>
        <div className={SPACING.inline}>
          <StatusBadge
            label={
              summary.overview.readyForLocalDoctor
                ? "Ready for local doctor"
                : "Setup incomplete"
            }
            variant={
              summary.overview.readyForLocalDoctor ? "success" : "warning"
            }
          />
          <StatusBadge
            label={
              summary.overview.configResolved
                ? "Config resolved"
                : "Config unresolved"
            }
            variant={
              summary.overview.configResolved ? "success" : "destructive"
            }
          />
        </div>
      </section>

      <ConfigureWorkflow
        initialEnv={formDefaults.env}
        initialConfig={formDefaults.config}
      />

      <SectionCard
        title="Overview"
        description="Current harness setup state and active config source."
      >
        <dl className={RESPONSIVE.twoColumnGrid}>
          <div>
            <dt className="text-sm text-muted-foreground">Config source</dt>
            <dd className="text-sm font-medium">{summary.configSource.kind}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Source label</dt>
            <dd className="text-sm font-medium break-all">
              {summary.configSource.label}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Local files present</dt>
            <dd className="text-sm font-medium">
              {summary.overview.localFilesPresent ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Ready for CLI doctor</dt>
            <dd className="text-sm font-medium">
              {summary.overview.readyForLocalDoctor ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard
        title="Local files"
        description="Gitignored operator files used for local harness setup."
      >
        <ul className={SPACING.list}>
          {summary.localFiles.map((file) => (
            <li
              key={file.path}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{file.label}</p>
                <p className="text-xs text-muted-foreground break-all">
                  {file.path}
                </p>
              </div>
              <StatusBadge
                label={file.exists ? "Present" : "Missing"}
                variant={file.exists ? "success" : "warning"}
              />
            </li>
          ))}
        </ul>
      </SectionCard>

      {summary.configSummary ? (
        <SectionCard
          title="Config summary"
          description="Parsed harness config metadata without secret values."
        >
          <dl className={RESPONSIVE.twoColumnGrid}>
            <div>
              <dt className="text-sm text-muted-foreground">Repo count</dt>
              <dd className="text-sm font-medium">
                {summary.configSummary.repoCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Linear team key</dt>
              <dd className="text-sm font-medium">
                {summary.configSummary.linearTeamKey ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Model</dt>
              <dd className="text-sm font-medium">
                {summary.configSummary.model.resolvedModelId}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Model source</dt>
              <dd className="text-sm font-medium">
                {summary.configSummary.model.source}
              </dd>
            </div>
          </dl>
          <Separator />
          <ul className={SPACING.list}>
            {summary.configSummary.repos.map((repo) => (
              <li
                key={repo.id}
                className="rounded-md border border-border bg-muted/20 p-3"
              >
                <p className="text-sm font-medium">{repo.id}</p>
                <p className="text-sm text-muted-foreground">{repo.targetRepo}</p>
                <p className="text-xs text-muted-foreground">
                  {repo.baseBranch} → {repo.productionBranch}
                  {repo.previewProvider ? ` · ${repo.previewProvider}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Environment key presence"
        description="Whether required keys are set in .env.local. Values are never displayed."
      >
        <dl className={RESPONSIVE.twoColumnGrid}>
          {Object.entries(summary.envKeyPresence).map(([key, present]) => (
            <div key={key}>
              <dt className="text-sm text-muted-foreground">{key}</dt>
              <dd>
                <StatusBadge
                  label={present ? "Set" : "Missing"}
                  variant={present ? "success" : "warning"}
                />
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title="Reference previews"
        description="Read-only dry-run previews from setup core."
      >
        <PreviewPanel
          title=".env.local reference preview"
          content={summary.generatedPreviews.envLocal}
        />
        <PreviewPanel
          title=".harness/config.local.json reference preview"
          content={summary.generatedPreviews.configLocal}
        />
      </SectionCard>

      <SectionCard
        title="Missing setup steps"
        description="Recommended next actions before live validation."
      >
        <SetupChecklist items={summary.missingSteps} />
      </SectionCard>

      <SectionCard
        title="Doctor summary"
        description={summary.doctor.remoteChecksNote}
      >
        <DoctorChecklist checks={summary.doctor.checks} />
      </SectionCard>

      <SectionCard
        title="Deferred remote actions"
        description="Remote automation writes remain disabled in Milestone 4."
      >
        <ul className={SPACING.list}>
          {summary.deferredActions.map((action) => (
            <li
              key={action.actionId}
              className="rounded-md border border-border bg-muted/20 p-4"
            >
              <div className={SPACING.inline}>
                <p className="text-sm font-medium">{action.label}</p>
                <StatusBadge label={action.scope} variant="secondary" />
              </div>
              <p className="text-sm text-muted-foreground">{action.description}</p>
              <p className="text-xs text-muted-foreground">{action.deferredReason}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Manual instructions"
        description="Copy-paste setup guidance without remote writes."
      >
        {summary.instructionPreviews.map((preview) => (
          <div key={preview.actionId} className={SPACING.stackSm}>
            <p className="text-sm font-medium">{preview.reason}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {preview.manualInstructions?.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
