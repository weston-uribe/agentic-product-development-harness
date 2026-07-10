export const CANONICAL_CONFIGURE_URL =
  "http://localhost:3000/settings/configure";

export interface ConfigureHealthResult {
  ok: boolean;
  reason?: string;
}

export function analyzeConfigurePageHtml(html: string): ConfigureHealthResult {
  if (!html.includes("/_next/static/")) {
    return {
      ok: false,
      reason:
        "Page HTML is missing Next.js static asset references. The dev server may be serving a broken build or corrupt .next cache.",
    };
  }

  const cssHref = extractNextCssHref(html);
  if (!cssHref) {
    return {
      ok: false,
      reason:
        "Page HTML is missing a Next.js CSS bundle link. The UI will likely render unstyled.",
    };
  }

  return { ok: true };
}

export function validateConfigureCssAsset(input: {
  contentType: string | null;
  body: string;
  href: string;
}): ConfigureHealthResult {
  const contentType = input.contentType ?? "";
  if (!contentType.includes("text/css")) {
    return {
      ok: false,
      reason: `CSS asset ${input.href} returned unexpected content-type: ${contentType || "(missing)"}`,
    };
  }

  if (input.body.trim().length < 100) {
    return {
      ok: false,
      reason: `CSS asset ${input.href} is suspiciously small (${input.body.length} bytes).`,
    };
  }

  return { ok: true };
}

export function extractNextCssHref(html: string): string | undefined {
  const patterns = [
    /href="(\/_next\/static\/css\/[^"]+\.css[^"]*)"/,
    /href='(\/_next\/static\/css\/[^']+\.css[^']*)'/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export async function checkConfigurePageHealth(
  configureUrl = CANONICAL_CONFIGURE_URL,
): Promise<ConfigureHealthResult> {
  let response: Response;
  try {
    response = await fetch(configureUrl, { redirect: "follow" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Could not reach ${configureUrl}: ${message}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `${configureUrl} returned HTTP ${response.status}`,
    };
  }

  const html = await response.text();
  const htmlAnalysis = analyzeConfigurePageHtml(html);
  if (!htmlAnalysis.ok) {
    return htmlAnalysis;
  }

  const cssHref = extractNextCssHref(html);
  if (!cssHref) {
    return {
      ok: false,
      reason: "Page HTML is missing a Next.js CSS bundle link.",
    };
  }

  const cssUrl = new URL(cssHref, configureUrl).href;
  let cssResponse: Response;
  try {
    cssResponse = await fetch(cssUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Could not load CSS asset ${cssHref}: ${message}`,
    };
  }

  if (!cssResponse.ok) {
    return {
      ok: false,
      reason: `CSS asset ${cssHref} returned HTTP ${cssResponse.status}`,
    };
  }

  const cssBody = await cssResponse.text();
  return validateConfigureCssAsset({
    contentType: cssResponse.headers.get("content-type"),
    body: cssBody,
    href: cssHref,
  });
}

export async function waitForConfigureServer(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/settings/configure`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { redirect: "follow" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Server still starting.
    }

    await sleep(500);
  }

  throw new Error(
    `Configure GUI did not become reachable at ${healthUrl} within ${timeoutMs}ms`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
