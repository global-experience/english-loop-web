import type { LearningSessionEntry } from "@/lib/learningSession";
import type { RoutineActivityType } from "@/lib/types";

export type RoutineEvidence = {
  practiced: number;
  spoken: number;
  recalled: number;
  reviewed?: number;
};

export type RoutineCompletionProgress = {
  activityType: RoutineActivityType | null;
  current: number;
  target: number;
  eligible: boolean;
  label: string;
};

const ACTIVITY_LABELS: Partial<Record<RoutineActivityType, string>> = {
  listen: "듣기",
  shadowing: "따라 말하기",
  recall: "자막 없이 말하기",
  record: "문장 녹음",
  review: "표현 복습",
  free_study: "자유 학습",
};

export function routineCompletionProgress(
  entry: LearningSessionEntry,
  evidence: RoutineEvidence,
): RoutineCompletionProgress {
  const activityType = entry.routineSnapshot?.activity_type ?? null;
  const configuredTarget = entry.routineConfig?.targetCount
    ?? entry.routineSnapshot?.config?.targetCount
    ?? 1;
  const target = Math.max(1, Math.min(100, Number(configuredTarget) || 1));
  const current = activityType === "listen" || activityType === "free_study"
    ? evidence.practiced
    : activityType === "shadowing" || activityType === "record"
      ? evidence.spoken
      : activityType === "recall"
        ? evidence.recalled
        : activityType === "review"
          ? evidence.reviewed ?? 0
          : 0;
  return {
    activityType,
    current,
    target,
    eligible: Boolean(entry.routineItemId && activityType && activityType !== "ai_conversation" && current >= target),
    label: activityType ? ACTIVITY_LABELS[activityType] ?? "학습" : "학습",
  };
}
