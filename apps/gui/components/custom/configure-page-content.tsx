import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
import type { VercelSetupSummary } from "@harness/setup/vercel-setup-summary";
import { ConfigureExperience } from "@/components/custom/configure-experience";

interface ConfigurePageContentProps {
  summary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
  linearSummary: LinearSetupSummary;
  vercelSummary: VercelSetupSummary;
  observabilityNonce: string | null;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      githubDispatchRepository: string;
      suggestedHarnessDispatchRepo?: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
        VERCEL_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
}

export function ConfigurePageContent({
  summary,
  remoteSummary,
  linearSummary,
  vercelSummary,
  formDefaults,
  observabilityNonce,
}: ConfigurePageContentProps) {
  return (
    <ConfigureExperience
      initialSummary={summary}
      initialRemoteSummary={remoteSummary}
      initialLinearSummary={linearSummary}
      initialVercelSummary={vercelSummary}
      formDefaults={formDefaults}
      observabilityNonce={observabilityNonce}
    />
  );
}
