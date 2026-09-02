"use client";

import { ArrowUpRight, Check, Headphones, Mic2, Moon, RotateCcw } from "lucide-react";
import type { Activity } from "@/lib/types";
import { ROUTINE_STEPS, type RoutineSlot, type RoutineState } from "@/lib/todayPlan";

const ICONS = {
  MORNING_COMMUTE: Headphones,
  LUNCH: Mic2,
  EVENING_COMMUTE: RotateCcw,
  NIGHT_VOICE: Moon,
} as const;

const STATE_LABEL: Record<RoutineState, string> = {
  done: "완료",
  current: "지금",
  upcoming: "예정",
};

/**
 * The four steps of the day. Exactly one row is emphasised — the current one — so the
 * list reads as a sequence to walk rather than four equally loud choices.
 */
export function TodayRoutine({
  activities,
  states,
  onOpen,
}: {
  activities: Activity[];
  states: Record<RoutineSlot, RoutineState>;
  onOpen: (slot: RoutineSlot) => void;
}) {
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
          const Icon = ICONS[step.slot];
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
                <span className="today-routine-icon">
                  {state === "done" ? <Check size={20} /> : <Icon size={20} />}
                </span>
                <span className="today-routine-copy">
                  <em>{STATE_LABEL[state]}{minutes ? ` · ${minutes}분` : ""}</em>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
                <ArrowUpRight size={19} className="today-routine-go" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
