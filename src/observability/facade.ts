import {
  OBSERVABILITY_FLUSH_DEADLINE_MS,
  P_DEV_OBSERVABILITY_NONCE_ENV,
} from "./constants.js";
import { resolveEffectiveConsent } from "./consent.js";
import { buildObservabilityContext } from "./context.js";
import { generateInstallationId } from "./identity.js";
import {
  isFirstLaunchForPDevHome,
  readObservabilityLocalState,
  resetObservabilityLocalState,
  updateObservabilityPreferences,
  type UpdateObservabilityPreferencesInput,
} from "./local-state.js";
import { readObservabilityPublicConfig } from "./package-config.js";
import { isObservabilityRuntimeEligible } from "./runtime-eligibility.js";
import {
  analyticsEventToProperties,
  allowedAnalyticsPropertyKeysForEvent,
  assertAllowedPropertyKeys,
} from "./privacy-schema.js";
import {
  guidedDisplayStepNumber,
  type GuidedDisplayStepId,
} from "./analytics-schemas.js";
import { resolveObservabilityHandoff } from "./session-handoff.js";
import {
  recordAnalyticsEventEmission,
  shouldDedupeAnalyticsEvent,
} from "./session-dedupe.js";
import {
  installObservabilityFatalHandlers,
  removeObservabilityFatalHandlers,
} from "./fatal-handlers.js";
import {
  createAnalyticsLifecycle,
  createErrorLifecycle,
  type CategoryTransportLifecycle,
} from "./transport-lifecycle.js";
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
const analyticsLifecycle: CategoryTransportLifecycle<AnalyticsTransport> =
  createAnalyticsLifecycle();
const errorLifecycle: CategoryTransportLifecycle<ErrorTransport> =
  createErrorLifecycle();
let runtimeEligible = false;
let activeFakeRecorder: FakeTransportRecorder | undefined;
let analyticsAdapterFactory: (() => AnalyticsTransport) | null = null;
let errorAdapterFactory:
  | ((input: {
      context: ObservabilityContext;
      moduleUrl?: string;
      env?: NodeJS.ProcessEnv;
    }) => ErrorTransport)
  | null = null;
let parentOwnershipReleased = false;
let displayedConfigureStepId: GuidedDisplayStepId | null = null;
let activeProvisioningOperationId: string | null = null;

export function registerAnalyticsAdapterFactory(
  factory: () => AnalyticsTransport,
): void {
  analyticsAdapterFactory = factory;
}

export function registerErrorAdapterFactory(
  factory: (input: {
    context: ObservabilityContext;
    moduleUrl?: string;
    env?: NodeJS.ProcessEnv;
  }) => ErrorTransport,
): void {
  errorAdapterFactory = factory;
}

export function registerDisplayedConfigureStep(stepId: GuidedDisplayStepId): void {
  displayedConfigureStepId = stepId;
}

export function registerProvisioningOperationId(operationId: string): void {
  activeProvisioningOperationId = operationId;
}

export function isAnalyticsCaptureEnabled(): boolean {
  return (
    runtimeEligible &&
    !parentOwnershipReleased &&
    analyticsLifecycle.isCaptureEnabled() &&
    Boolean(activeSession?.consent.analyticsEnabled)
  );
}

export function isErrorReportingCaptureEnabled(): boolean {
  return (
    runtimeEligible &&
    !parentOwnershipReleased &&
    errorLifecycle.isCaptureEnabled() &&
    Boolean(activeSession?.consent.errorReportingEnabled)
  );
}

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

function createAnalyticsAdapter(input: {
  fakeRecorder?: FakeTransportRecorder;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
}): AnalyticsTransport | null {
  if (input.fakeRecorder) {
    return createFakeAnalyticsTransport(input.fakeRecorder);
  }
  if (analyticsAdapterFactory) {
    return analyticsAdapterFactory();
  }
  const publicConfig = readObservabilityPublicConfig(
    input.moduleUrl,
    input.env,
  );
  if (publicConfig?.posthogProjectToken) {
    try {
      return createPostHogAnalyticsTransport({
        projectToken: publicConfig.posthogProjectToken,
        host: publicConfig.posthogIngestionHost,
      });
    } catch {
      return null;
    }
  }
  return null;
}

