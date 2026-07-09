"use client";

import type { PrimarySetupTask } from "@harness/setup/first-run-readiness";
import { AlertCircle } from "lucide-react";

import { SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";

interface PrimarySetupTaskCardProps {
  task: PrimarySetupTask;
  onPrimaryAction: () => void;
  onShowDetails: () => void;
}

export function PrimarySetupTaskCard({
  task,
  onPrimaryAction,
  onShowDetails,
}: PrimarySetupTaskCardProps) {
  return (
    <SectionCard
      title={task.title}
      description="One clear action at a time."
    >
      <div className={SPACING.stackSm}>
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className={SPACING.stackSm}>
            <p className="text-sm font-medium">{task.problem}</p>
            <p className="text-sm text-muted-foreground">{task.whyItMatters}</p>
          </div>
        </div>

        <div className={SPACING.stackSm}>
          <p className="text-sm font-medium">Needed from you</p>
          <p className="text-sm text-muted-foreground">{task.neededFromYou}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onPrimaryAction}>
            {task.primaryCtaLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onShowDetails}>
            {task.secondaryCtaLabel}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
