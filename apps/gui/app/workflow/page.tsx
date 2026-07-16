import { AppShell } from "@/components/custom/app-shell";
import { WorkflowPageClient } from "@/components/workflow/workflow-page-client";
import { loadWorkflowBootstrap } from "@/lib/workflow-server";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; fixture?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const bootstrap = await loadWorkflowBootstrap({
    source: params.source ?? null,
    fixture: params.fixture ?? null,
    scope: params.scope ?? null,
  });

  return (
    <AppShell isWorkflowActive>
      <WorkflowPageClient initialBootstrap={bootstrap} />
    </AppShell>
  );
}
