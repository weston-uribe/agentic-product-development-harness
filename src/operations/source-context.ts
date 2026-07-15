import {
  isOperationsFixtureId,
  P_DEV_OPERATIONS_FIXTURES_ENV,
} from "./constants.js";
import type { OperationsSourceContext, OperationsSourceMode } from "./types.js";

export interface SourceContextRequest {
  source?: string | null;
  fixture?: string | null;
  fixturesEnabled?: boolean;
}

export function isFixturesOptInEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[P_DEV_OPERATIONS_FIXTURES_ENV] === "1";
}

export function resolveOperationsSourceContext(
  request: SourceContextRequest,
  env: NodeJS.ProcessEnv = process.env,
): OperationsSourceContext {
  const fixturesEnabled = request.fixturesEnabled ?? isFixturesOptInEnabled(env);
  const source = request.source?.trim().toLowerCase();
  const fixture = request.fixture?.trim();

  if (source === "fixture" || fixture) {
    if (!fixturesEnabled) {
      return {
        mode: "fixture",
        fixtureId: fixture,
        fixturesEnabled: false,
        rejectionReason:
          "Fixture mode requires explicit server opt-in via P_DEV_OPERATIONS_FIXTURES=1.",
      };
    }

    if (!fixture || !isOperationsFixtureId(fixture)) {
      return {
        mode: "fixture",
        fixtureId: fixture,
        fixturesEnabled: true,
        rejectionReason: fixture
          ? `Unknown fixture id: ${fixture}`
          : "Fixture id is required when source=fixture.",
      };
    }

    return {
      mode: "fixture",
      fixtureId: fixture,
      fixturesEnabled: true,
    };
  }

  return {
    mode: "live",
    fixturesEnabled,
  };
}

export function dataSourceLabel(context: OperationsSourceContext): string {
  if (context.rejectionReason) {
    return "Fixture request rejected";
  }
  if (context.mode === "fixture" && context.fixtureId) {
    return `Fixture: ${context.fixtureId}`;
  }
  return "Live workspace data";
}

export function assertWritableSourceContext(
  context: OperationsSourceContext,
): OperationsSourceContext {
  if (context.rejectionReason) {
    throw new Error(context.rejectionReason);
  }
  return context;
}

export function sourceModeFromContext(
  context: OperationsSourceContext,
): OperationsSourceMode {
  return context.mode;
}
