import { cursorAgentProvider, peekCursorAgentId } from "./cursor-provider.js";
import type {
  AcquiredBuilderAgent,
  AcquireBuilderAgentParams,
  AgentHandle,
  BranchAgentParams,
  ObservedAgentRun,
  PlanningAgentParams,
  SendAndObserveOptions,
} from "./types.js";
import type { EventLogger } from "../artifacts/events.js";
import {
  CursorProvenanceError,
  computeLaunchAttemptId,
  createLinearHarnessLaunchContext,
  hashProviderIdentity,
  type LinearHarnessLaunchContext,
  type LinearHarnessLaunchContextInput,
  type ProductionLaunchSurface,
  ProvenanceWriter,
  type ProvenanceWriterOptions,
  type WriteOutcome,
} from "../provenance/index.js";
import type { BuilderProvenanceMutationHooks } from "../runner/builder-thread-acquire.js";

const handleBindings = new WeakMap<
  AgentHandle,
  { launchAttemptId: string; context: LinearHarnessLaunchContext }
>();

function assertWriteOk(outcome: WriteOutcome, stage: string): void {
  if (outcome.blocked && outcome.error) {
    throw outcome.error;
  }
  if (outcome.blocked) {
    throw new CursorProvenanceError(
      "cursor_provenance_state_unavailable",
      `Provenance blocked at ${stage}.`,
    );
  }
}

export interface LinearHarnessCreateParams extends PlanningAgentParams {
  launchContext: LinearHarnessLaunchContext;
}

export interface LinearHarnessBranchParams extends BranchAgentParams {
  launchContext: LinearHarnessLaunchContext;
}

export interface LinearHarnessResumePlanReviewParams {
  apiKey: string;
  agentId: string;
  launchContext: LinearHarnessLaunchContext;
}

export interface LinearHarnessAcquireBuilderParams extends AcquireBuilderAgentParams {
  /**
   * Builds a validated launch context for the concrete mutation action.
   * Called after lineage resolution chooses create/resume/replacement.
   */
  buildLaunchContext: (info: {
    action: "create" | "resume" | "replacement";
    generation: number;
    priorAgentId?: string;
    launchSurface: ProductionLaunchSurface;
  }) => LinearHarnessLaunchContext;
}

export interface LinearHarnessSendParams {
  agent: AgentHandle;
  prompt: string;
  runDirectory: string;
  events: EventLogger;
  launchContext: LinearHarnessLaunchContext;
  options?: SendAndObserveOptions;
}

export interface LinearHarnessAgentProviderOptions {
  writerOptions?: ProvenanceWriterOptions;
  /** Inject writer for tests. */
  writer?: ProvenanceWriter;
  inner?: typeof cursorAgentProvider;
}

export class LinearHarnessAgentProvider {
  readonly id = "linear-harness-cursor" as const;
  private readonly inner: typeof cursorAgentProvider;
  private readonly writer: ProvenanceWriter;

  constructor(options: LinearHarnessAgentProviderOptions = {}) {
    this.inner = options.inner ?? cursorAgentProvider;
    this.writer =
      options.writer ?? new ProvenanceWriter(options.writerOptions ?? {});
  }

  get provenanceWriter(): ProvenanceWriter {
    return this.writer;
  }

  private async beforeProviderMutation(
    ctx: LinearHarnessLaunchContext,
  ): Promise<void> {
    const intent = await this.writer.writeLaunchIntent(ctx);
    assertWriteOk(intent, "launch_intent");
    const callStart = await this.writer.writeProviderCallStarted(ctx);
    assertWriteOk(callStart, "provider_call_started");
  }

  private bindExistingHandle(
    handle: AgentHandle,
    ctx: LinearHarnessLaunchContext,
  ): AgentHandle {
    const attemptId = computeLaunchAttemptId(ctx);
    handleBindings.set(handle, { launchAttemptId: attemptId, context: ctx });
    return handle;
  }