function createErrorAdapter(input: {
  fakeRecorder?: FakeTransportRecorder;
  context: ObservabilityContext;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
}): ErrorTransport | null {
  if (input.fakeRecorder) {
    return createFakeErrorTransport(input.fakeRecorder);
  }
  if (errorAdapterFactory) {
    return errorAdapterFactory(input);
  }
  const publicConfig = readObservabilityPublicConfig(
    input.moduleUrl,
    input.env,
  );
  if (input.context && publicConfig?.sentryPublicDsn) {
    try {
      return createSentryErrorTransport({
        dsn: publicConfig.sentryPublicDsn,
        release: `p-dev-harness@${input.context.packageVersion}`,
      });
    } catch {
      return null;
    }
  }
  return null;
}

async function syncAnalyticsTransport(input: {
  consent: EffectiveConsent;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
  fakeRecorder?: FakeTransportRecorder;
}): Promise<void> {
  if (!input.consent.analyticsEnabled) {
    await analyticsLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS);
    return;
  }
  const adapter = createAnalyticsAdapter(input);
  if (!adapter) {
    await analyticsLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS);
    return;
  }
  await analyticsLifecycle.enable(() => adapter);
}

async function syncErrorTransport(input: {
  consent: EffectiveConsent;
  context: ObservabilityContext;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
  fakeRecorder?: FakeTransportRecorder;
}): Promise<void> {
  if (!input.consent.errorReportingEnabled) {
    await errorLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS);
    return;
  }
  const adapter = createErrorAdapter(input);
  if (!adapter) {
    await errorLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS);
    return;
  }
  await errorLifecycle.enable(() => adapter);
}

async function configureTransports(input: {
  consent: EffectiveConsent;
  context: ObservabilityContext;
  moduleUrl?: string;
  env?: NodeJS.ProcessEnv;
  fakeRecorder?: FakeTransportRecorder;
  analyticsOnly?: boolean;
  errorOnly?: boolean;
}): Promise<void> {
  if (!input.analyticsOnly && !input.errorOnly) {
    await Promise.all([
      syncAnalyticsTransport(input),
      syncErrorTransport(input),
    ]);
    return;
  }
  if (input.analyticsOnly) {
    await syncAnalyticsTransport(input);
    return;
  }
  if (input.errorOnly) {
    await syncErrorTransport(input);
  }
}

function emitSessionStartedIfNeeded(): void {
  if (!activeSession || !isAnalyticsCaptureEnabled()) {
    return;
  }
  const event: AnalyticsEvent = { type: "p_dev_session_started" };
  if (
    shouldDedupeAnalyticsEvent(activeSession.sessionId, event)
  ) {
    return;
  }
  captureAnalyticsEvent(event);
}

function emitDisplayedConfigureStepViewIfNeeded(): void {
  if (!activeSession || !displayedConfigureStepId || !isAnalyticsCaptureEnabled()) {
    return;
  }
  const stepId = displayedConfigureStepId;
  captureAnalyticsEvent({
    type: "p_dev_configure_step_viewed",
    stepId,
    stepNumber: guidedDisplayStepNumber(stepId),
    resumed: false,
    revisited: false,
  });
}

export async function beginObservabilitySession(
  input: BeginObservabilitySessionInput,
): Promise<ObservabilitySession | null> {
  const env = input.env ?? process.env;
  parentOwnershipReleased = false;
  runtimeEligible = isObservabilityRuntimeEligible({
    env,
    allowFakeTransport: Boolean(input.fakeRecorder),
  });

  if (!runtimeEligible) {
    activeSession = null;
    activeFakeRecorder = undefined;
    await Promise.all([
      analyticsLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
      errorLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
    ]);
    return null;
  }

  const localState = await readObservabilityLocalState(input.workspaceDir);
  const consent = resolveEffectiveConsent({
    analyticsPreference: localState.analyticsPreference,
    errorReportingPreference: localState.errorReportingPreference,
    env,
  });

  const handoff = resolveObservabilityHandoff(env);

  const context = buildObservabilityContext({
    sessionId: handoff.sessionId,
    installationId: consent.analyticsEnabled
      ? localState.installationId
      : undefined,
    firstLaunchForPDevHome: isFirstLaunchForPDevHome(localState),
    workspaceKind: input.workspaceKind,
    moduleUrl: input.moduleUrl,
    env,
  });

  activeFakeRecorder = input.fakeRecorder;
  await configureTransports({
    consent,
    context,
    moduleUrl: input.moduleUrl,
    env,
    fakeRecorder: input.fakeRecorder,
  });

  activeSession = {
    workspaceDir: input.workspaceDir,
    sessionId: handoff.sessionId,
    nonce: handoff.nonce,
    context,
    consent,
    localState,
  };

  emitSessionStartedIfNeeded();
  emitDisplayedConfigureStepViewIfNeeded();

  return activeSession;
}

