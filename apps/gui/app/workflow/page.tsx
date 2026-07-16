import { AppShell } from "@/components/custom/app-shell";
import { OperationsPageClient } from "@/components/operations/operations-page-client";
import { loadOperationsBootstrap, sanitizeBootstrapPayload } from "@/lib/operations-server";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; fixture?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const bootstrap = sanitizeBootstrapPayload(
    await loadOperationsBootstrap({
      source: params.source ?? null,
      fixture: params.fixture ?? null,
      scope: params.scope ?? null,
    }),
  );

  return (
    <AppShell>
      <OperationsPageClient initialBootstrap={bootstrap} />
    </AppShell>
  );
}
