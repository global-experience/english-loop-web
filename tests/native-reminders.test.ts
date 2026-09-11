import { beforeEach, describe, expect, it } from "vitest";
import { buildRoutineReminderOccurrences, evaluateSmartPlace, getSmartReminderSettings, savePlaceCoordinates } from "@/lib/nativeReminders";
import type { RoutineItem, RoutinePayload } from "@/lib/types";

function item(patch: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: "routine-item-1",
    routine_id: "routine-plan-1",
    name: "출근 듣기",
    icon: "headphones",
    start_time: "07:30",
    end_time: null,
    days_of_week: [0],
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
      recordingEnabled: false,
      sttEnabled: false,
    },
    notification: {
      enabled: true,
      offsetMinutes: 0,
      trigger: "time",
      fallbackToTime: true,
      locationWindowMinutes: 180,
    },
    ...patch,
  };
}

function payload(routineItem: RoutineItem): RoutinePayload {
  return {
    timezone: "Asia/Seoul",
    plans: [{
      id: "routine-plan-1",
      name: "평일",
      plan_type: "weekday",
      days_of_week: [0, 1, 2, 3, 4],
      sort_order: 0,
      is_active: true,
      items: [routineItem],
    }],
  };
}

describe("native routine reminder schedule", () => {
  it("maps Loopine weekday zero to Monday", () => {
    const now = new Date(2026, 8, 7, 6, 0, 0); // Monday
    const [occurrence] = buildRoutineReminderOccurrences(payload(item()), now, 0);

    expect(occurrence.localDate).toBe("2026-09-07");
    expect(occurrence.scheduledAt.getHours()).toBe(7);
    expect(occurrence.scheduledAt.getMinutes()).toBe(30);
  });

  it("applies negative offsets across midnight", () => {
    const now = new Date(2026, 8, 6, 22, 0, 0); // Sunday
    const routineItem = item({
      start_time: "00:05",
      notification: { enabled: true, offsetMinutes: -10, trigger: "time", fallbackToTime: true, locationWindowMinutes: 180 },
    });
    const [occurrence] = buildRoutineReminderOccurrences(payload(routineItem), now, 1);

    expect(occurrence.localDate).toBe("2026-09-07");
    expect(occurrence.scheduledAt.getDate()).toBe(6);
    expect(occurrence.scheduledAt.getHours()).toBe(23);
    expect(occurrence.scheduledAt.getMinutes()).toBe(55);
  });

  it("does not add a time fallback when a location-only routine disables it", () => {
    const now = new Date(2026, 8, 7, 6, 0, 0);
    const routineItem = item({
      notification: { enabled: true, offsetMinutes: 0, trigger: "home_exit", fallbackToTime: false, locationWindowMinutes: 180 },
    });

    expect(buildRoutineReminderOccurrences(payload(routineItem), now, 0)).toHaveLength(0);
  });

  it("does not reschedule a completed occurrence", () => {
    const now = new Date(2026, 8, 7, 6, 0, 0);
    const routineItem = item();
    const value = payload(routineItem);
    value.study_date = "2026-09-07";
    value.today_items = [{
      ...routineItem,
      state: "done",
      status: "COMPLETED",
      content: null,
      minutes_until: null,
      routine_snapshot: {
        routine_id: routineItem.routine_id,
        routine_item_id: routineItem.id,
        name: routineItem.name,
        icon: routineItem.icon,
        start_time: routineItem.start_time,
        end_time: routineItem.end_time,
        days_of_week: routineItem.days_of_week,
        estimated_minutes: routineItem.estimated_minutes,
        activity_type: routineItem.activity_type,
        content_strategy: routineItem.content_strategy,
        config: routineItem.config,
        notification: routineItem.notification,
      },
    }];

    expect(buildRoutineReminderOccurrences(value, now, 0)).toHaveLength(0);
  });
});

describe("smart location transition hysteresis", () => {
  const place = {
    id: "place-1",
    name: "테스트 장소",
    latitude: 37.5,
    longitude: 127,
    radiusMeters: 500,
    updatedAt: "2026-09-11T00:00:00.000Z",
  };

  it("fires home exit only after moving beyond the exit buffer", () => {
    const nearBoundary = evaluateSmartPlace(place, { latitude: 37.5048, longitude: 127 }, true);
    const outside = evaluateSmartPlace(place, { latitude: 37.5052, longitude: 127 }, true);

    expect(nearBoundary.inside).toBe(true);
    expect(nearBoundary.transition).toBeUndefined();
    expect(outside.inside).toBe(false);
    expect(outside.transition).toBe("exit");
  });

  it("fires work enter only after moving inside the tighter enter boundary", () => {
    const boundaryNoise = evaluateSmartPlace(place, { latitude: 37.5044, longitude: 127 }, false);
    const inside = evaluateSmartPlace(place, { latitude: 37.5042, longitude: 127 }, false);

    expect(boundaryNoise.inside).toBe(false);
    expect(boundaryNoise.transition).toBeUndefined();
    expect(inside.inside).toBe(true);
    expect(inside.transition).toBe("enter");
  });
});

describe("smart place storage migration", () => {
  beforeEach(() => window.localStorage.clear());

  it("migrates fixed home data and applies the new 500m default", () => {
    window.localStorage.setItem("loopine:smart-location-reminders:v1", JSON.stringify({
      enabled: false,
      places: { home: { latitude: 37.5, longitude: 127, updatedAt: "2026-09-11T00:00:00.000Z" } },
    }));

    expect(getSmartReminderSettings().places.home).toMatchObject({ id: "home", name: "집", radiusMeters: 500 });
  });

  it("stores a map-selected place and clamps its radius", () => {
    const settings = savePlaceCoordinates({ name: "회사", latitude: 37.51, longitude: 127.02, radiusMeters: 5_000 });
    const [place] = Object.values(settings.places);

    expect(place).toMatchObject({ name: "회사", latitude: 37.51, longitude: 127.02, radiusMeters: 2_000 });
  });
});
