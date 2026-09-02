import { describe, expect, it } from "vitest";
import { hourInSeoul, resolveTodayFocus, slotForHour, ROUTINE_STEPS } from "@/lib/todayPlan";
import { listeningActivity } from "./fixtures";
import type { Activity } from "@/lib/types";

function day(overrides: Partial<Record<Activity["slot"], Activity["status"]>> = {}): Activity[] {
  return (["MORNING_COMMUTE", "LUNCH", "EVENING_COMMUTE", "NIGHT_VOICE"] as const).map((slot, index) => ({
    ...listeningActivity,
    id: `a${index + 1}`,
    slot,
    status: overrides[slot] || "NOT_STARTED",
  }));
}

/** 09:00, 12:00, 17:00 and 22:00 in Asia/Seoul. */
const at = (utcHour: number) => new Date(Date.UTC(2026, 7, 23, utcHour, 0, 0));

describe("routine slots", () => {
  it("covers all 24 hours with exactly one slot", () => {
    const slots = Array.from({ length: 24 }, (_, hour) => slotForHour(hour));
    expect(slots.filter(Boolean)).toHaveLength(24);
    expect(new Set(slots).size).toBe(4);
  });

  it("maps the day's hours to the four steps", () => {
    expect(slotForHour(6)).toBe("MORNING_COMMUTE");
    expect(slotForHour(12)).toBe("LUNCH");
    expect(slotForHour(17)).toBe("EVENING_COMMUTE");
    expect(slotForHour(21)).toBe("NIGHT_VOICE");
    // Past midnight still belongs to the night session.
    expect(slotForHour(2)).toBe("NIGHT_VOICE");
  });

  it("reads the clock in Asia/Seoul, not the host timezone", () => {
    expect(hourInSeoul(at(0))).toBe(9);
    expect(hourInSeoul(at(11))).toBe(20);
  });

  it("keeps the four steps in day order", () => {
    expect(ROUTINE_STEPS.map((step) => step.slot)).toEqual([
      "MORNING_COMMUTE", "LUNCH", "EVENING_COMMUTE", "NIGHT_VOICE",
    ]);
  });
});

describe("resolveTodayFocus", () => {
  it("focuses the step for the current hour", () => {
    const focus = resolveTodayFocus(day(), at(0));
    expect(focus.step?.slot).toBe("MORNING_COMMUTE");
    expect(focus.states.MORNING_COMMUTE).toBe("current");
    expect(focus.states.LUNCH).toBe("upcoming");
    expect(focus.allDone).toBe(false);
  });

  it("skips a step that is already completed", () => {
    const focus = resolveTodayFocus(day({ MORNING_COMMUTE: "COMPLETED" }), at(0));
    expect(focus.step?.slot).toBe("LUNCH");
    expect(focus.states.MORNING_COMMUTE).toBe("done");
    expect(focus.states.LUNCH).toBe("current");
    expect(focus.completedCount).toBe(1);
  });

  it("falls back to an earlier unfinished step instead of declaring the day over", () => {
    // Evening, but only the morning was skipped.
    const focus = resolveTodayFocus(
      day({ EVENING_COMMUTE: "COMPLETED", NIGHT_VOICE: "COMPLETED", LUNCH: "COMPLETED" }),
      at(11)
    );
    expect(focus.step?.slot).toBe("MORNING_COMMUTE");
    expect(focus.allDone).toBe(false);
  });

  it("reports the day as finished only when every step is complete", () => {
    const focus = resolveTodayFocus(
      day({ MORNING_COMMUTE: "COMPLETED", LUNCH: "COMPLETED", EVENING_COMMUTE: "COMPLETED", NIGHT_VOICE: "COMPLETED" }),
      at(11)
    );
    expect(focus.allDone).toBe(true);
    expect(focus.step).toBeNull();
    expect(focus.completedCount).toBe(4);
    expect(Object.values(focus.states).every((state) => state === "done")).toBe(true);
  });

  it("marks exactly one step as current", () => {
    for (const hour of [0, 3, 8, 11, 15, 20]) {
      const states = Object.values(resolveTodayFocus(day(), at(hour)).states);
      expect(states.filter((state) => state === "current")).toHaveLength(1);
    }
  });

  it("estimates the focused step and the rest of the day from planned minutes", () => {
    const activities = day().map((activity) =>
      activity.slot === "MORNING_COMMUTE" ? { ...activity, actual_minutes: 10 } : activity
    );
    const focus = resolveTodayFocus(activities, at(0));
    expect(focus.estimatedMinutes).toBe(20);
    expect(focus.remainingMinutes).toBe(20 + 30 + 30 + 30);
  });

  it("handles a plan with no activities", () => {
    const focus = resolveTodayFocus([], at(0));
    expect(focus.step?.slot).toBe("MORNING_COMMUTE");
    expect(focus.activity).toBeNull();
    expect(focus.estimatedMinutes).toBe(0);
  });
});
