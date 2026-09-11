import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoutineManagerView } from "@/components/RoutineManagerView";
import type { RoutinePayload } from "@/lib/types";
import { fetchRoutines } from "@/lib/routines";
import { apiFetch } from "@/lib/api";

const { routinePayload } = vi.hoisted(() => ({ routinePayload: {
  timezone: "Asia/Seoul",
  plans: [{
    id: "plan-weekday",
    name: "평일 루틴",
    plan_type: "weekday",
    days_of_week: [0, 1, 2, 3, 4],
    sort_order: 0,
    is_active: true,
    items: [{
      id: "item-morning",
      routine_id: "plan-weekday",
      name: "아침 듣기",
      icon: "sun",
      start_time: "08:00",
      end_time: null,
      days_of_week: [0, 1, 2, 3, 4],
      is_active: true,
      sort_order: 0,
      estimated_minutes: 10,
      activity_type: "listen",
      content_strategy: "recommended",
      fixed_content_id: null,
      config: {
        repeatOptions: [1, 3, 5],
        speedOptions: [0.75, 1, 1.25],
        defaultRepeat: 1,
        defaultSpeed: 1,
        subtitleMode: "user_choice",
        showTranslation: false,
        recordingEnabled: true,
        sttEnabled: true,
      },
      notification: { enabled: false, offsetMinutes: 0, trigger: "time", fallbackToTime: true, locationWindowMinutes: 180 },
    }],
  }],
} as RoutinePayload }));

vi.mock("@/lib/routines", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/routines")>();
  return { ...actual, fetchRoutines: vi.fn().mockResolvedValue(routinePayload), notifyRoutinesUpdated: vi.fn() };
});

vi.mock("@/components/SmartLocationSettings", () => ({
  SmartLocationSettings: () => (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("loopine:open-routine-notification-guide"))}
    >
      가이드 시작
    </button>
  ),
}));

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

type RuntimeWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

describe("smart reminder routine guide", () => {
  beforeEach(() => {
    vi.mocked(fetchRoutines).mockResolvedValue(routinePayload);
    vi.mocked(apiFetch).mockReset();
    (window as RuntimeWindow).Capacitor = { isNativePlatform: () => true };
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    delete (window as RuntimeWindow).Capacitor;
  });

  it("opens the first routine, enables notifications, and scrolls to its notification controls", async () => {
    render(<RoutineManagerView onBack={vi.fn()} onRefresh={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "가이드 시작" }));

    expect(await screen.findByRole("dialog", { name: "루틴 알림 설정을 도와드릴까요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /가이드 보기/ }));

    expect(await screen.findByRole("dialog", { name: "아침 듣기 루틴 수정" })).toBeInTheDocument();
    expect(screen.getByText("마지막으로 루틴 알림을 연결해볼까요?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림/ })).toHaveClass("selected");
    expect(screen.getByLabelText("알림 실행 조건")).toBeInTheDocument();

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }));
  });

  it("creates a routine item when the first plan is empty, then opens the same guide", async () => {
    const emptyPayload: RoutinePayload = {
      ...routinePayload,
      plans: [{ ...routinePayload.plans[0], items: [] }],
    };
    vi.mocked(fetchRoutines).mockResolvedValue(emptyPayload);
    vi.mocked(apiFetch).mockResolvedValue(routinePayload);

    render(<RoutineManagerView onBack={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "가이드 시작" }));
    fireEvent.click(await screen.findByRole("button", { name: /가이드 보기/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/routines/items",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByRole("dialog", { name: "아침 듣기 루틴 수정" })).toBeInTheDocument();
    expect(screen.getByText("마지막으로 루틴 알림을 연결해볼까요?")).toBeInTheDocument();
  });

  it("dismisses the centered guide prompt without opening a routine", async () => {
    render(<RoutineManagerView onBack={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "가이드 시작" }));

    const prompt = await screen.findByRole("dialog", { name: "루틴 알림 설정을 도와드릴까요?" });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(prompt).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "아침 듣기 루틴 수정" })).not.toBeInTheDocument();
  });
});
