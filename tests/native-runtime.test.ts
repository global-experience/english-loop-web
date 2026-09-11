import { afterEach, describe, expect, it, vi } from "vitest";
import { hideNativeSplashScreen, isNativeAppRuntime, shouldStartFeedMuted } from "@/lib/nativeRuntime";

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

describe("hideNativeSplashScreen", () => {
  afterEach(() => {
    delete (window as any).Capacitor;
  });

  it("calls Capacitor SplashScreen.hide when running in native environment", async () => {
    const hideFn = vi.fn().mockResolvedValue(undefined);
    (window as any).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SplashScreen: {
          hide: hideFn,
        },
      },
    };

    const result = await hideNativeSplashScreen(350);
    expect(result).toBe(true);
    expect(hideFn).toHaveBeenCalledWith({ fadeOutDuration: 350 });
  });

  it("returns false without error when in browser environment", async () => {
    delete (window as any).Capacitor;
    const result = await hideNativeSplashScreen();
    expect(result).toBe(false);
  });

  it("safely handles exceptions from the plugin without crashing", async () => {
    (window as any).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        SplashScreen: {
          hide: vi.fn().mockRejectedValue(new Error("Native error")),
        },
      },
    };

    const result = await hideNativeSplashScreen();
    expect(result).toBe(false);
  });
});

