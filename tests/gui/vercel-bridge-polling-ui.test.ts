import { describe, expect, it } from "vitest";
import {
  canInvalidatePreviewDuringPolling,
  isRedeployPollingActive,
} from "../../apps/gui/lib/vercel-bridge-polling-ui";

describe("vercel-bridge-polling-ui", () => {
  it("treats setupPending or pollActionId as active redeploy polling", () => {
    expect(
      isRedeployPollingActive({ setupPending: true, pollActionId: null }),
    ).toBe(true);
    expect(
      isRedeployPollingActive({ setupPending: false, pollActionId: "action-1" }),
    ).toBe(true);
    expect(
      isRedeployPollingActive({ setupPending: false, pollActionId: null }),
    ).toBe(false);
  });

  it("blocks preview invalidation while polling unless forced", () => {
    expect(canInvalidatePreviewDuringPolling(true)).toBe(false);
    expect(canInvalidatePreviewDuringPolling(true, { force: true })).toBe(true);
    expect(canInvalidatePreviewDuringPolling(false)).toBe(true);
  });
});
