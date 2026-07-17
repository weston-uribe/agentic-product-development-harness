import { SettingsModelsClient } from "@/components/settings/settings-models-client";
import { loadWorkflowBootstrap } from "@/lib/workflow-server";

export const dynamic = "force-dynamic";

export default async function SettingsModelsPage() {
  const bootstrap = await loadWorkflowBootstrap({
    source: null,
    fixture: null,
    scope: null,
  });

  return <SettingsModelsClient initialBootstrap={bootstrap} />;
}
