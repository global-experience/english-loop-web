import { describe, expect, it } from "vitest";
import { routineCompletionProgress } from "@/lib/routineCompletion";
import type { LearningSessionEntry } from "@/lib/learningSession";
import type { RoutineActivityType } from "@/lib/types";

function entry(activityType: RoutineActivityType, targetCount = 5): LearningSessionEntry {
  return {
    contentId: "content-1",
    entrySource: "today",
    routineItemId: "routine-item-1",
    routineSnapshot: {
      routine_id: "routine-1",
      routine_item_id: "routine-item-1",
      name: "테스트 루틴",
      icon: "book-open",
      start_time: "08:00",
      end_time: null,
      days_of_week: [0],
      estimated_minutes: 10,
      activity_type: activityType,
      content_strategy: "recommended",
      config: {
        repeatOptions: [1, 3, 5],
        speedOptions: [0.75, 1, 1.25],
        defaultRepeat: 1,
        defaultSpeed: 1,
        subtitleMode: "user_choice",
        showTranslation: false,
        recordingEnabled: true,
        sttEnabled: true,
        targetCount,
      },
      notification: { enabled: false, offsetMinutes: 0 },
    },
  };
}

describe("routineCompletionProgress", () => {
  it("counts completed listening segments for a listening routine", () => {
    expect(routineCompletionProgress(entry("listen", 3), { practiced: 3, spoken: 0, recalled: 0 }).eligible).toBe(true);
  });

  it("requires recorded speech for shadowing", () => {
    expect(routineCompletionProgress(entry("shadowing", 2), { practiced: 5, spoken: 1, recalled: 0 }).eligible).toBe(false);
    expect(routineCompletionProgress(entry("shadowing", 2), { practiced: 5, spoken: 2, recalled: 0 }).eligible).toBe(true);
  });

  it("requires subtitle-hidden speech evidence for recall", () => {
    expect(routineCompletionProgress(entry("recall", 1), { practiced: 4, spoken: 4, recalled: 0 }).eligible).toBe(false);
    expect(routineCompletionProgress(entry("recall", 1), { practiced: 4, spoken: 4, recalled: 1 }).eligible).toBe(true);
  });
});
