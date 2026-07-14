import {
  OBSERVABILITY_FLUSH_DEADLINE_MS,
  P_DEV_OBSERVABILITY_NONCE_ENV,
  P_DEV_OBSERVABILITY_SESSION_ID_ENV,
} from "./constants.js";
import { resolveEffectiveConsent } from "./consent.js";
import { buildObservabilityContext } from "./context.js";
import {
  generateInstallationId,
  generateObservabilityNonce,
  generateSessionId,
} from "./identity.js";
import {
  isFirstLaunchForPDevHome,
  readObservabilityLocalState,
  resetObservabilityLocalState,
  updateObservabilityPreferences,
  type UpdateObservabilityPreferencesInput,
} from "./local-state.js";
import { readObservabilityPublicConfig } from "./package-config.js";
import {
  analyticsEventToProperties,
  allowedAnalyticsPropertyKeysForEvent,
  assertAllowedPropertyKeys,
} from "./privacy-schema.js";
import { isObservabilityRuntimeEligible } from "./runtime-eligibility.js";
import type {
  AllowedSentryContext,
  AnalyticsEvent,
  AnalyticsTransport,
  EffectiveConsent,
  ErrorTransport,
  FakeTransportRecorder,
  ObservabilityContext,
  ObservabilityLocalState,
  ProductErrorCaptureInput,
  SerializedAnalyticsEvent,
  TypedBreadcrumb,
  WorkspaceKind,
} from "./types.js";
import {
  createFakeAnalyticsTransport,
  createFakeErrorTransport,
  createFakeTransportRecorder,
} from "./adapters/fake.js";
import {
  createNoopAnalyticsTransport,
  createNoopErrorTransport,
} from "./adapters/noop.js";
import { createPostHogAnalyticsTransport } from "./adapters/posthog.js";
import { createSentryErrorTransport } from "./adapters/sentry.js";

export interface BeginObservabilitySessionInput {
  workspaceDir: string;
  workspaceKind?: WorkspaceKind;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
  fakeRecorder?: FakeTransportRecorder;
}

export interface ObservabilitySession {
  workspaceDir: string;
  sessionId: string;
  nonce: string;
  context: ObservabilityContext;
  consent: EffectiveConsent;
  localState: ObservabilityLocalState;
}

let activeSession: ObservabilitySession | null = null;
let analyticsTransport: AnalyticsTransport = createNoopAnalyticsTransport();
let errorTransport: ErrorTransport = createNoopErrorTransport();
let sessionStartedEmitted = false;
let runtimeEligible = false;
let activeFakeRecorder: FakeTransportRecorder | undefined;

function contextToCommonAnalyticsProperties(
  context: ObservabilityContext,
): Record<string, unknown> {
  if (!context.installationId) {
    throw new Error("Analytics requires an anonymous installation ID.");
  }
  return {
    observability_schema_version: context.observabilitySchemaVersion,
    package_version: context.packageVersion,
    release_sha: context.releaseSha,
    runtime_mode: context.runtimeMode,
    os_family: context.osFamily,
    cpu_arch_family: context.cpuArchFamily,
    node_major_version: context.nodeMajorVersion,
    session_id: context.sessionId,
    first_launch_for_p_dev_home: context.firstLaunchForPDevHome,
    workspace_kind: context.workspaceKind,
    distinct_id: context.installationId,
    $process_person_profile: false,
  };
}

function contextToSentryTags(
  context: ObservabilityContext,
  lifecyclePhase: AllowedSentryContext["lifecycle_phase"],
): AllowedSentryContext {
  return {
    observability_schema_version: context.observabilitySchemaVersion,
    package_version: context.packageVersion,
    release_sha: context.releaseSha,
    session_id: context.sessionId,
    runtime_mode: context.runtimeMode,
    os_family: context.osFamily,
    cpu_arch_family: context.cpuArchFamily,
    node_major_version: context.nodeMajorVersion,
    lifecycle_phase: lifecyclePhase,
  };
}

