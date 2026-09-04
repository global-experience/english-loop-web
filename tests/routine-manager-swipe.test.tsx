import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoutineManagerView } from "@/components/RoutineManagerView";

vi.mock("@/lib/routines", () => ({
  ACTIVITY_LABELS: {},
  DAY_LABELS: {},
  RoutineIcon: () => null,
  daySummary: () => "",
  defaultRoutineItem: () => ({}),
  fetchRoutines: vi.fn().mockResolvedValue({ plans: [] }),
  notifyRoutinesUpdated: vi.fn(),
  syncRoutineNotifications: vi.fn().mockResolvedValue("granted"),
}));

describe("RoutineManagerView Swipe Gesture", () => {
  it("triggers onBack when swiping right", async () => {
    const onBack = vi.fn();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(<RoutineManagerView onBack={onBack} onRefresh={onRefresh} />);

    const board = screen.getByLabelText("학습 루틴 관리");

    // 오른쪽으로 80px 스와이프 시뮬레이션
    fireEvent.touchStart(board, {
      touches: [{ clientX: 50, clientY: 100 }],
    });
    fireEvent.touchEnd(board, {
      changedTouches: [{ clientX: 130, clientY: 105 }],
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onBack when swiping left or vertically", async () => {
    const onBack = vi.fn();
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(<RoutineManagerView onBack={onBack} onRefresh={onRefresh} />);

    const board = screen.getByLabelText("학습 루틴 관리");

    // 왼쪽으로 스와이프
    fireEvent.touchStart(board, {
      touches: [{ clientX: 150, clientY: 100 }],
    });
    fireEvent.touchEnd(board, {
      changedTouches: [{ clientX: 70, clientY: 100 }],
    });

    expect(onBack).not.toHaveBeenCalled();

    // 아래로 세로 스크롤/스와이프
    fireEvent.touchStart(board, {
      touches: [{ clientX: 100, clientY: 50 }],
    });
    fireEvent.touchEnd(board, {
      changedTouches: [{ clientX: 110, clientY: 150 }],
    });

    expect(onBack).not.toHaveBeenCalled();
  });
});
