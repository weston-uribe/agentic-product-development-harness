export {
  beginObservabilitySession,
  captureAnalyticsEvent,
  captureProductError,
  addObservabilityBreadcrumb,
  flushObservability,
  shutdownObservability,
  getActiveObservabilitySession,
  getObservabilityNonce,
  readObservabilityPreferences,
  writeObservabilityPreferences,
  resetObservabilityState,
  createObservabilityTestRecorder,
  installObservabilityUncaughtHandlers,
} from "./facade.js";

export type {
  AnalyticsEvent,
  ConsentPreference,
  ObservabilityLocalState,
  ProductErrorCaptureInput,
  TypedBreadcrumb,
} from "./types.js";

export type {
  BeginObservabilitySessionInput,
  ObservabilitySession,
} from "./facade.js";

export { OBSERVABILITY_LOCAL_FILE } from "./constants.js";
export { isObservabilityRuntimeEligible } from "./runtime-eligibility.js";
export {
  parseObservabilityPublicConfigJson,
  resolveObservabilityPublicConfigForPrepare,
  resolveTrackedObservabilityPublicConfigPath,
} from "./package-config.js";