function configureTransports(input: {
  consent: EffectiveConsent;
  context: ObservabilityContext;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
  fakeRecorder?: FakeTransportRecorder;
}): void {
  analyticsTransport = createNoopAnalyticsTransport();
  errorTransport = createNoopErrorTransport();

  if (input.fakeRecorder) {
    if (input.consent.analyticsEnabled) {
      analyticsTransport = createFakeAnalyticsTransport(input.fakeRecorder);
    }
    if (input.consent.errorReportingEnabled) {
      errorTransport = createFakeErrorTransport(input.fakeRecorder);
    }
    return;
  }

  const publicConfig = readObservabilityPublicConfig(
    input.moduleUrl,
    input.env,
  );

  if (input.consent.analyticsEnabled && publicConfig?.posthogProjectToken) {
    try {
      analyticsTransport = createPostHogAnalyticsTransport({
        projectToken: publicConfig.posthogProjectToken,
        host: publicConfig.posthogIngestionHost,
      });
    } catch {
      analyticsTransport = createNoopAnalyticsTransport();
    }
  }

  if (input.consent.errorReportingEnabled && publicConfig?.sentryPublicDsn) {
    try {
      errorTransport = createSentryErrorTransport({
        dsn: publicConfig.sentryPublicDsn,
        release: `p-dev-harness@${input.context.packageVersion}`,
      });
    } catch {
      errorTransport = createNoopErrorTransport();
    }
  }
}

export async function beginObservabilitySession(
  input: BeginObservabilitySessionInput,
): Promise<ObservabilitySession | null> {
  const env = input.env ?? process.env;
  runtimeEligible = isObservabilityRuntimeEligible({
    env,
    allowFakeTransport: Boolean(input.fakeRecorder),
  });

  if (!runtimeEligible) {
    activeSession = null;
    activeFakeRecorder = undefined;
    analyticsTransport = createNoopAnalyticsTransport();
    errorTransport = createNoopErrorTransport();
    sessionStartedEmitted = false;
    return null;
  }

  const localState = await readObservabilityLocalState(input.workspaceDir);
  const consent = resolveEffectiveConsent({
    analyticsPreference: localState.analyticsPreference,
    errorReportingPreference: localState.errorReportingPreference,
    env,
  });

  const sessionId =
    env[P_DEV_OBSERVABILITY_SESSION_ID_ENV]?.trim() || generateSessionId();
  const nonce =
    env[P_DEV_OBSERVABILITY_NONCE_ENV]?.trim() || generateObservabilityNonce();

  const context = buildObservabilityContext({
    sessionId,
    installationId: consent.analyticsEnabled
      ? localState.installationId
      : undefined,
    firstLaunchForPDevHome: isFirstLaunchForPDevHome(localState),
    workspaceKind: input.workspaceKind,
    moduleUrl: input.moduleUrl,
    env,
  });

  activeFakeRecorder = input.fakeRecorder;

  configureTransports({
    consent,
    context,
    moduleUrl: input.moduleUrl,
    env,
    fakeRecorder: input.fakeRecorder,
  });

  activeSession = {
    workspaceDir: input.workspaceDir,
    sessionId,
    nonce,
    context,
    consent,
    localState,
  };
  sessionStartedEmitted = false;

  if (consent.analyticsEnabled && !sessionStartedEmitted) {
    captureAnalyticsEvent({ type: "p_dev_session_started" });
    sessionStartedEmitted = true;
  }

  return activeSession;
}

export function getActiveObservabilitySession(): ObservabilitySession | null {
  return activeSession;
}

export function getObservabilityNonce(): string | null {
  return activeSession?.nonce ?? null;
}

export async function readObservabilityPreferences(
  workspaceDir: string,
): Promise<ObservabilityLocalState> {
  return readObservabilityLocalState(workspaceDir);
}

