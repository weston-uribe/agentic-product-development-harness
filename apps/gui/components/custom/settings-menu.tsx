"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { ChevronDown, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markConfigureClient } from "@/lib/configure-navigation-timing";
import { useThemeToggle } from "@/lib/use-theme-toggle";

type SettingsMenuProps = {
  settingsHref?: string;
  isSettingsActive?: boolean;
  configureHref?: string;
  isConfigureActive?: boolean;
  dataSharingHref?: string;
  isDataSharingActive?: boolean;
  workflowHref?: string;
  isWorkflowActive?: boolean;
};

export function SettingsMenu({
  settingsHref = "/settings",
  isSettingsActive = false,
  configureHref = "/settings/configure",
  isConfigureActive = false,
  dataSharingHref = "/settings/data-sharing",
  isDataSharingActive = false,
  workflowHref = "/workflow",
  isWorkflowActive = false,
}: SettingsMenuProps) {
  const { mounted, isDark, toggleTheme } = useThemeToggle();
  const router = useRouter();
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const prefetchRoute = useCallback(
    (href: string) => {
      if (prefetchedRoutesRef.current.has(href)) {
        return;
      }
      prefetchedRoutesRef.current.add(href);
      router.prefetch(href);
    },
    [router],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        return;
      }
      prefetchRoute(settingsHref);
      prefetchRoute(workflowHref);
    },
    [prefetchRoute, settingsHref, workflowHref],
  );

  const handleConfigureIntent = useCallback(() => {
    markConfigureClient("configure_nav_start");
    prefetchRoute(configureHref);
  }, [configureHref, prefetchRoute]);

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer gap-1.5">
          Settings
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          {mounted && isDark ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
          <span>{mounted && isDark ? "Light mode" : "Dark mode"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={workflowHref}
            aria-current={isWorkflowActive ? "page" : undefined}
            onMouseEnter={() => prefetchRoute(workflowHref)}
            onFocus={() => prefetchRoute(workflowHref)}
          >
            Workflow
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={settingsHref}
            aria-current={isSettingsActive ? "page" : undefined}
            onMouseEnter={() => prefetchRoute(settingsHref)}
            onFocus={() => prefetchRoute(settingsHref)}
          >
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={configureHref}
            aria-current={isConfigureActive ? "page" : undefined}
            onMouseEnter={handleConfigureIntent}
            onFocus={handleConfigureIntent}
          >
            Setup wizard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={dataSharingHref}
            aria-current={isDataSharingActive ? "page" : undefined}
          >
            Data sharing
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
