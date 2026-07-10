import { randomBytes } from "node:crypto";
import {
  createLinearIssueWebhook,
  createLinearSetupClient,
  listLinearWebhooks,
  type LinearWebhookSummary,
} from "./linear-setup-client.js";
import { summarizeLinearWebhookReadiness } from "./linear-setup-plan.js";

export type LinearWebhookSecretMode =
  | "automated"
  | "existing-unverified"
  | "manual-copy";

export interface LinearWebhookSecretPlan {
  mode: LinearWebhookSecretMode;
  secret?: string;
  matchingWebhook?: LinearWebhookSummary;
  manualSteps: string[];
}

export function generateLinearWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function planLinearWebhookSecret(input: {
  linearApiKey?: string;
  webhookUrl: string;
  linearTeamId?: string;
}): Promise<LinearWebhookSecretPlan> {
  if (!input.linearApiKey?.trim()) {
    return {
      mode: "manual-copy",
      secret: generateLinearWebhookSecret(),
      manualSteps: [
        "Add LINEAR_API_KEY in Step 1 before automated Linear webhook setup can run.",
        "Copy the generated webhook secret into Linear and Vercel when prompted.",
      ],
    };
  }

  const readiness = await summarizeLinearWebhookReadiness({
    linearApiKey: input.linearApiKey,
    webhookUrl: input.webhookUrl,
    teamId: input.linearTeamId,
  });

  if (readiness.matchingWebhook) {
    return {
      mode: "existing-unverified",
      matchingWebhook: readiness.matchingWebhook,
      manualSteps: [
        "A matching Linear Issue webhook already exists, but its signing secret cannot be recovered.",
        "Rotate or recreate the Linear webhook secret to match the generated value, or confirm manual completion after updating Linear.",
      ],
    };
  }

  return {
    mode: "automated",
    secret: generateLinearWebhookSecret(),
    manualSteps: [],
  };
}

export async function ensureLinearIssueWebhook(input: {
  linearApiKey: string;
  webhookUrl: string;
  linearTeamId?: string;
  secret: string;
}): Promise<{
  webhook?: LinearWebhookSummary;
  secret: string;
  mode: LinearWebhookSecretMode;
  manualSteps: string[];
}> {
  const client = createLinearSetupClient(input.linearApiKey);
  const webhooks = await listLinearWebhooks(client);
  const normalizedTarget = input.webhookUrl.trim().replace(/\/$/, "");
  const existing = webhooks.find((webhook) => {
    const normalized = webhook.url.trim().replace(/\/$/, "");
    const teamMatches = input.linearTeamId
      ? webhook.teamId === input.linearTeamId
      : true;
    return (
      teamMatches &&
      normalized === normalizedTarget &&
      webhook.enabled &&
      webhook.resourceTypes.includes("Issue")
    );
  });

  if (existing) {
    return {
      webhook: existing,
      secret: input.secret,
      mode: "existing-unverified",
      manualSteps: [
        "Matching Linear webhook exists, but its signing secret cannot be read back.",
        "Update the Linear webhook signing secret to match the generated value shown once in Step 3.",
      ],
    };
  }

  try {
    const created = await createLinearIssueWebhook(client, {
      url: input.webhookUrl,
      teamId: input.linearTeamId,
      label: "Harness webhook bridge",
      secret: input.secret,
    });

    if (created.secret) {
      return {
        webhook: created,
        secret: created.secret,
        mode: "automated",
        manualSteps: [],
      };
    }

    return {
      webhook: created,
      secret: input.secret,
      mode: "manual-copy",
      manualSteps: [
        "Linear webhook was created, but the signing secret was not returned by the API.",
        "Copy the generated secret into the Linear webhook signing secret field.",
      ],
    };
  } catch {
    return {
      secret: input.secret,
      mode: "manual-copy",
      manualSteps: [
        `Create a Linear Issue webhook pointing at ${input.webhookUrl}.`,
        "Copy the generated webhook secret into Linear and confirm when complete.",
      ],
    };
  }
}
