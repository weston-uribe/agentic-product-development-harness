import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import { ConfigureExperience } from "@/components/custom/configure-experience";

interface ConfigurePageContentProps {
  summary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
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
  remoteSummary,
  formDefaults,
}: ConfigurePageContentProps) {
  return (
    <ConfigureExperience
      initialSummary={summary}
      initialRemoteSummary={remoteSummary}
      formDefaults={formDefaults}
    />
  );
}