  private requireBoundContext(
    agent: AgentHandle,
    launchContext: LinearHarnessLaunchContext,
  ): void {
    const bound = handleBindings.get(agent);
    const expected = computeLaunchAttemptId(launchContext);
    if (!bound || bound.launchAttemptId !== expected) {
      throw new CursorProvenanceError(
        "cursor_provenance_handle_attempt_mismatch",
        "AgentHandle is not bound to the provided launch attempt.",
      );
    }
  }

  private createBuilderHooks(
    buildLaunchContext: LinearHarnessAcquireBuilderParams["buildLaunchContext"],
    phase: AcquireBuilderAgentParams["phase"],
  ): BuilderProvenanceMutationHooks {
    let activeContext: LinearHarnessLaunchContext | null = null;
    const surfaceFor = (
      action: "create" | "resume" | "replacement",
    ): ProductionLaunchSurface => {
      if (phase === "implementation") {
        if (action === "create") return "implementation.initial_create";
        if (action === "resume") return "implementation.resume";
        return "implementation.replacement";
      }
      if (phase === "revision") {
        return action === "resume" ? "revision.resume" : "revision.replacement";
      }
      return action === "resume"
        ? "integration_repair.resume"
        : "integration_repair.replacement";
    };

    return {
      beforeMutation: async (info) => {
        activeContext = buildLaunchContext({
          ...info,
          launchSurface: surfaceFor(info.action),
        });
        await this.beforeProviderMutation(activeContext);
      },
      afterAgent: async (info) => {
        if (!activeContext) {
          throw new CursorProvenanceError(
            "cursor_provenance_invalid_context",
            "Missing launch context after builder mutation.",
          );
        }
        // Refresh context digests for generation/prior if factory rebuilt them
        activeContext = buildLaunchContext({
          ...info,
          launchSurface: surfaceFor(info.action),
        });
        const ack = await this.writer.writeAgentAcknowledged(
          activeContext,
          info.agentId,
        );
        assertWriteOk(ack, "provider_agent_acknowledged");
      },
      onMutationFailed: async (info) => {
        if (!activeContext) return;
        await this.writer.writeLaunchFailed(activeContext, {
          failureStage: `builder_${info.action}`,
          failureCategory: "provider_mutation_failed",
        });
      },
    };
  }

  async createPlanningAgent(
    params: LinearHarnessCreateParams,
  ): Promise<AgentHandle> {
    const ctx = params.launchContext;
    await this.beforeProviderMutation(ctx);
    try {
      const handle = await this.inner.createPlanningAgent(params);
      const agentId = peekCursorAgentId(handle);
      const ack = await this.writer.writeAgentAcknowledged(ctx, agentId);
      assertWriteOk(ack, "provider_agent_acknowledged");
      return this.bindExistingHandle(handle, ctx);
    } catch (error) {
      if (!(error instanceof CursorProvenanceError)) {
        await this.writer.writeLaunchFailed(ctx, {
          failureStage: "provider_create",
          failureCategory: "planning_create_failed",
        });
      }
      throw error;
    }
  }

  async createPlanReviewAgent(
    params: LinearHarnessCreateParams,
  ): Promise<AgentHandle> {
    const ctx = params.launchContext;
    await this.beforeProviderMutation(ctx);
    try {
      const handle = await this.inner.createPlanReviewAgent(params);
      const agentId = peekCursorAgentId(handle);
      const ack = await this.writer.writeAgentAcknowledged(ctx, agentId);
      assertWriteOk(ack, "provider_agent_acknowledged");
      return this.bindExistingHandle(handle, ctx);
    } catch (error) {
      if (!(error instanceof CursorProvenanceError)) {
        await this.writer.writeLaunchFailed(ctx, {
          failureStage: "provider_create",
          failureCategory: "plan_review_create_failed",
        });
      }
      throw error;
    }
  }

