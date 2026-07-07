/**
 * Linear statuses that should trigger a GitHub repository_dispatch.
 * Aligned with harness.config.json linear.eligibleStatuses trigger entries.
 */
export const DISPATCH_TRIGGER_STATUSES = [
  "Ready for Planning",
  "Ready for Build",
  "PR Open",
  "Needs Revision",
  "Ready to Merge",
] as const;

export type DispatchTriggerStatus = (typeof DISPATCH_TRIGGER_STATUSES)[number];

const NORMALIZED_DISPATCH_STATUSES = new Set(
  DISPATCH_TRIGGER_STATUSES.map((status) => status.toLowerCase()),
);

export function isDispatchTriggerStatus(
  status: string | null | undefined,
): status is DispatchTriggerStatus {
  if (!status) {
    return false;
  }
  return NORMALIZED_DISPATCH_STATUSES.has(status.trim().toLowerCase());
}
