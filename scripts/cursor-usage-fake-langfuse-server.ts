import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { deriveSessionId } from "../src/evaluation/identifiers.js";

const PORT = Number.parseInt(process.env.CURSOR_USAGE_FAKE_LANGFUSE_PORT ?? "18999", 10);
const ISSUE_KEY = "TT-FIXTURE";
const NAMESPACE = "default";
const SESSION_ID = deriveSessionId(NAMESPACE, ISSUE_KEY);

const TRACE_PLANNING = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRACE_PLAN_REVIEW = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const AGENT_PLANNING = "bc-agent-planning-001";
const AGENT_PLAN_REVIEW = "bc-agent-planreview-001";

type StoredScore = Record<string, unknown>;

const scores: StoredScore[] = [];

const traces = [
  {
    id: TRACE_PLANNING,
    name: "planning",
    sessionId: SESSION_ID,
    timestamp: "2026-07-19T11:59:00.000Z",
    linearIssueKey: ISSUE_KEY,
    phase: "planning",
    phaseExecutionId: "pe-plan",
    harnessRunId: "hr-plan",
    scores: [],
  },
  {
    id: TRACE_PLAN_REVIEW,
    name: "plan_review",
    sessionId: SESSION_ID,
    timestamp: "2026-07-19T12:59:00.000Z",
    linearIssueKey: ISSUE_KEY,
    phase: "plan_review",
    phaseExecutionId: "pe-pr",
    harnessRunId: "hr-pr",
    scores: [],
  },
];

const observations = [
  {
    id: "obs-plan",
    traceId: TRACE_PLANNING,
    name: "planner",
    type: "AGENT",
    startTime: "2026-07-19T11:59:00.000Z",
    endTime: "2026-07-19T12:05:00.000Z",
    model: "composer-2.5",
    agentId: AGENT_PLANNING,
    phase: "planning",
    phaseExecutionId: "pe-plan",
    harnessRunId: "hr-plan",
    metadata: {
      cursorAgentId: AGENT_PLANNING,
      effectiveVariant: "standard",
      fast: false,
    },
  },
  {
    id: "obs-pr",
    traceId: TRACE_PLAN_REVIEW,
    name: "plan_reviewer",
    type: "AGENT",
    startTime: "2026-07-19T12:59:00.000Z",
    endTime: "2026-07-19T13:05:00.000Z",
    model: "composer-2.5",
    agentId: AGENT_PLAN_REVIEW,
    phase: "plan_review",
    phaseExecutionId: "pe-pr",
    harnessRunId: "hr-pr",
    metadata: {
      cursorAgentId: AGENT_PLAN_REVIEW,
      effectiveVariant: "standard",
      fast: false,
    },
  },
];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function filterTraces(url: URL): typeof traces {
  const from = parseTimestamp(url.searchParams.get("fromTimestamp"));
  const to = parseTimestamp(url.searchParams.get("toTimestamp"));
  return traces.filter((trace) => {
    const ts = parseTimestamp(trace.timestamp);
    if (ts == null) return true;
    if (from != null && ts < from) return false;
    if (to != null && ts > to) return false;
    return true;
  });
}

function handleTraces(url: URL, res: ServerResponse): void {
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const data = filterTraces(url);
  sendJson(res, 200, {
    data,
    meta: { page, limit, totalPages: 1, totalItems: data.length },
  });
}

function handleObservations(url: URL, res: ServerResponse): void {
  const traceId = url.searchParams.get("traceId");
  const data = traceId
    ? observations.filter((obs) => obs.traceId === traceId)
    : observations;
  sendJson(res, 200, {
    data,
    meta: { page: 1, limit: data.length, totalPages: 1 },
  });
}

function handleScores(url: URL, res: ServerResponse): void {
  const traceId = url.searchParams.get("traceId");
  const data = traceId
    ? scores.filter((score) => score.traceId === traceId)
    : scores;
  sendJson(res, 200, {
    data,
    meta: { page: 1, limit: data.length, totalPages: 1 },
  });
}

async function handleIngestion(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let payload: { batch?: Array<Record<string, unknown>> } = {};
  try {
    payload = JSON.parse(raw) as { batch?: Array<Record<string, unknown>> };
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  for (const event of payload.batch ?? []) {
    if (event.type !== "score-create") continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : crypto.randomUUID();
    scores.push({
      id,
      name: body.name,
      traceId: body.traceId,
      value: body.value,
      dataType: body.dataType,
      timestamp: event.timestamp ?? body.timestamp,
      comment: body.comment,
      metadata: body.metadata,
    });
  }

  sendJson(res, 200, { successes: (payload.batch ?? []).map((event) => event.id) });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/public/traces") {
    handleTraces(url, res);
    return;
  }
  if (url.pathname === "/api/public/v2/observations") {
    handleObservations(url, res);
    return;
  }
  if (url.pathname === "/api/public/v3/scores") {
    handleScores(url, res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/public/ingestion") {
    await handleIngestion(req, res);
    return;
  }
  sendJson(res, 404, { error: "not_found", path: url.pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`cursor-usage fake langfuse listening on ${PORT}\n`);
});
