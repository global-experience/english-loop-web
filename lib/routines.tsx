"use client";

import {
  BookOpen,
  Captions,
  CaptionsOff,
  Coffee,
  Headphones,
  MessageCircle,
  Mic2,
  Moon,
  Pencil,
  RotateCcw,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { syncNativeRoutineReminders } from "@/lib/nativeReminders";
import type { RoutineActivityType, RoutineItem, RoutinePayload } from "@/lib/types";

export const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export const ACTIVITY_LABELS: Record<RoutineActivityType, string> = {
  listen: "듣기",
  shadowing: "자막 보고 따라 말하기",
  recall: "자막 없이 말하기",
  record: "문장 녹음 및 STT 확인",
  review: "저장 표현 복습",
  ai_conversation: "AI 음성 대화",
  free_study: "자유 학습",
};

const ICONS: Record<string, LucideIcon> = {
  sun: Sun,
  coffee: Coffee,
  moon: Moon,
  headphones: Headphones,
  "mic-2": Mic2,
  captions: Captions,
  "captions-off": CaptionsOff,
  "book-open": BookOpen,
  review: RotateCcw,
  pencil: Pencil,
  ai: MessageCircle,
  sparkles: Sparkles,
};

export function RoutineIcon({ name, size = 20 }: { name?: string | null; size?: number }) {
  const Icon = ICONS[name || ""] || BookOpen;
  return <Icon size={size} />;
}

export function daySummary(days: number[]) {
  if (days.length === 7) return "매일";
  if (days.join(",") === "0,1,2,3,4") return "평일";
  if (days.join(",") === "5,6") return "주말";
  return days.map((day) => DAY_LABELS[day] || "").filter(Boolean).join(" · ") || "요일 없음";
}

export function defaultRoutineItem(routineId: string, sortOrder: number): Partial<RoutineItem> {
  return {
    routine_id: routineId,
    name: "새 루틴",
    icon: "book-open",
    start_time: "09:00",
    end_time: null,
    days_of_week: [0, 1, 2, 3, 4],
    is_active: true,
    sort_order: sortOrder,
    estimated_minutes: 20,
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
      targetCount: 5,
      durationMinutes: 20,
      completionCondition: "practice_target_count",
    },
    notification: {
      enabled: false,
      offsetMinutes: 0,
      trigger: "time",
      fallbackToTime: true,
      locationWindowMinutes: 180,
    },
  };
}

export async function syncRoutineNotifications(payload: RoutinePayload): Promise<"scheduled" | "denied" | "location-denied" | "unavailable"> {
  return syncNativeRoutineReminders(payload);
}

export async function fetchRoutines() {
  return apiFetch<RoutinePayload>("/api/routines");
}

export function notifyRoutinesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("loopine:routines-updated"));
  }
}
