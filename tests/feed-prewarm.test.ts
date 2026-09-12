import { describe, expect, it } from "vitest";
import {
  RAPID_SWIPE_COOLDOWN_MS,
  RAPID_SWIPE_WINDOW_MS,
  canPrewarmNeighbors,
  isRapidSwiping,
  prewarmWindow,
} from "@/lib/feedPrewarm";

describe("이웃 영상 프리워밍 정책", () => {
  it("네이티브 앱에서만 켜진다", () => {
    expect(canPrewarmNeighbors({ native: true })).toBe(true);
    expect(canPrewarmNeighbors({ native: false })).toBe(false);
  });

  it("데이터 절약 모드·느린 회선·저사양 기기에서는 켜지 않는다", () => {
    expect(canPrewarmNeighbors({ native: true, connection: { saveData: true } })).toBe(false);
    expect(canPrewarmNeighbors({ native: true, connection: { effectiveType: "3g" } })).toBe(false);
    expect(canPrewarmNeighbors({ native: true, connection: { effectiveType: "4g" } })).toBe(true);
    expect(canPrewarmNeighbors({ native: true, deviceMemory: 2 })).toBe(false);
    expect(canPrewarmNeighbors({ native: true, deviceMemory: 4 })).toBe(true);
  });

  it("이웃은 다음 영상부터, 목록 밖은 빼고 최대 두 개만 고른다", () => {
    expect(prewarmWindow(3, 10)).toEqual([4, 2]);
    expect(prewarmWindow(0, 10)).toEqual([1]);
    expect(prewarmWindow(9, 10)).toEqual([8]);
    expect(prewarmWindow(0, 1)).toEqual([]);
  });

  it("짧은 시간에 여러 번 넘기면 빠른 스냅으로 본다", () => {
    const now = 10_000;
    expect(isRapidSwiping([now - 200, now - 100], now)).toBe(false);
    expect(isRapidSwiping([now - 300, now - 200, now - 100], now)).toBe(true);
    // 창을 벗어난 스냅은 세지 않는다.
    const stale = now - RAPID_SWIPE_WINDOW_MS - 1;
    expect(isRapidSwiping([stale, stale, now], now)).toBe(false);
  });

  it("쿨다운은 판정 창보다 길다", () => {
    expect(RAPID_SWIPE_COOLDOWN_MS).toBeGreaterThan(RAPID_SWIPE_WINDOW_MS);
  });
});
