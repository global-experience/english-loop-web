import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeNativeReminderRuntime } from "@/lib/nativeReminders";

/**
 * Android 장소 알림 딥링크. 네이티브(MainActivity)가 Intent extras 를 들고 있다가
 * 웹이 초기화되거나 백그라운드에서 돌아올 때 consumePendingRoutineNotification() 으로 넘긴다.
 */
type HostWindow = Window & {
  LoopineNativeGeofencingHost?: { consumePendingRoutineNotification?: () => string };
};

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  // jsdom 의 location 은 교체가 안 되므로 assign 만 가로챈다.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, origin: "https://loopine.life", assign },
  });
});

afterEach(() => {
  delete (window as HostWindow).LoopineNativeGeofencingHost;
});

describe("Android routine notification deep link", () => {
  it("opens the routine the notification pointed at when the runtime initializes", async () => {
    const consume = vi.fn().mockReturnValueOnce(
      JSON.stringify({ routineId: "plan-1", routineItemId: "item-7", entrySource: "notification" })
    ).mockReturnValue("");
    (window as HostWindow).LoopineNativeGeofencingHost = { consumePendingRoutineNotification: consume };

    await initializeNativeReminderRuntime();

    expect(consume).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/learn/");
    expect(url.searchParams.get("routineId")).toBe("plan-1");
    expect(url.searchParams.get("routineItemId")).toBe("item-7");
    expect(url.searchParams.get("entrySource")).toBe("notification");
  });

  it("checks again when the app comes back to the foreground, and ignores an empty answer", async () => {
    const consume = vi.fn().mockReturnValue("");
    (window as HostWindow).LoopineNativeGeofencingHost = { consumePendingRoutineNotification: consume };

    await initializeNativeReminderRuntime();
    expect(assign).not.toHaveBeenCalled();

    consume.mockReturnValueOnce(JSON.stringify({ routineItemId: "item-9" }));
    window.dispatchEvent(new CustomEvent("loopine:native-app-resumed"));

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toContain("routineItemId=item-9");
  });

  it("survives a broken payload without throwing", async () => {
    (window as HostWindow).LoopineNativeGeofencingHost = {
      consumePendingRoutineNotification: vi.fn().mockReturnValue("{not json"),
    };

    await expect(initializeNativeReminderRuntime()).resolves.toBe(false);
    // 리스너는 모듈 단위로 한 번만 등록되므로 복귀 이벤트로 경로를 태운다.
    expect(() => window.dispatchEvent(new CustomEvent("loopine:native-app-resumed"))).not.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });
});