  async resumePlanReviewAgent(
    params: LinearHarnessResumePlanReviewParams,
  ): Promise<AgentHandle> {
    const ctx = params.launchContext;
    await this.beforeProviderMutation(ctx);
    try {
      if (!this.inner.resumePlanReviewAgent) {
        throw new Error("Plan review resume unsupported");
      }
      const handle = await this.inner.resumePlanReviewAgent({
        apiKey: params.apiKey,
        agentId: params.agentId,
      });
      const agentId = peekCursorAgentId(handle);
      const ack = await this.writer.writeAgentAcknowledged(ctx, agentId);
      assertWriteOk(ack, "provider_agent_acknowledged");
      return this.bindExistingHandle(handle, ctx);
    } catch (error) {
      if (!(error instanceof CursorProvenanceError)) {
        await this.writer.writeLaunchFailed(ctx, {
          failureStage: "provider_resume",
          failureCategory: "plan_review_resume_failed",
        });
      }
      throw error;
    }
  }

  async createCodeReviewAgent(
    params: LinearHarnessBranchParams,
  ): Promise<AgentHandle> {
    const ctx = params.launchContext;
    await this.beforeProviderMutation(ctx);
    try {
      const handle = await this.inner.createCodeReviewAgent(params);
      const agentId = peekCursorAgentId(handle);
      const ack = await this.writer.writeAgentAcknowledged(ctx, agentId);
      assertWriteOk(ack, "provider_agent_acknowledged");
      return this.bindExistingHandle(handle, ctx);
    } catch (error) {
      if (!(error instanceof CursorProvenanceError)) {
        await this.writer.writeLaunchFailed(ctx, {
          failureStage: "provider_create",
          failureCategory: "code_review_create_failed",
        });
      }
      throw error;
    }
  }

  async createCodeRevisionAgent(
    params: LinearHarnessBranchParams,
  ): Promise<AgentHandle> {
    const ctx = params.launchContext;
    await this.beforeProviderMutation(ctx);
    try {
      const handle = await this.inner.createCodeRevisionAgent(params);
      const agentId = peekCursorAgentId(handle);
      const ack = await this.writer.writeAgentAcknowledged(ctx, agentId);
      assertWriteOk(ack, "provider_agent_acknowledged");
      return this.bindExistingHandle(handle, ctx);
    } catch (error) {
      if (!(error instanceof CursorProvenanceError)) {
        await this.writer.writeLaunchFailed(ctx, {
          failureStage: "provider_create",
          failureCategory: "code_revision_create_failed",
        });
      }
      throw error;
    }
  }

  async acquireBuilderAgent(
    params: LinearHarnessAcquireBuilderParams,
  ): Promise<AcquiredBuilderAgent> {
    const hooks = this.createBuilderHooks(
      params.buildLaunchContext,
      params.phase,
    );
    const { buildLaunchContext: _build, ...acquireParams } = params;
    const acquired = await this.inner.acquireBuilderAgent({
      ...acquireParams,
      provenanceHooks: hooks,
    });

    // Re-bind using context for the resolved action
    const action =
      acquired.continuity.action === "created"
        ? "create"
        : acquired.continuity.action === "resumed"
          ? "resume"
          : "replacement";
    const generation = acquired.continuity.reference.generation;
    const surface =
      params.phase === "implementation"
        ? action === "create"
          ? "implementation.initial_create"
          : action === "resume"
            ? "implementation.resume"
            : "implementation.replacement"
        : params.phase === "revision"
          ? action === "resume"
            ? "revision.resume"
            : "revision.replacement"
          : action === "resume"
            ? "integration_repair.resume"
            : "integration_repair.replacement";
    const ctx = params.buildLaunchContext({
      action,
      generation,
      priorAgentId: acquired.continuity.previousAgentId,
      launchSurface: surface,
    });
    this.bindExistingHandle(acquired.agent, ctx);
    return acquired;
  }

