import type { Activity, TodayData, TodayRoutineItem } from "@/lib/types";

export type RoutineSlot = Activity["slot"];
export type RoutineState = "done" | "current" | "upcoming" | "skipped" | "today_inactive";

export type LegacyRoutineStep = {
  slot: RoutineSlot;
  label: string;
  detail: string;
  guidance: string;
  fromHour: number;
  toHour: number;
};

export const ROUTINE_STEPS: LegacyRoutineStep[] = [
  { slot: "MORNING_COMMUTE", label: "출근 듣기", detail: "대본 없이 듣고 입 모양으로 따라 하기", guidance: "이동하는 동안 대본 없이 한 번 듣고, 들리는 만큼만 입으로 따라가 보세요.", fromHour: 5, toHour: 11 },
  { slot: "LUNCH", label: "점심 말하기", detail: "핵심 표현을 준비하고 실제로 말하기", guidance: "오늘의 표현으로 짧은 답변을 만들어 소리 내어 말해보세요.", fromHour: 11, toHour: 14 },
  { slot: "EVENING_COMMUTE", label: "퇴근 자막 없이 말하기", detail: "자막을 가리고 문장을 다시 말하기", guidance: "자막을 끄고 아침에 들은 문장을 기억만으로 다시 말해보세요.", fromHour: 14, toHour: 19 },
  { slot: "NIGHT_VOICE", label: "밤 음성 대화", detail: "ChatGPT 음성 모드로 표현 꺼내 쓰기", guidance: "ChatGPT 음성 대화에서 오늘의 표현을 실제로 꺼내 쓰고 결과를 저장하세요.", fromHour: 19, toHour: 5 },
];

const STEP_BY_SLOT = new Map(ROUTINE_STEPS.map((step) => [step.slot, step]));

export function routineStep(slot: RoutineSlot): LegacyRoutineStep {
  return STEP_BY_SLOT.get(slot) ?? ROUTINE_STEPS[0];
}

export function hourInSeoul(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Seoul" })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  const parsed = Number(hour ?? "0");
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

export function slotForHour(hour: number): RoutineSlot {
  const normalized = ((hour % 24) + 24) % 24;
  for (const step of ROUTINE_STEPS) {
    const wraps = step.toHour <= step.fromHour;
    const inside = wraps ? normalized >= step.fromHour || normalized < step.toHour : normalized >= step.fromHour && normalized < step.toHour;
    if (inside) return step.slot;
  }
  return "NIGHT_VOICE";
}

export type TodayFocus = {
  step: LegacyRoutineStep | null;
  routineItem: TodayRoutineItem | null;
  activity: Activity | null;
  timeSlot: RoutineSlot;
  states: Record<string, RoutineState>;
  estimatedMinutes: number;
  remainingMinutes: number;
  completedCount: number;
  allDone: boolean;
  routineItems: TodayRoutineItem[];
};

function minutesLeft(activity: Activity | null | undefined): number {
  if (!activity) return 0;
  const planned = activity.planned_minutes || 0;
  return Math.max(0, planned - (activity.actual_minutes || 0) || planned);
}

function legacyFocus(activities: Activity[], now: Date): TodayFocus {
  const timeSlot = slotForHour(hourInSeoul(now));
  const bySlot = new Map(activities.map((activity) => [activity.slot, activity]));
  const order = ROUTINE_STEPS.map((step) => step.slot);
  const startIndex = Math.max(0, order.indexOf(timeSlot));
  const isDone = (slot: RoutineSlot) => bySlot.get(slot)?.status === "COMPLETED";
  const rotated = [...order.slice(startIndex), ...order.slice(0, startIndex)];
  const focusSlot = rotated.find((slot) => bySlot.has(slot) && !isDone(slot)) ?? rotated.find((slot) => !isDone(slot)) ?? null;
  const states = order.reduce((accumulator, slot) => {
    accumulator[slot] = isDone(slot) ? "done" : slot === focusSlot ? "current" : "upcoming";
    return accumulator;
  }, {} as Record<string, RoutineState>);
  const activity = focusSlot ? bySlot.get(focusSlot) ?? null : null;
  const remainingMinutes = order.filter((slot) => !isDone(slot)).reduce((total, slot) => total + minutesLeft(bySlot.get(slot)), 0);
  return {
    step: focusSlot ? routineStep(focusSlot) : null,
    routineItem: null,
    activity,
    timeSlot,
    states,
    estimatedMinutes: activity ? minutesLeft(activity) : 0,
    remainingMinutes,
    completedCount: order.filter(isDone).length,
    allDone: focusSlot === null,
    routineItems: [],
  };
}

export function resolveTodayFocus(activities: Activity[], now: Date = new Date(), routineItems: TodayRoutineItem[] = []): TodayFocus {
  if (!routineItems.length) return legacyFocus(activities, now);
  const focusItem = routineItems.find((item) => item.state === "current")
    ?? routineItems.filter((item) => item.state === "upcoming").sort((a, b) => (a.minutes_until ?? 9999) - (b.minutes_until ?? 9999))[0]
    ?? null;
  const states = routineItems.reduce((accumulator, item) => {
    accumulator[item.id] = item.state;
    return accumulator;
  }, {} as Record<string, RoutineState>);
  const actionable = routineItems.filter((item) => item.state !== "today_inactive");
  return {
    step: null,
    routineItem: focusItem,
    activity: null,
    timeSlot: "MORNING_COMMUTE",
    states,
    estimatedMinutes: focusItem?.estimated_minutes ?? 0,
    remainingMinutes: actionable.filter((item) => item.state !== "done" && item.state !== "skipped").reduce((total, item) => total + item.estimated_minutes, 0),
    completedCount: actionable.filter((item) => item.state === "done").length,
    allDone: actionable.length > 0 && actionable.every((item) => item.state === "done" || item.state === "skipped"),
    routineItems,
  };
}

export function dateLabelInSeoul(studyDate: string): string {
  const parsed = new Date(`${studyDate}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return studyDate;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" }).format(parsed);
}

export function stepOpensCoach(step: RoutineSlot | TodayRoutineItem | LegacyRoutineStep | null | undefined): boolean {
  if (!step) return false;
  if (typeof step === "string") return step === "NIGHT_VOICE";
  if ("slot" in step) return step.slot === "NIGHT_VOICE";
  return step.activity_type === "ai_conversation";
}

export function targetExpressionCount(today: TodayData): number {
  return today.plan?.target_expressions?.length ?? 0;
}
