"use client";

import { useState } from "react";
import { BookOpen, Bus, Library, Mic2, RotateCcw, Youtube } from "lucide-react";
import type { TodayData } from "@/lib/types";
import { ListeningPlayer } from "./ListeningPlayer";
import { LunchSpeaking } from "./LunchSpeaking";
import { ContentLibrary } from "./ContentLibrary";
import { YouTubePractice } from "./YouTubePractice";

export type LearningMode = "morning" | "lunch" | "evening" | "library" | "youtube";

const modes = [
  { id: "morning" as const, label: "출근", Icon: Bus },
  { id: "lunch" as const, label: "점심", Icon: Mic2 },
  { id: "evening" as const, label: "퇴근", Icon: RotateCcw },
  { id: "library" as const, label: "콘텐츠", Icon: Library },
  { id: "youtube" as const, label: "YouTube", Icon: Youtube },
];

export function LearningView({ today, mode, setMode, refresh }: { today: TodayData; mode: LearningMode; setMode: (mode: LearningMode) => void; refresh: () => Promise<void> }) {
  const [modeDirection, setModeDirection] = useState<"forward" | "back">("forward");
  const plan = today.plan;
  const morning = plan?.activities.find((item) => item.slot === "MORNING_COMMUTE");
  const lunch = plan?.activities.find((item) => item.slot === "LUNCH");
  const evening = plan?.activities.find((item) => item.slot === "EVENING_COMMUTE");
  const switchMode = (nextMode: LearningMode) => {
    if (nextMode === mode) return;
    setModeDirection(modes.findIndex((item) => item.id === nextMode) > modes.findIndex((item) => item.id === mode) ? "forward" : "back");
    setMode(nextMode);
  };
  return <div className="view-stack"><header className="view-title"><p className="eyebrow">LEARN</p><h2>오늘 배운 것을<br/>단계마다 한 칸씩.</h2></header><div className="mode-tabs" role="tablist" aria-label="학습 모드">{modes.map(({ id, label, Icon }) => <button id={`learning-tab-${id}`} role="tab" aria-controls={`learning-panel-${id}`} aria-selected={mode === id} className={mode === id ? "active" : ""} key={id} onClick={() => switchMode(id)}><Icon size={17}/>{label}</button>)}</div>
    <div key={mode} id={`learning-panel-${mode}`} role="tabpanel" aria-labelledby={`learning-tab-${mode}`} className={`learning-mode-scene mode-scene-${modeDirection}`}>
      {!plan && <section className="empty-state"><BookOpen/><h2>오늘 계획이 없습니다.</h2><p>콘텐츠를 등록하고 오늘 계획을 먼저 만들어주세요.</p></section>}
      {plan && mode === "morning" && morning && <ListeningPlayer activity={morning} expressions={plan.target_expressions} title="MORNING · FIRST LISTEN" onComplete={refresh}/>} 
      {plan && mode === "lunch" && lunch && <LunchSpeaking activity={lunch} expressions={plan.target_expressions} topic={plan.primary_topic} onComplete={refresh}/>} 
      {plan && mode === "evening" && evening && <><div className="review-priority"><p className="eyebrow">EVENING PRIORITY</p><strong>출근 때 어려웠던 문장 → 점심에 못 쓴 표현 → 복습 기한이 지난 표현</strong></div><ListeningPlayer activity={evening} expressions={plan.target_expressions} title="EVENING · RETRIEVAL" onComplete={refresh}/></>} 
      {mode === "library" && <ContentLibrary/>}
      {mode === "youtube" && <YouTubePractice/>}
    </div>
  </div>;
}