  async sendAndObserve(params: LinearHarnessSendParams): Promise<ObservedAgentRun> {
    const { agent, prompt, runDirectory, events, launchContext, options } =
      params;
    this.requireBoundContext(agent, launchContext);

    let runStartIso: string | null = null;
    let startEvidence: "provider_run_timestamp" | "local_run_acknowledged_timestamp" =
      "local_run_acknowledged_timestamp";

    const onRunAcknowledged: NonNullable<SendAndObserveOptions["onRunAcknowledged"]> =
      async (details) => {
        runStartIso =
          details.providerRunCreatedAt ?? details.acknowledgedAt;
        startEvidence = details.providerRunCreatedAt
          ? "provider_run_timestamp"
          : "local_run_acknowledged_timestamp";
        const bind = await this.writer.writeRunBound(launchContext, {
          agentId: details.agentId,
          runId: details.runId,
          runStartIso,
          startEvidenceSource: startEvidence,
        });
        assertWriteOk(bind, "provider_run_bound");
        if (options?.onRunAcknowledged) {
          await options.onRunAcknowledged(details);
        }
      };

    const onRunTerminal: NonNullable<SendAndObserveOptions["onRunTerminal"]> =
      async (details) => {
        const windowStart = runStartIso ?? details.terminalAt;
        const endEvidence = details.providerTerminalAt
          ? ("provider_terminal_timestamp" as const)
          : ("local_terminal_observation_timestamp" as const);
        const completed = await this.writer.writeExecutionCompleted(
          launchContext,
          {
            agentId: details.agentId,
            runId: details.runId,
            terminalStatus: details.terminalStatus,
            windowStartIso: windowStart,
            windowEndIso: details.providerTerminalAt ?? details.terminalAt,
            startEvidenceSource: startEvidence,
            endEvidenceSource: endEvidence,
            completionEvidenceSource: endEvidence,
          },
        );
        assertWriteOk(completed, "execution_completed");
        if (options?.onRunTerminal) {
          await options.onRunTerminal(details);
        }
      };

    try {
      return await this.inner.sendAndObserve(agent, prompt, runDirectory, events, {
        ...options,
        onRunAcknowledged,
        onRunTerminal,
        // Compose — do not overwrite caller callbacks for before/created
        onBeforeSend: options?.onBeforeSend,
        onAgentCreated: options?.onAgentCreated,
      });
    } catch (error) {
      if (
        error instanceof CursorProvenanceError ||
        runStartIso === null
      ) {
        if (runStartIso === null && !(error instanceof CursorProvenanceError)) {
          await this.writer.writeLaunchFailed(launchContext, {
            failureStage: "provider_send",
            failureCategory: "send_failed_before_run_id",
          });
        }
      }
      // Cancel/timeout without authoritative terminal: leave run binding unresolved.
      throw error;
    }
  }

  async disposeAgent(agent: AgentHandle): Promise<void> {
    handleBindings.delete(agent);
    await this.inner.disposeAgent(agent);
  }
}

export function buildLinearHarnessLaunchContext(
  input: LinearHarnessLaunchContextInput,
): LinearHarnessLaunchContext {
  return createLinearHarnessLaunchContext(input);
}

export function priorAgentHashFromId(agentId: string | null | undefined): string | null {
  if (!agentId) return null;
  return hashProviderIdentity(agentId);
}

/** Singleton used by production phase modules. */
let defaultProductionProvider: LinearHarnessAgentProvider | null = null;

export function getLinearHarnessAgentProvider(
  options?: LinearHarnessAgentProviderOptions,
): LinearHarnessAgentProvider {
  if (options) {
    return new LinearHarnessAgentProvider(options);
  }
  if (!defaultProductionProvider) {
    defaultProductionProvider = new LinearHarnessAgentProvider();
  }
  return defaultProductionProvider;
}

/** Test-only reset. */
export function resetLinearHarnessAgentProviderForTests(): void {
  defaultProductionProvider = null;
}
