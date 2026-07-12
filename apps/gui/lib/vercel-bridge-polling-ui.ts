export function isRedeployPollingActive(input: {
  setupPending: boolean;
  pollActionId?: string | null;
}): boolean {
  return input.setupPending || Boolean(input.pollActionId);
}

export function canInvalidatePreviewDuringPolling(
  redeployPollingActive: boolean,
  options?: { force?: boolean },
): boolean {
  return !redeployPollingActive || options?.force === true;
}

export const REDEPLOY_POLLING_LOCK_MESSAGE =
  "Vercel production redeploy is in progress. Wait for verification to finish before changing settings.";
