export const RUNNER_UPGRADE_STATUS_PROVIDER_TIMEOUT_MS = 5_000;
export const RUNNER_UPGRADE_STATUS_OVERALL_DEADLINE_MS = 8_000;
export const RUNNER_UPGRADE_WORKER_PROVIDER_TIMEOUT_MS = 60_000;
export const RUNNER_UPGRADE_WORKER_COMPARE_BATCH_TIMEOUT_MS = 30_000;
export const RUNNER_UPGRADE_NO_PROGRESS_STALE_MS = 30_000;
export const RUNNER_UPGRADE_HEARTBEAT_EVERY_FILES = 5;

export class RunnerUpgradeTimeoutError extends Error {
  readonly code = "runner_upgrade_timeout";
  readonly retryable = true;

  constructor(
    message: string,
    readonly callName: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "RunnerUpgradeTimeoutError";
  }
}

export interface RunnerUpgradeCallTiming {
  call: string;
  durationMs: number;
  timedOut: boolean;
}

let lastStatusCallTimings: RunnerUpgradeCallTiming[] = [];

export function getLastRunnerUpgradeStatusCallTimings(): RunnerUpgradeCallTiming[] {
  return [...lastStatusCallTimings];
}

export function recordRunnerUpgradeStatusCallTimings(
  timings: RunnerUpgradeCallTiming[],
): void {
  lastStatusCallTimings = [...timings];
}

export async function withRunnerUpgradeTimeout<T>(
  callName: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const started = Date.now();
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(
              new RunnerUpgradeTimeoutError(
                `${callName} timed out after ${timeoutMs}ms.`,
                callName,
                timeoutMs,
              ),
            );
          },
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    if (controller.signal.aborted) {
      // timing recorded by caller when needed
      void durationMs;
    }
  }
}

export async function withTimedRunnerUpgradeCall<T>(
  callName: string,
  timeoutMs: number,
  operation: () => Promise<T>,
  onTiming?: (timing: RunnerUpgradeCallTiming) => void,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await withRunnerUpgradeTimeout(callName, timeoutMs, async () =>
      operation(),
    );
    onTiming?.({
      call: callName,
      durationMs: Date.now() - started,
      timedOut: false,
    });
    return result;
  } catch (error) {
    const timedOut = error instanceof RunnerUpgradeTimeoutError;
    onTiming?.({
      call: callName,
      durationMs: Date.now() - started,
      timedOut,
    });
    throw error;
  }
}

export function isRunnerUpgradeProgressStale(input: {
  updatedAt?: string;
  lastSuccessfulProviderCallAt?: string;
  workerHeartbeatAt?: string;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  const staleMs = input.staleMs ?? RUNNER_UPGRADE_NO_PROGRESS_STALE_MS;
  const nowMs = input.nowMs ?? Date.now();
  const updatedAtMs = input.updatedAt ? Date.parse(input.updatedAt) : Number.NaN;
  const heartbeatSource =
    input.lastSuccessfulProviderCallAt ?? input.workerHeartbeatAt;
  const heartbeatMs = heartbeatSource ? Date.parse(heartbeatSource) : Number.NaN;
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(heartbeatMs)) {
    return false;
  }
  return nowMs - updatedAtMs >= staleMs && nowMs - heartbeatMs >= staleMs;
}

/** Client-safe: no Node fs imports. */
export function runnerUpgradeProgressShowsNoProgress(
  progress:
    | {
        updatedAt?: string;
        lastSuccessfulProviderCallAt?: string;
        workerHeartbeatAt?: string;
      }
    | null
    | undefined,
  nowMs = Date.now(),
): boolean {
  if (!progress) {
    return false;
  }
  return isRunnerUpgradeProgressStale({
    updatedAt: progress.updatedAt,
    lastSuccessfulProviderCallAt: progress.lastSuccessfulProviderCallAt,
    workerHeartbeatAt: progress.workerHeartbeatAt,
    nowMs,
  });
}
