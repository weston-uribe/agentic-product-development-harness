import { describe, expect, it } from "vitest";
import {
  extractProductionUrlFromComments,
  extractProductionUrlFromChecks,
  inferVercelReadyFromComments,
} from "../../src/preview/production-from-merge.js";

describe("production-from-merge", () => {
  it("detects Vercel Ready in PR comments", () => {
    expect(
      inferVercelReadyFromComments([
        {
          author: "vercel[bot]",
          body: "| Project | Deployment |\n| x | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com) |",
        },
      ]),
    ).toBe(true);
  });

  it("extracts production URL from Vercel comment", () => {
    const url = extractProductionUrlFromComments([
      {
        author: "vercel[bot]",
        body: "Deployed. [Production](https://weston-uribe-portfolio.vercel.app)",
      },
    ]);
    expect(url).toBe("https://weston-uribe-portfolio.vercel.app");
  });

  it("extracts production URL from check details", () => {
    const url = extractProductionUrlFromChecks([
      {
        name: "Vercel",
        detailsUrl: "https://vercel.com/deployments/https://weston-uribe-portfolio.vercel.app",
      },
    ]);
    expect(url).toContain("weston-uribe-portfolio.vercel.app");
  });
});
