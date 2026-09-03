"use client";

import { ArrowUpRight, Check, CirclePause, Clock3, Headphones, Mic2, Moon, RotateCcw } from "lucide-react";
import type { Activity, TodayRoutineItem } from "@/lib/types";
import { ACTIVITY_LABELS, RoutineIcon, daySummary } from "@/lib/routines";
import { ROUTINE_STEPS, routineStep, type RoutineSlot, type RoutineState } from "@/lib/todayPlan";

const LEGACY_ICONS = {
  MORNING_COMMUTE: Headphones,
  LUNCH: Mic2,
  EVENING_COMMUTE: RotateCcw,
  NIGHT_VOICE: Moon,
} as const;

const STATE_LABEL: Record<RoutineState, string> = {
  done: "완료",
  current: "지금 할 차례",
  upcoming: "예정",
  skipped: "건너뜀",
  today_inactive: "오늘 비활성",
};

export function TodayRoutine({
  activities,
  routineItems,
  states,
  onOpen,
}: {
  activities: Activity[];
  routineItems?: TodayRoutineItem[];
  states: Record<string, RoutineState>;
  onOpen: (target: RoutineSlot | TodayRoutineItem) => void;
}) {
  if (routineItems?.length) {
    const visible = routineItems.filter((item) => item.state !== "today_inactive");
    const inactive = routineItems.filter((item) => item.state === "today_inactive");
    return (
      <section className="today-section" aria-label="오늘의 루틴">
        <div className="section-heading">
          <div><p className="eyebrow">YOUR ROUTINE</p><h2>오늘의 루틴</h2></div>
          <span>{visible.length}개</span>
        </div>
        <ol className="today-routine">
          {visible.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`today-routine-row ${item.state}`}
                onClick={() => onOpen(item)}
                aria-label={`${item.name} 열기`}
                aria-current={item.state === "current" ? "step" : undefined}
              >
                <span className="today-routine-step">{String(index + 1).padStart(2, "0")}</span>
                <span className="today-routine-icon">
                  {item.state === "done" ? <Check size={20} /> : item.state === "skipped" ? <CirclePause size={20} /> : <RoutineIcon name={item.icon} size={20} />}
                </span>
                <span className="today-routine-copy">
                  <em>{STATE_LABEL[item.state]} · {item.estimated_minutes}분 · {item.start_time}</em>
                  <strong>{item.name}</strong>
                  <small>{ACTIVITY_LABELS[item.activity_type]} · {daySummary(item.days_of_week)}</small>
                </span>
                <ArrowUpRight size={19} className="today-routine-go" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        {inactive.length > 0 && (
          <p className="muted-copy today-empty-line">
            오늘 비활성 루틴 {inactive.length}개는 설정의 학습 루틴 관리에서 켤 수 있습니다.
          </p>
        )}
      </section>
    );
  }

  const bySlot = new Map(activities.map((activity) => [activity.slot, activity]));
  return (
    <section className="today-section" aria-label="오늘의 루틴">
      <div className="section-heading">
        <div><p className="eyebrow">YOUR DAY</p><h2>오늘의 루틴</h2></div>
        <span>4단계</span>
      </div>
      <ol className="today-routine">
        {ROUTINE_STEPS.map((step, index) => {
          const state = states[step.slot] || "upcoming";
          const activity = bySlot.get(step.slot);
          const Icon = LEGACY_ICONS[step.slot];
          const minutes = activity?.planned_minutes || 0;
          return (
            <li key={step.slot}>
              <button
                type="button"
                className={`today-routine-row ${state}`}
                onClick={() => onOpen(step.slot)}
                aria-label={`${step.label} 열기`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="today-routine-step">0{index + 1}</span>
                <span className="today-routine-icon">{state === "done" ? <Check size={20} /> : <Icon size={20} />}</span>
                <span className="today-routine-copy">
                  <em>{STATE_LABEL[state]}{minutes ? ` · ${minutes}분` : ""}</em>
                  <strong>{routineStep(step.slot).label}</strong>
                  <small>{step.detail}</small>
                </span>
                <Clock3 size={19} className="today-routine-go" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
