import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIGURE_ROUTE,
  WORKFLOW_ROUTE,
  resolvePackagedDefaultRoute,
} from "../../src/setup/packaged-default-route.js";

describe("resolvePackagedDefaultRoute", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "packaged-default-route-"));
    await mkdir(path.join(tempRoot, ".harness"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("routes fresh workspaces to Configure", async () => {
    const decision = await resolvePackagedDefaultRoute(tempRoot);
    expect(decision.route).toBe(CONFIGURE_ROUTE);
    expect(decision.evidence).toBe("incomplete");
  });

  it("routes ambiguous partial setup to Configure", async () => {
    await writeFile(
      path.join(tempRoot, ".harness", "config.local.json"),
      JSON.stringify(
        {
          version: 1,
          orchestratorMarker: "harness-orchestrator-v1",
          logDirectory: "runs",
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
              baseBranch: "main",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const decision = await resolvePackagedDefaultRoute(tempRoot);
    expect(decision.route).toBe(CONFIGURE_ROUTE);
    expect(decision.evidence).toBe("ambiguous");
  });

  it("routes clearly configured workspaces to Workflow", async () => {
    await writeFile(
      path.join(tempRoot, ".env.local"),
      [
        "LINEAR_API_KEY=linear-test",
        "CURSOR_API_KEY=cursor-test",
        "GITHUB_TOKEN=github-test",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, ".harness", "config.local.json"),
      JSON.stringify(
        {
          version: 1,
          orchestratorMarker: "harness-orchestrator-v1",
          logDirectory: "runs",
          repos: [
            {
              id: "target-app",
              targetRepo: "https://github.com/owner/example-target-app",
              baseBranch: "main",
            },
          ],
          allowedTargetRepos: ["https://github.com/owner/example-target-app"],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(tempRoot, ".harness", "control-plane-setup.json"),
      JSON.stringify(
        {
          version: 1,
          linear: {
            teamMode: "existing",
            teamId: "team-1",
            teamKey: "TEAM",
            teamName: "Team",
            projectMode: "existing",
            projectId: "project-1",
            projectName: "Project",
            statusCoverageComplete: true,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const decision = await resolvePackagedDefaultRoute(tempRoot);
    expect(decision.route).toBe(WORKFLOW_ROUTE);
    expect(decision.evidence).toBe("configured");
  });
});
