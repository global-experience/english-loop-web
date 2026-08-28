import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LunchSpeaking } from "@/components/LunchSpeaking";
import { today } from "./fixtures";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ id: "attempt-1" }) }));

describe("LunchSpeaking", () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
  afterEach(() => vi.useRealTimers());
  const activity = today.plan!.activities.find((item) => item.slot === "LUNCH")!;

  it("hides the prepared sentence and keeps keywords", () => {
    render(<LunchSpeaking activity={activity} expressions={today.plan!.target_expressions} topic="프로젝트" onComplete={vi.fn()}/>);
    fireEvent.change(screen.getByPlaceholderText(/영어로 2–3문장/), { target: { value: "The main challenge was scope." } });
    fireEvent.change(screen.getByPlaceholderText(/project · challenge/), { target: { value: "scope · learned" } });
    fireEvent.click(screen.getByRole("button", { name: /문장 숨기기/ }));
    expect(screen.getByPlaceholderText(/영어로 2–3문장/)).toHaveClass("blurred");
    expect(localStorage.getItem(`loopine:lunch:${activity.id}`)).toContain("scope");
  });

  it("runs the one-minute timer", () => {
    render(<LunchSpeaking activity={activity} expressions={today.plan!.target_expressions} topic="프로젝트" onComplete={vi.fn()}/>);
    fireEvent.click(screen.getByLabelText("타이머 시작"));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("00:58")).toBeInTheDocument();
  });
});
