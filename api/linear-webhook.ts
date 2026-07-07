import { handleLinearWebhook } from "../src/webhook/handle-linear-webhook.js";

export default async function handler(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const result = await handleLinearWebhook({
    method: request.method,
    rawBody,
    headerGetter: (name) => request.headers.get(name),
  });

  return Response.json(result.body, { status: result.status });
}
