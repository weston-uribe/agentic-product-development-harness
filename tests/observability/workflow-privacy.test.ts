import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  ALLOWED_WORKFLOW_ANALYTICS_PROPERTY_KEYS,
  assertAllowedPropertyKeys,
  COMMON_ANALYTICS_PROPERTY_KEYS,
} from "../../src/observability/privacy-schema.js";
import {
  buildWorkflowAnalyticsProperties,
  buildWorkflowSentryContext,
  bypassEventToAnalytics,
} from "../../src/observability/workflow-analytics.js";
import { METADATA_V1_ALLOWED_KEYS } from "../../src/evaluation/capture-policy.js";

describe("workflow observability privacy", () => {
  it("allowlists workflow analytics events", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        "p_dev_workflow_transition",
        "p_dev_phase_bypassed",
        "p_dev_review_cycle_incremented",
        "p_dev_cycle_limit_reached",
        "p_dev_reconciliation_recovery",
      ]),
    );
  });

  it("accepts bounded workflow properties only", () => {
    const props = buildWorkflowAnalyticsProperties({
      workflow_schema_version: "product-development-v2",
      workflow_phase_id: "planning",
      status_before: "Planning",
      status_after: "Ready for Build",
      transition_reason: "optional_phase_disabled",
      optional_phase_enabled: false,
      bypass_reason: "optionalPhases.planReview=false",
    });
    assertAllowedPropertyKeys(props, [
      ...COMMON_ANALYTICS_PROPERTY_KEYS,
      ...ALLOWED_WORKFLOW_ANALYTICS_PROPERTY_KEYS,
    ]);
    expect(props).not.toHaveProperty("issue_description");
    expect(props).not.toHaveProperty("prompt_body");
  });

  it("bypass analytics never requests traces or scores", () => {
    const { event, properties } = bypassEventToAnalytics({
      event: "phase_bypassed",
      phaseId: "plan_review",
      statusId: "plan-review",
      bypassDestinationPhaseId: "implementation_dispatch",
      configurationReason: "optionalPhases.planReview=false",
      workflowSchemaVersion: "product-development-v2",
      scored: false,
      createTrace: false,
      createAgentRun: false,
    });
    expect(event).toBe("p_dev_phase_bypassed");
    expect(properties.optional_phase_enabled).toBe(false);
  });

  it("Langfuse metadata allowlist includes workflow correlation keys", () => {
    for (const key of [
      "workflowSchemaVersion",
      "workflowPhaseId",
      "transitionReason",
      "bypassReason",
      "cycleCount",
      "decisionType",
      "reconciliationSource",
    ]) {
      expect(METADATA_V1_ALLOWED_KEYS).toContain(key);
    }
  });

  it("Sentry context stays bounded", () => {
    const ctx = buildWorkflowSentryContext({
      workflowSchemaVersion: "product-development-v2",
      currentPhaseId: "planning",
      currentStatus: "Planning",
      attemptedTransition: "success",
      cycleCount: 0,
      reconciliationSource: "resolve_route",
    });
    expect(Object.keys(ctx).every((k) => !/prompt|description|body/i.test(k))).toBe(
      true,
    );
  });
});
