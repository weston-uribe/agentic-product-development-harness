import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNC_REPO_IDS,
  validateForce,
  validateIssueKey,
  validatePhase,
  validateRepoId,
} from "../../src/workflow/validate.js";

describe("validateIssueKey", () => {
  it("accepts valid keys", () => {
    expect(validateIssueKey("WES-13")).toBe(true);
    expect(validateIssueKey("wes-1")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(validateIssueKey("")).toBe(false);
    expect(validateIssueKey("WES-")).toBe(false);
    expect(validateIssueKey("WES-13; rm -rf")).toBe(false);
    expect(validateIssueKey(null)).toBe(false);
  });
});

describe("validatePhase", () => {
  it("accepts allowed phases", () => {
    for (const phase of [
      "auto",
      "planning",
      "implementation",
      "handoff",
      "revision",
      "merge",
    ]) {
      expect(validatePhase(phase)).toBe(true);
    }
  });

  it("rejects unknown phases", () => {
    expect(validatePhase("destroy")).toBe(false);
  });
});

describe("validateForce", () => {
  it("accepts true or false only", () => {
    expect(validateForce("true")).toBe(true);
    expect(validateForce("false")).toBe(true);
    expect(validateForce("yes")).toBe(false);
  });
});

describe("validateRepoId", () => {
  it("accepts configured repo ids", () => {
    expect(validateRepoId("portfolio", DEFAULT_SYNC_REPO_IDS)).toBe(true);
    expect(validateRepoId("harness", DEFAULT_SYNC_REPO_IDS)).toBe(true);
  });

  it("rejects unknown or malformed ids", () => {
    expect(validateRepoId("unknown", DEFAULT_SYNC_REPO_IDS)).toBe(false);
    expect(validateRepoId("../etc", DEFAULT_SYNC_REPO_IDS)).toBe(false);
  });
});
