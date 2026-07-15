import { AppShell } from "@/components/custom/app-shell";
import { OperationsPageClient } from "@/components/operations/operations-page-client";
import { loadOperationsBootstrap } from "@/lib/operations-server";

export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; fixture?: string }>;
}) {
  const params = await searchParams;
  const bootstrap = await loadOperationsBootstrap({
    source: params.source ?? null,
    fixture: params.fixture ?? null,
  });

  return (
    <AppShell>
      <OperationsPageClient initialBootstrap={bootstrap} />
    </AppShell>
  );
}