export function getActiveObservabilitySession(): ObservabilitySession | null {
  return activeSession;
}

export function getObservabilityNonce(): string | null {
  return (
    activeSession?.nonce ??
    process.env[P_DEV_OBSERVABILITY_NONCE_ENV]?.trim() ??
    null
  );
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
  const previousConsent = activeSession?.consent;
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

  const analyticsChanged =
    previousConsent?.analyticsEnabled !== consent.analyticsEnabled;
  const errorChanged =
    previousConsent?.errorReportingEnabled !== consent.errorReportingEnabled;

  try {
    if (analyticsChanged) {
      await configureTransports({
        consent,
        context: activeSession.context,
        fakeRecorder: activeFakeRecorder,
        analyticsOnly: true,
      });
      if (consent.analyticsEnabled) {
        emitSessionStartedIfNeeded();
        emitDisplayedConfigureStepViewIfNeeded();
      }
    }
    if (errorChanged) {
      await configureTransports({
        consent,
        context: activeSession.context,
        fakeRecorder: activeFakeRecorder,
        errorOnly: true,
      });
    }
  } catch {
    // vendor failures must not fail preference persistence
  }

  return activeSession;
}

export async function resetObservabilityState(
  workspaceDir: string,
): Promise<void> {
  await Promise.all([
    analyticsLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
    errorLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
  ]);

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
  }
}

export async function releaseParentObservabilityOwnership(): Promise<void> {
  if (parentOwnershipReleased) {
    return;
  }
  parentOwnershipReleased = true;
  removeObservabilityFatalHandlers();
  await Promise.all([
    analyticsLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
    errorLifecycle.disableAndDrop(OBSERVABILITY_FLUSH_DEADLINE_MS),
  ]);
}

export function captureAnalyticsEvent(event: AnalyticsEvent): void {
  if (!isAnalyticsCaptureEnabled() || !activeSession) {
    return;
  }

  const operationId =
    event.type === "p_dev_workspace_provision_started" ||
    event.type === "p_dev_workspace_provision_completed" ||
    event.type === "p_dev_workspace_provision_failed"
      ? activeProvisioningOperationId ?? undefined
      : undefined;

  if (shouldDedupeAnalyticsEvent(activeSession.sessionId, event, operationId)) {
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
    analyticsLifecycle.getAdapter().capture(payload);
    recordAnalyticsEventEmission(
      activeSession.sessionId,
      event,
      operationId,
    );
  } catch {
    // best-effort
  }
}

export function captureProductError(input: ProductErrorCaptureInput): void {
  if (!isErrorReportingCaptureEnabled()) {
    return;
  }

  const context = contextToSentryTags(
    activeSession!.context,
    input.lifecyclePhase,
  );
  try {
    errorLifecycle.getAdapter().captureError(input, context);
  } catch {
    // best-effort
  }
}

export function addObservabilityBreadcrumb(breadcrumb: TypedBreadcrumb): void {
  if (!isErrorReportingCaptureEnabled()) {
    return;
  }
  try {
    errorLifecycle.getAdapter().addBreadcrumb(breadcrumb);
  } catch {
    // best-effort
  }
}

export async function flushObservability(
  deadlineMs = OBSERVABILITY_FLUSH_DEADLINE_MS,
): Promise<void> {
  await Promise.allSettled([
    analyticsLifecycle.getAdapter().flush(deadlineMs),
    errorLifecycle.getAdapter().flush(deadlineMs),
  ]);
}

export async function shutdownObservability(
  deadlineMs = OBSERVABILITY_FLUSH_DEADLINE_MS,
): Promise<void> {
  removeObservabilityFatalHandlers();
  await Promise.all([
    analyticsLifecycle.shutdown(deadlineMs, { flush: true }),
    errorLifecycle.shutdown(deadlineMs, { flush: true }),
  ]);
  activeSession = null;
  activeFakeRecorder = undefined;
  parentOwnershipReleased = false;
  displayedConfigureStepId = null;
  activeProvisioningOperationId = null;
}

export function createObservabilityTestRecorder(): FakeTransportRecorder {
  return createFakeTransportRecorder();
}

export function installObservabilityUncaughtHandlers(): () => void {
  return installObservabilityFatalHandlers(captureProductError);
}
