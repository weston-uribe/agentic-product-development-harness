import { randomBytes } from "node:crypto";
import {
  createLinearIssueWebhook,
  createLinearSetupClient,
  listLinearWebhooks,
  updateLinearIssueWebhook,
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
      manualSteps: [
        "Add LINEAR_API_KEY in Step 1 before automated Linear webhook setup can run.",
        "A webhook signing secret will be generated during apply and shown once if manual copy is required.",
      ],
    };
  }

  const readiness = await summarizeLinearWebhookReadiness({
    linearApiKey: input.linearApiKey,
    webhookUrl: input.webhookUrl,
    teamId: input.linearTeamId,
  });

  if (readiness.matchingWebhook) {
  const knownSecret = readiness.matchingWebhook.secret?.trim();
    if (knownSecret) {
      return {
        mode: "automated",
        matchingWebhook: readiness.matchingWebhook,
        manualSteps: [
          "A matching Linear Issue webhook already exists. Apply will rotate its signing secret to match the Vercel bridge secret.",
        ],
      };
    }

    return {
      mode: "existing-unverified",
      matchingWebhook: readiness.matchingWebhook,
      manualSteps: [
        "A matching Linear Issue webhook already exists, but its signing secret cannot be recovered.",
        "Apply will attempt to rotate the existing webhook secret automatically. If that fails, copy the generated secret into Linear manually.",
      ],
    };
  }

  return {
    mode: "automated",
    manualSteps: [
      "Apply will create a Linear Issue webhook and write the signing secret to Vercel.",
    ],
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
    const knownSecret = existing.secret?.trim();
    if (knownSecret === input.secret.trim()) {
      return {
        webhook: { ...existing, secret: undefined },
        secret: input.secret,
        mode: "automated",
        manualSteps: [],
      };
    }

    try {
      const updated = await updateLinearIssueWebhook(client, {
        webhookId: existing.id,
        url: input.webhookUrl,
        secret: input.secret,
      });
      return {
        webhook: { ...updated, secret: undefined },
        secret: input.secret,
        mode: "automated",
        manualSteps: [],
      };
    } catch {
      return {
        webhook: { ...existing, secret: undefined },
        secret: input.secret,
        mode: "existing-unverified",
        manualSteps: [
          "Matching Linear webhook exists, but its signing secret could not be rotated automatically.",
          "Copy the generated webhook secret into the Linear webhook signing secret field, then retry verification.",
        ],
      };
    }
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
        webhook: { ...created, secret: undefined },
        secret: created.secret,
        mode: "automated",
        manualSteps: [],
      };
    }

    return {
      webhook: { ...created, secret: undefined },
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
