import type {
  EvaluationRuntime,
  EvaluationRuntimeConfig,
  NestedObservationHandle,
  ObservationKind,
  PhaseFinishSummary,
  PhaseTraceHandle,
  StartPhaseTraceInput,
} from "./types.js";
import {
  EVALUATION_CAPTURE_PROFILE,
  EVALUATION_SCHEMA_VERSION,
} from "./types.js";
import { deriveSessionId, buildTraceSeed } from "./identifiers.js";
import { buildMetadataV1, metadataToStringMap } from "./capture-policy.js";
import { warnOnce, withFlushTimeout } from "./warn.js";
import { CREDENTIAL_SECRET_PATTERNS } from "../artifacts/redact.js";

type LangfuseModules = {
  createTraceId: (seed?: string) => Promise<string>;
  startObservation: (
    name: string,
    attributes?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => LangfuseObservation;
  propagateAttributes: <T>(
    params: {
      sessionId?: string;
      metadata?: Record<string, string>;
      traceName?: string;
    },
    fn: () => T,
  ) => T;
  setLangfuseTracerProvider: (provider: unknown) => void;
  LangfuseSpanProcessor: new (params: Record<string, unknown>) => {
    forceFlush: () => Promise<void>;
    shutdown: () => Promise<void>;
  };
  NodeTracerProvider: new (params: {
    spanProcessors: unknown[];
  }) => { shutdown?: () => Promise<void> };
};

type LangfuseObservation = {
  update: (attrs: Record<string, unknown>) => LangfuseObservation;
  end: () => void;
  startObservation: (
    name: string,
    attributes?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => LangfuseObservation;
};

async function loadLangfuseModules(): Promise<LangfuseModules> {
  const [tracing, otel, sdkTraceNode] = await Promise.all([
    import("@langfuse/tracing"),
    import("@langfuse/otel"),
    import("@opentelemetry/sdk-trace-node"),
  ]);

  return {
    createTraceId: tracing.createTraceId,
    startObservation: tracing.startObservation as LangfuseModules["startObservation"],
    propagateAttributes:
      tracing.propagateAttributes as LangfuseModules["propagateAttributes"],
    setLangfuseTracerProvider: tracing.setLangfuseTracerProvider as (
      provider: unknown,
    ) => void,
    LangfuseSpanProcessor: otel.LangfuseSpanProcessor as LangfuseModules["LangfuseSpanProcessor"],
    NodeTracerProvider:
      sdkTraceNode.NodeTracerProvider as LangfuseModules["NodeTracerProvider"],
  };
}

function maskExportedData({ data }: { data: unknown }): unknown {
  if (typeof data !== "string") {
    return data;
  }
  let masked = data;
  for (const pattern of CREDENTIAL_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, "[REDACTED]");
  }
  return masked;
}

function safeEnd(observation: LangfuseObservation | null | undefined): void {
  try {
    observation?.end();
  } catch (error) {
    warnOnce(
      "observation-end",
      `Failed to end observation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function createChildHandle(
  parent: LangfuseObservation,
  name: string,
  kind: ObservationKind,
): NestedObservationHandle {
  let child: LangfuseObservation | null = null;
  try {
    const options =
      kind === "span"
        ? undefined
        : { asType: kind };
    child = parent.startObservation(name, {}, options);
  } catch (error) {
    warnOnce(
      "start-child",
      `Failed to start child observation ${name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let ended = false;
  return {
    update(metadata) {
      if (!child || ended) return;
      try {
        const safe = buildMetadataV1(metadata ?? {});
        child.update({ metadata: safe });
      } catch (error) {
        warnOnce(
          "child-update",
          `Failed to update observation ${name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    end(metadata) {
      if (!child || ended) return;
      ended = true;
      try {
        if (metadata) {
          const safe = buildMetadataV1(metadata);
          child.update({ metadata: safe });
        }
      } catch {
        // ignore update errors before end
      }
      safeEnd(child);
    },
  };
}

export async function createLangfuseRuntime(
  config: EvaluationRuntimeConfig,
): Promise<EvaluationRuntime> {
  const mods = await loadLangfuseModules();

  const processor = new mods.LangfuseSpanProcessor({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    environment: config.tracingEnvironment,
    release: config.release ?? undefined,
    exportMode: "immediate",
    mask: maskExportedData,
    shouldExportSpan: () => true,
  });

  const provider = new mods.NodeTracerProvider({
    spanProcessors: [processor],
  });
  mods.setLangfuseTracerProvider(provider);

  let demoted = false;
  let flushed = false;

  const demote = (message: string): void => {
    if (demoted) return;
    demoted = true;
    warnOnce("langfuse-demote", message);
  };

  return {
    enabled: true,

    async startPhaseTrace(
      input: StartPhaseTraceInput,
    ): Promise<PhaseTraceHandle | null> {
      if (demoted) return null;

      try {
        const sessionId = deriveSessionId(config.namespace, input.issueKey);
        const traceId = await mods.createTraceId(
          buildTraceSeed(config.namespace, input.runId),
        );
        const traceName =
          input.phase === "implementation"
            ? "p-dev.implementation"
            : "p-dev.handoff";

        const baseMetadata = buildMetadataV1({
          evaluationSchemaVersion: EVALUATION_SCHEMA_VERSION,
          captureProfile: EVALUATION_CAPTURE_PROFILE,
          issueKey: input.issueKey,
          pDevRunId: input.runId,
          phase: input.phase,
          harnessReleaseSha: config.release,
          ...(input.metadata ?? {}),
        });

        const root = mods.propagateAttributes(
          {
            sessionId,
            traceName,
            metadata: metadataToStringMap(baseMetadata),
          },
          () =>
            mods.startObservation(
              traceName,
              { metadata: baseMetadata },
              {
                parentSpanContext: {
                  traceId,
                  spanId: "0000000000000001",
                  traceFlags: 1,
                },
              },
            ),
        );

        let finished = false;

        const handle: PhaseTraceHandle = {
          correlation: {
            schemaVersion: EVALUATION_SCHEMA_VERSION,
            provider: "langfuse",
            captureProfile: EVALUATION_CAPTURE_PROFILE,
            sessionId,
            traceId,
          },
          startChild(name, kind = "span") {
            if (finished || demoted) {
              return { update() {}, end() {} };
            }
            return createChildHandle(root, name, kind);
          },
          finish(summary: PhaseFinishSummary, metadata) {
            if (finished) return;
            finished = true;
            try {
              const safeSummary = buildMetadataV1({
                ...baseMetadata,
                ...(metadata ?? {}),
                finalOutcome: summary.finalOutcome,
                errorClassification: summary.errorClassification,
                linearStatusAfter: summary.linearStatusAfter,
                prCreated: summary.prCreated,
                previewAvailable: summary.previewAvailable,
                changedFileCount: summary.changedFileCount,
              });
              root.update({
                output: {
                  finalOutcome: summary.finalOutcome,
                  errorClassification: summary.errorClassification,
                  linearStatusAfter: summary.linearStatusAfter,
                  prCreated: summary.prCreated,
                  previewAvailable: summary.previewAvailable,
                  changedFileCount: summary.changedFileCount,
                },
                metadata: safeSummary,
                level:
                  summary.finalOutcome === "failed" ? "ERROR" : "DEFAULT",
              });
            } catch (error) {
              demote(
                `Failed to finish phase trace: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            } finally {
              safeEnd(root);
            }
          },
        };

        return handle;
      } catch (error) {
        demote(
          `Failed to start phase trace; demoting evaluation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    },

    async flushAndShutdown(): Promise<void> {
      if (flushed) return;
      flushed = true;
      await withFlushTimeout(async () => {
        try {
          await processor.forceFlush();
        } catch (error) {
          warnOnce(
            "force-flush",
            `Langfuse forceFlush failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        try {
          await processor.shutdown();
        } catch (error) {
          warnOnce(
            "processor-shutdown",
            `Langfuse processor shutdown failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        try {
          await provider.shutdown?.();
        } catch {
          // ignore provider shutdown errors
        }
      });
    },
  };
}
