import type { EvaluationScoreInput } from "../types.js";
import { warnOnce, withFlushTimeout } from "../warn.js";

type LangfuseScoreClient = {
  score: {
    create: (data: Record<string, unknown>) => void;
    flush: () => Promise<void>;
  };
};

function mapScoreValue(
  dataType: EvaluationScoreInput["dataType"],
  value: boolean | number | string,
): number | string {
  if (dataType === "BOOLEAN") {
    return value === true ? 1 : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

/**
 * Lightweight score-only Langfuse client — no OTEL / observation APIs.
 */
export async function createScoreOnlyClient(config: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}): Promise<{
  recordScore: (input: EvaluationScoreInput) => void;
  flush: () => Promise<void>;
} | null> {
  try {
    const mod = await import("@langfuse/client");
    const LangfuseClient = mod.LangfuseClient as unknown as new (params: {
      publicKey: string;
      secretKey: string;
      baseUrl?: string;
    }) => LangfuseScoreClient;
    const client = new LangfuseClient({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
    return {
      recordScore(input: EvaluationScoreInput): void {
        const scoreClass = input.scoreClass ?? "operational";
        const defaultComment =
          scoreClass === "cursor_usage_import"
            ? "cursor_usage_import scoreClass=cursor_usage_import"
            : "operational scoreClass=operational";
        const payload: Record<string, unknown> = {
          id: input.id,
          name: input.name,
          dataType: input.dataType,
          value: mapScoreValue(input.dataType, input.value),
          timestamp: input.timestamp,
          comment: input.comment ?? defaultComment,
        };
        if (input.target === "trace" && input.traceId) {
          payload.traceId = input.traceId;
        }
        if (input.target === "session" && input.sessionId) {
          payload.sessionId = input.sessionId;
        }
        client.score.create(payload);
      },
      async flush(): Promise<void> {
        await withFlushTimeout(async () => {
          await client.score.flush();
        });
      },
    };
  } catch (error) {
    warnOnce(
      "cursor-usage-score-client",
      `Failed to create score-only Langfuse client: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