export async function writeObservabilityPreferences(
  workspaceDir: string,
  input: UpdateObservabilityPreferencesInput,
): Promise<ObservabilitySession | null> {
  let localState = await readObservabilityLocalState(workspaceDir);

  if (
    input.analyticsPreference === "enabled" &&
    !localState.installationId
  ) {
    localState = await updateObservabilityPreferences(workspaceDir, {
      installationId: generateInstallationId(),
    });
  }

  localState = await updateObservabilityPreferences(workspaceDir, input);

  if (!activeSession || activeSession.workspaceDir !== workspaceDir) {
    return activeSession;
  }

  const consent = resolveEffectiveConsent({
    analyticsPreference: localState.analyticsPreference,
    errorReportingPreference: localState.errorReportingPreference,
    env: process.env,
  });

  activeSession = {
    ...activeSession,
    consent,
    localState,
    context: {
      ...activeSession.context,
      installationId: consent.analyticsEnabled
        ? localState.installationId
        : undefined,
    },
  };

  configureTransports({
    consent,
    context: activeSession.context,
    fakeRecorder: activeFakeRecorder,
  });

  return activeSession;
}

export async function resetObservabilityState(
  workspaceDir: string,
): Promise<void> {
  await resetObservabilityLocalState(workspaceDir);
  if (activeSession?.workspaceDir === workspaceDir) {
    activeSession = {
      ...activeSession,
      localState: await readObservabilityLocalState(workspaceDir),
      consent: resolveEffectiveConsent({
        analyticsPreference: null,
        errorReportingPreference: null,
      }),
      context: {
        ...activeSession.context,
        installationId: undefined,
      },
    };
    configureTransports({
      consent: activeSession.consent,
      context: activeSession.context,
      fakeRecorder: activeFakeRecorder,
    });
  }
}

export function captureAnalyticsEvent(event: AnalyticsEvent): void {
  if (!activeSession?.consent.analyticsEnabled || !runtimeEligible) {
    return;
  }

  const eventProperties = analyticsEventToProperties(event);
  const allowedKeys = allowedAnalyticsPropertyKeysForEvent(event);
  assertAllowedPropertyKeys(eventProperties, allowedKeys);

  const properties = {
    ...contextToCommonAnalyticsProperties(activeSession.context),
    ...eventProperties,
  };
  assertAllowedPropertyKeys(properties, allowedKeys);

  const payload: SerializedAnalyticsEvent = {
    event: event.type,
    properties,
  };
  try {
    analyticsTransport.capture(payload);
  } catch {
    // best-effort
  }
}

export function captureProductError(input: ProductErrorCaptureInput): void {
  if (!activeSession?.consent.errorReportingEnabled || !runtimeEligible) {
    return;
  }

  const context = contextToSentryTags(
    activeSession.context,
    input.lifecyclePhase,
  );
  try {
    errorTransport.captureError(input, context);
  } catch {
    // best-effort
  }
}

export function addObservabilityBreadcrumb(breadcrumb: TypedBreadcrumb): void {
  if (!activeSession?.consent.errorReportingEnabled || !runtimeEligible) {
    return;
  }
  try {
    errorTransport.addBreadcrumb(breadcrumb);
  } catch {
    // best-effort
  }
}

export async function flushObservability(
  deadlineMs = OBSERVABILITY_FLUSH_DEADLINE_MS,
): Promise<void> {
  await Promise.allSettled([
    analyticsTransport.flush(deadlineMs),
    errorTransport.flush(deadlineMs),
  ]);
}

export async function shutdownObservability(
  deadlineMs = OBSERVABILITY_FLUSH_DEADLINE_MS,
): Promise<void> {
  await flushObservability(deadlineMs);
  await Promise.allSettled([
    analyticsTransport.shutdown(),
    errorTransport.shutdown(),
  ]);
  activeSession = null;
  activeFakeRecorder = undefined;
  sessionStartedEmitted = false;
}

export function createObservabilityTestRecorder(): FakeTransportRecorder {
  return createFakeTransportRecorder();
}

export function installObservabilityUncaughtHandlers(): void {
  process.on("uncaughtException", (error) => {
    captureProductError({
      lifecyclePhase: "launcher_startup",
      productErrorCode: "uncaught_exception",
      errorCategory: "unexpected",
      cause: error,
    });
  });
  process.on("unhandledRejection", (reason) => {
    captureProductError({
      lifecyclePhase: "launcher_startup",
      productErrorCode: "unhandled_rejection",
      errorCategory: "unexpected",
      cause: reason,
    });
  });
}
