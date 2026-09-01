import { describe, expect, it } from "vitest";
import { isNativeAppRuntime, shouldStartFeedMuted } from "@/lib/nativeRuntime";

describe("native feed playback", () => {
  it("recognizes both the Capacitor bridge and the native user agent", () => {
    expect(isNativeAppRuntime({ isNativePlatform: () => true }, "Safari")).toBe(true);
    expect(isNativeAppRuntime(undefined, "Safari LoopineNative/1.0")).toBe(true);
    expect(isNativeAppRuntime(undefined, "Mobile Safari")).toBe(false);
  });

  it("starts native playback with sound but respects user interaction and sticky activation in browser", () => {
    expect(shouldStartFeedMuted({ native: true, userInteracted: false, userMuted: false, hasBeenActive: false })).toBe(false);
    expect(shouldStartFeedMuted({ native: false, userInteracted: false, userMuted: false, hasBeenActive: false })).toBe(true);
    expect(shouldStartFeedMuted({ native: false, userInteracted: false, userMuted: false, hasBeenActive: true })).toBe(false);
    expect(shouldStartFeedMuted({ native: false, userInteracted: true, userMuted: false, hasBeenActive: false })).toBe(false);
    expect(shouldStartFeedMuted({ native: true, userInteracted: true, userMuted: true, hasBeenActive: true })).toBe(true);
  });
});
