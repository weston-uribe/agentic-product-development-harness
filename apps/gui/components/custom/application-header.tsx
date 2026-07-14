import { SettingsMenu } from "@/components/custom/settings-menu";
import { LAYOUT } from "@/lib/constants/layout";
import { cn } from "@/lib/utils";

type ApplicationHeaderProps = {
  configureHref?: string;
  isConfigureActive?: boolean;
};

export function ApplicationHeader({
  configureHref,
  isConfigureActive,
}: ApplicationHeaderProps) {
  return (
    <header className={cn(LAYOUT.header)}>
      <div className={LAYOUT.headerInner}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            P
          </span>
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            PDev Harness
          </span>
        </div>
        <SettingsMenu
          configureHref={configureHref}
          isConfigureActive={isConfigureActive}
        />
      </div>
    </header>
  );
}
