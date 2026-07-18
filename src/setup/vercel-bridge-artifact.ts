export interface VercelBridgeArtifactFile {
  file: string;
  data: string;
  encoding: "utf-8";
}

const linearWebhookHandler = String.raw`
const { createHmac, timingSafeEqual } = require("node:crypto");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()] || req.headers[name];
  return Array.isArray(value) ? value[0] || null : value || null;
}

function computeSignature(secret, rawBody) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function signatureMatches(secret, rawBody, signatureHeader) {
  if (!signatureHeader || !/^[0-9a-f]+$/i.test(signatureHeader)) {
    return false;
  }
  const computed = Buffer.from(computeSignature(secret, rawBody), "hex");
  const provided = Buffer.from(signatureHeader, "hex");
  return computed.length === provided.length && timingSafeEqual(computed, provided);
}

function parseTimestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timestampOk(payloadTimestamp, headerTimestamp) {
  const toleranceMs = Number(process.env.LINEAR_WEBHOOK_TIMESTAMP_TOLERANCE_MS || 60000);
  const now = Date.now();
  return [payloadTimestamp, headerTimestamp]
    .filter((value) => value !== null)
    .some((value) => Math.abs(now - value) <= toleranceMs);
}

async function dispatchToGitHub(payload) {
  const repository = process.env.GITHUB_DISPATCH_REPOSITORY;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repository || !token) {
    throw new Error("missing_dispatch_configuration");
  }
  const eventType = process.env.GITHUB_DISPATCH_EVENT_TYPE || "linear_issue_event";
  const response = await fetch("https://api.github.com/repos/" + repository + "/dispatches", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });
  if (!response.ok) {
    throw new Error("github_dispatch_" + response.status);
  }
}

module.exports = async function handler(req, res) {
  if ((req.method || "GET") !== "POST") {
    return json(res, 405, { error: "method_not_allowed" });
  }

  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) {
    return json(res, 500, { error: "dispatch_failed" });
  }

  const rawBody = await readRawBody(req);
  if (!signatureMatches(secret, rawBody, getHeader(req, "linear-signature"))) {
    return json(res, 401, { error: "invalid_signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(res, 401, { error: "invalid_signature" });
  }

  if (
    !timestampOk(
      parseTimestampMs(payload && payload.webhookTimestamp),
      parseTimestampMs(getHeader(req, "linear-timestamp")),
    )
  ) {
    return json(res, 401, { error: "timestamp_out_of_tolerance" });
  }

  function issueKeyAllowed(issueKey) {
    const teamKeyRaw = process.env.HARNESS_TEAM_KEY || "";
    const teamKeys = teamKeyRaw
      .split(/[,\\s]+/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    if (teamKeys.length === 0) {
      return true;
    }
    const normalizedIssueKey = String(issueKey).toUpperCase();
    return teamKeys.some((key) => normalizedIssueKey.startsWith(key + "-"));
  }

  function issueKeyFromUrl(url) {
    if (!url || typeof url !== "string") {
      return null;
    }
    const match = url.match(/\\/([A-Z]+-\\d+)(?:\\/|$|#)/);
    return match ? match[1] : null;
  }

  let issueKey = null;
  let issueId = null;
  let issueUrl = null;
  let action = payload.action || "";
  let statusName = null;
  let triggerKind = "issue_status";
  let commentId = null;

  if (payload.type === "Comment") {
    const data = payload.data || {};
    const issue = data.issue || {};
    issueKey = issue.identifier || issueKeyFromUrl(payload.url) || issueKeyFromUrl(issue.url);
    issueId = issue.id || data.issueId || null;
    issueUrl = issue.url || payload.url || null;
    action = payload.action || "";
    triggerKind = "comment_create";
    commentId = data.id || null;
    if (action !== "create" || !issueKey) {
      return json(res, 200, { accepted: false, reason: "ignored_event" });
    }
  } else if (payload.type === "Issue" && payload.data && payload.data.identifier) {
    issueKey = payload.data.identifier;
    issueId = payload.data.id || null;
    issueUrl = payload.data.url || null;
    statusName = payload.data.state && payload.data.state.name;
  } else {
    return json(res, 200, { accepted: false, reason: "ignored_event" });
  }

  if (!issueKeyAllowed(issueKey)) {
    return json(res, 200, { accepted: false, reason: "team_key_mismatch" });
  }

  try {
    await dispatchToGitHub({
      issueKey: issueKey,
      issueId: issueId,
      issueUrl: issueUrl,
      action: action,
      statusName: statusName,
      linearDeliveryId: getHeader(req, "linear-delivery"),
      linearWebhookId: getHeader(req, "linear-webhook-id"),
      receivedAt: new Date().toISOString(),
      triggerKind: triggerKind,
      commentId: commentId,
    });
  } catch {
    return json(res, 500, { error: "dispatch_failed" });
  }

  return json(res, 200, { accepted: true, dispatched: true, issueKey: issueKey });
};
`.trimStart();

export function buildVercelBridgeArtifactFiles(): VercelBridgeArtifactFile[] {
  return [
    {
      file: "api/linear-webhook.js",
      data: linearWebhookHandler,
      encoding: "utf-8",
    },
    {
      file: "package.json",
      data: JSON.stringify({ type: "commonjs" }, null, 2),
      encoding: "utf-8",
    },
    {
      file: "vercel.json",
      data: JSON.stringify(
        {
          functions: {
            "api/linear-webhook.js": {
              maxDuration: 10,
            },
          },
        },
        null,
        2,
      ),
      encoding: "utf-8",
    },
  ];
}
