import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SPLASH_SESSION_KEY, useAppSplash } from "@/components/AppSplash";

describe("useAppSplash hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    delete (window as any).Capacitor;
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    delete (window as any).Capacitor;
  });

  it("skips splash immediately when running inside native app runtime", () => {
    (window as any).Capacitor = { isNativePlatform: () => true };

    const { result } = renderHook(() => useAppSplash());

    // Should immediately be ready and not visible (skipped)
    expect(result.current.ready).toBe(true);
    expect(result.current.visible).toBe(false);
    expect(result.current.fadingOut).toBe(false);
  });

  it("shows splash in browser on first visit, then fades out and hides", () => {
    delete (window as any).Capacitor;

    const { result } = renderHook(() => useAppSplash());

    // Initially visible
    expect(result.current.visible).toBe(true);
    expect(result.current.fadingOut).toBe(false);

    // After 1250ms -> starts fading out
    act(() => {
      vi.advanceTimersByTime(1250);
    });
    expect(result.current.visible).toBe(true);
    expect(result.current.fadingOut).toBe(true);

    // After additional 250ms (total 1500ms) -> unmounts
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.visible).toBe(false);
    expect(result.current.fadingOut).toBe(false);
    expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe("true");
  });

  it("skips splash on subsequent page navigation in same session", () => {
    delete (window as any).Capacitor;
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");

    const { result } = renderHook(() => useAppSplash());

    expect(result.current.ready).toBe(true);
    expect(result.current.visible).toBe(false);
  });
});
