import Link from "next/link";

import { ThemeToggle } from "@/components/custom/theme-toggle";
import { LAYOUT } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn(LAYOUT.shell, className)}>
      <header className={LAYOUT.header}>
        <div className={LAYOUT.headerInner}>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Product Development Harness
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              Local operator GUI
            </h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <ThemeToggle />
            <Link
              href="/settings/configure"
              className="font-medium text-foreground hover:text-primary"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>
      <main className={LAYOUT.main}>{children}</main>
    </div>
  );
}
