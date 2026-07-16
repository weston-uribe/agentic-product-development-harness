"use client";

import Link from "next/link";
import { ChevronDown, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeToggle } from "@/lib/use-theme-toggle";

type SettingsMenuProps = {
  configureHref?: string;
  isConfigureActive?: boolean;
  dataSharingHref?: string;
  isDataSharingActive?: boolean;
  workflowHref?: string;
  isWorkflowActive?: boolean;
};

export function SettingsMenu({
  configureHref = "/settings/configure",
  isConfigureActive = false,
  dataSharingHref = "/settings/data-sharing",
  isDataSharingActive = false,
  workflowHref = "/workflow",
  isWorkflowActive = false,
}: SettingsMenuProps) {
  const { mounted, isDark, toggleTheme } = useThemeToggle();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
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
          >
            Workflow
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={configureHref}
            aria-current={isConfigureActive ? "page" : undefined}
          >
            Configure
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
