import type { SetupGuiViewModel } from "@/lib/setup-server";
import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { SetupChecklist, DoctorChecklist } from "@/components/custom/setup-checklist";
import { PreviewPanel } from "@/components/custom/preview-panel";
import { Separator } from "@/components/ui/separator";
import type { ChecklistItemStatus } from "@/components/custom/setup-checklist";

interface SetupReadonlySectionsProps {
  summary: SetupGuiViewModel;
  checklistItems: Array<{
    id: string;
    label: string;
    detail: string;
    status?: ChecklistItemStatus;
  }>;
}

export function SetupReadonlySections({
  summary,
  checklistItems,
}: SetupReadonlySectionsProps) {
  return (
    <>
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
        title="Setup checklist"
        description="Recommended next actions before a future first harness run."
      >
        <SetupChecklist items={checklistItems} />
      </SectionCard>

      <SectionCard
        title="Doctor summary"
        description={summary.doctor.remoteChecksNote}
      >
        <DoctorChecklist checks={summary.doctor.checks} />
      </SectionCard>

      <SectionCard
        title="Manual instructions"
        description="Copy-paste setup guidance for local and remote setup."
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
    </>
  );
}

export function SetupDashboardGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={LAYOUT.sectionStack}>
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}
