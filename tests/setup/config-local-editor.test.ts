import { describe, expect, it } from "vitest";
import {
  normalizeConfigFormInput,
  validateConfigFormInput,
} from "../../src/setup/config-local-editor.js";

describe("config-local-editor", () => {
  it("normalizes comma-separated linear projects and newline commands", () => {
    const normalized = normalizeConfigFormInput({
      linearTeamKey: "WES",
      modelId: "composer-2.5",
      repos: [
        {
          id: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          linearProjects: "App One, App Two",
          linearTeams: "Team A\nTeam B",
          validationCommands: "npm run lint\nnpm run build",
        },
      ],
    });

    expect(normalized.repos[0]?.linearProjects).toEqual(["App One", "App Two"]);
    expect(normalized.repos[0]?.linearTeams).toEqual(["Team A", "Team B"]);
    expect(normalized.repos[0]?.validationCommands).toEqual([
      "npm run lint",
      "npm run build",
    ]);
    expect(normalized.allowedTargetRepos).toBeUndefined();
  });

  it("generates allowedTargetRepos closure from repo mappings", () => {
    const { config } = validateConfigFormInput({
      repos: [
        {
          id: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
        },
      ],
    });

    expect(config.allowedTargetRepos).toEqual([
      "https://github.com/owner/example-target-app",
    ]);
  });

  it("rejects invalid config before write", () => {
    expect(() =>
      validateConfigFormInput({
        repos: [
          {
            id: "",
            targetRepo: "not-a-valid-url",
          },
        ],
      }),
    ).toThrow();
  });

  it("requires at least one repo", () => {
    expect(() =>
      normalizeConfigFormInput({
        repos: [],
      }),
    ).toThrow(/At least one target repo/);
  });
});
