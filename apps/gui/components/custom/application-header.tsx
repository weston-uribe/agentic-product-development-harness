import Link from "next/link";

import { SettingsMenu } from "@/components/custom/settings-menu";
import { LAYOUT } from "@/lib/constants/layout";

type ApplicationHeaderProps = {
  settingsHref?: string;
  isSettingsActive?: boolean;
  workflowHref?: string;
  isWorkflowActive?: boolean;
};

export function ApplicationHeader({
  settingsHref,
  isSettingsActive,
  workflowHref = "/workflow",
  isWorkflowActive = false,
}: ApplicationHeaderProps) {
  return (
    <header className={LAYOUT.header}>
      <div className={LAYOUT.headerInner}>
        <Link
          href={workflowHref}
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            PDev Harness
          </span>
        </Link>
        <SettingsMenu
          settingsHref={settingsHref}
          isSettingsActive={isSettingsActive}
          workflowHref={workflowHref}
          isWorkflowActive={isWorkflowActive}
        />
      </div>
    </header>
  );
}
