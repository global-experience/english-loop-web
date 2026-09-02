/**
 * Today tab domain logic.
 *
 * The Today tab is not a dashboard: it answers "what do I do next?". Everything here
 * is a pure function of the day's plan plus the current time, so the decision can be
 * unit tested without rendering anything.
 */

import type { Activity, TodayData } from "@/lib/types";

export type RoutineSlot = Activity["slot"];
export type RoutineState = "done" | "current" | "upcoming";

export type RoutineStep = {
  slot: RoutineSlot;
  label: string;
  detail: string;
  /** One short sentence telling the learner what to actually do now. */
  guidance: string;
  /** Start hour of the slot in Asia/Seoul, inclusive. */
  fromHour: number;
  /** End hour in Asia/Seoul, exclusive. Wraps past midnight when smaller. */
  toHour: number;
};

export const ROUTINE_STEPS: RoutineStep[] = [
  {
    slot: "MORNING_COMMUTE",
    label: "출근 듣기",
    detail: "대본 없이 듣고 입 모양으로 따라 하기",
    guidance: "이동하는 동안 대본 없이 한 번 듣고, 들리는 만큼만 입으로 따라가 보세요.",
    fromHour: 5,
    toHour: 11,
  },
  {
    slot: "LUNCH",
    label: "점심 말하기",
    detail: "핵심 표현을 준비하고 실제로 말하기",
    guidance: "오늘의 표현으로 짧은 답변을 만들어 소리 내어 말해보세요.",
    fromHour: 11,
    toHour: 14,
  },
  {
    slot: "EVENING_COMMUTE",
    label: "퇴근 자막 없이 말하기",
    detail: "자막을 가리고 문장을 다시 말하기",
    guidance: "자막을 끄고 아침에 들은 문장을 기억만으로 다시 말해보세요.",
    fromHour: 14,
    toHour: 19,
  },
  {
    slot: "NIGHT_VOICE",
    label: "밤 음성 대화",
    detail: "ChatGPT 음성 모드로 표현 꺼내 쓰기",
    guidance: "ChatGPT 음성 대화에서 오늘의 표현을 실제로 꺼내 쓰고 결과를 저장하세요.",
    fromHour: 19,
    toHour: 5,
  },
];

const STEP_BY_SLOT = new Map(ROUTINE_STEPS.map((step) => [step.slot, step]));

export function routineStep(slot: RoutineSlot): RoutineStep {
  return STEP_BY_SLOT.get(slot) ?? ROUTINE_STEPS[0];
}

/** The learner's plan is built around Asia/Seoul, so the clock must be read there. */
export function hourInSeoul(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).formatToParts(now).find((part) => part.type === "hour")?.value;
  const parsed = Number(hour ?? "0");
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

export function slotForHour(hour: number): RoutineSlot {
  const normalized = ((hour % 24) + 24) % 24;
  for (const step of ROUTINE_STEPS) {
    const wraps = step.toHour <= step.fromHour;
    const inside = wraps
      ? normalized >= step.fromHour || normalized < step.toHour
      : normalized >= step.fromHour && normalized < step.toHour;
    if (inside) return step.slot;
  }
  return "NIGHT_VOICE";
}

export type TodayFocus = {
  /** The step to push the learner into right now. Null once the day is finished. */
  step: RoutineStep | null;
  activity: Activity | null;
  /** The slot the clock is in, even when that step is already finished. */
  timeSlot: RoutineSlot;
  states: Record<RoutineSlot, RoutineState>;
  /** Minutes left for the focused step. */
  estimatedMinutes: number;
  /** Minutes left across every unfinished step today. */
  remainingMinutes: number;
  completedCount: number;
  allDone: boolean;
};

function minutesLeft(activity: Activity | null | undefined): number {
  if (!activity) return 0;
  const planned = activity.planned_minutes || 0;
  const left = planned - (activity.actual_minutes || 0);
  return Math.max(0, left || planned);
}

/**
 * Pick the one step to highlight: the first unfinished step at or after the current
 * time slot, falling back to any earlier unfinished step so a skipped morning is not
 * silently lost.
 */
export function resolveTodayFocus(activities: Activity[], now: Date = new Date()): TodayFocus {
  const timeSlot = slotForHour(hourInSeoul(now));
  const bySlot = new Map(activities.map((activity) => [activity.slot, activity]));
  const order = ROUTINE_STEPS.map((step) => step.slot);
  const startIndex = Math.max(0, order.indexOf(timeSlot));

  const isDone = (slot: RoutineSlot) => bySlot.get(slot)?.status === "COMPLETED";
  const rotated = [...order.slice(startIndex), ...order.slice(0, startIndex)];
  // Steps from the current slot onward come first; earlier unfinished steps are the
  // fallback so the learner is never told the day is over while work remains.
  const focusSlot = rotated.find((slot) => bySlot.has(slot) && !isDone(slot))
    ?? rotated.find((slot) => !isDone(slot))
    ?? null;

  const states = order.reduce((accumulator, slot) => {
    accumulator[slot] = isDone(slot) ? "done" : slot === focusSlot ? "current" : "upcoming";
    return accumulator;
  }, {} as Record<RoutineSlot, RoutineState>);

  const activity = focusSlot ? bySlot.get(focusSlot) ?? null : null;
  const remainingMinutes = order
    .filter((slot) => !isDone(slot))
    .reduce((total, slot) => total + minutesLeft(bySlot.get(slot)), 0);

  return {
    step: focusSlot ? routineStep(focusSlot) : null,
    activity,
    timeSlot,
    states,
    estimatedMinutes: activity ? minutesLeft(activity) : 0,
    remainingMinutes,
    completedCount: order.filter(isDone).length,
    allDone: focusSlot === null,
  };
}

export function dateLabelInSeoul(studyDate: string): string {
  const parsed = new Date(`${studyDate}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return studyDate;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

/** A step with no content cannot open a learning session; night voice opens ChatGPT. */
export function stepOpensCoach(slot: RoutineSlot | null | undefined): boolean {
  return slot === "NIGHT_VOICE";
}

export function targetExpressionCount(today: TodayData): number {
  return today.plan?.target_expressions.length ?? 0;
}
