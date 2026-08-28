"use client";

import { ArrowUpRight, Check, Clipboard, ExternalLink, Headphones, MessageCircle, Mic2, Moon, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import type { TodayData, User } from "@/lib/types";
import type { LearningMode } from "./LearningView";

const activityMeta = {
  MORNING_COMMUTE: { label: "출근 리스닝", detail: "대본 없이 듣고 입 모양으로 따라 하기", Icon: Headphones, mode: "morning" as LearningMode },
  LUNCH: { label: "점심 스피킹", detail: "핵심 표현을 준비하고 실제로 말하기", Icon: Mic2, mode: "lunch" as LearningMode },
  EVENING_COMMUTE: { label: "퇴근 복습", detail: "어려웠던 문장을 대본 없이 다시 듣기", Icon: RotateCcw, mode: "evening" as LearningMode },
  NIGHT_VOICE: { label: "ChatGPT 음성 대화", detail: "목표 표현을 실제 대화에서 꺼내 쓰기", Icon: Moon, mode: "lunch" as LearningMode },
};

const sessionCopy = {
  NOT_STARTED: ["학습 데이터 준비 전", "수업 시작 전 오늘 루틴을 확인하세요."],
  STARTED: ["음성 수업 진행 중", "음성 모드 종료 후 저장 문구를 입력하세요."],
  AWAITING_REPORT: ["분석 저장 대기", "ChatGPT 채팅에서 ‘오늘 수업 저장’을 입력하세요."],
  COMPLETED: ["저장 완료", "오늘의 분석이 리포트에 반영됐어요."],
  FAILED: ["저장 실패", "ChatGPT 채팅에서 저장을 다시 요청하세요."],
} as const;

type Props = {
  today: TodayData;
  user: User;
  refresh: () => Promise<void>;
  openLearning: (mode: LearningMode) => void;
};

export function TodayView({ today, user, refresh, openLearning }: Props) {
  const plan = today.plan;
  const [sessionLabel, sessionDetail] = sessionCopy[today.coach_session.status];
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" }).format(new Date(`${today.study_date}T12:00:00+09:00`));
  const staleSession = today.coach_session.status === "STARTED" && today.coach_session.started_at
    ? Date.now() - new Date(today.coach_session.started_at).getTime() > 45 * 60 * 1000
    : false;

  async function copyStart() {
    await navigator.clipboard.writeText("오늘 수업 시작");
  }

  function openCoach() {
    if (!user.custom_gpt_url) {
      alert("설정에서 Custom GPT URL을 먼저 등록해주세요.");
      return;
    }
    window.open(user.custom_gpt_url, "_blank", "noopener,noreferrer");
  }

  if (!plan) {
    return <section className="empty-state"><span className="eyebrow">{dateLabel}</span><h2>오늘 계획이 아직 없어요.</h2><p>샘플 시드를 다시 실행하거나 콘텐츠와 목표 표현을 선택해 계획을 만들어주세요.</p></section>;
  }

  return (
    <div className="view-stack">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="pill light">{dateLabel}</span>
          <h2>오늘은 표현을<br/><em>꺼내 쓰는 날</em></h2>
          <p>{plan.daily_goal_ko}</p>
        </div>
        <div className="progress-orbit" style={{ "--progress": `${today.progress_percent}%` } as React.CSSProperties} aria-label={`오늘 진행률 ${today.progress_percent}퍼센트`}><strong>{today.progress_percent}</strong><span>%</span></div>
      </section>

      <section className="focus-grid">
        <article className="focus-card coral">
          <p className="eyebrow">TODAY&apos;S FOCUS</p>
          <h3>{plan.target_expressions[0]?.canonical_text || plan.primary_topic}</h3>
          <p>{plan.target_expressions.length}개 핵심 표현 · 취약점 {plan.weakness_categories.join(", ") || "기록 전"}</p>
        </article>
        <article className={`focus-card ink session-${today.coach_session.status.toLowerCase()}`}>
          <MessageCircle size={20}/><strong>{sessionLabel}</strong><span>{sessionDetail}</span>
          <button onClick={() => void copyStart()}>시작 문구 복사 <Clipboard size={16}/></button>
        </article>
      </section>

      {staleSession && <div className="warning-card" role="status"><TriangleAlert size={20}/><p><strong>음성 수업 결과가 아직 저장되지 않았습니다.</strong><br/>ChatGPT 채팅에서 음성 모드를 종료한 뒤 “오늘 수업 저장”을 입력해주세요.</p></div>}

      <section className="expression-strip" aria-label="오늘의 핵심 표현">
        <div className="section-heading"><div><p className="eyebrow">TARGET LANGUAGE</p><h2>오늘의 핵심 표현</h2></div><span>최대 5개</span></div>
        <div className="expression-scroll">
          {plan.target_expressions.map((expression, index) => <article className="expression-chip" key={expression.id}><span>0{index + 1}</span><strong>{expression.canonical_text}</strong><small>{expression.current_stage.replaceAll("_", " ")}</small></article>)}
        </div>
      </section>

      <section className="routine-section">
        <div className="section-heading"><div><p className="eyebrow">YOUR DAY</p><h2>오늘의 학습 루틴</h2></div><span>복습 {today.review_due_count}개 대기</span></div>
        <div className="routine-list">
          {plan.activities.map((activity, index) => {
            const meta = activityMeta[activity.slot];
            const done = activity.status === "COMPLETED";
            const Icon = meta.Icon;
            return <article className={`routine-row ${done ? "done" : ""}`} key={activity.id}>
              <span className="step-number">0{index + 1}</span>
              <span className="routine-icon">{done ? <Check size={22}/> : <Icon size={22}/>}</span>
              <div><p>{activity.actual_minutes}/{activity.planned_minutes} MIN</p><h3>{meta.label}</h3><span>{meta.detail}</span></div>
              <button aria-label={`${meta.label} 열기`} onClick={() => activity.slot === "NIGHT_VOICE" ? openCoach() : openLearning(meta.mode)}><ArrowUpRight size={20}/></button>
            </article>;
          })}
        </div>
      </section>

      <section className="coach-actions">
        <div><p className="eyebrow">CHATGPT VOICE COACH</p><h2>밤 수업 연결</h2><p>Action은 텍스트에서 시작·저장할 때만 호출됩니다.</p></div>
        <div className="button-grid">
          <button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={17}/> 준비 상태 확인</button>
          <button className="secondary-button" onClick={() => void copyStart()}><Clipboard size={17}/> 시작 문구 복사</button>
          <button className="primary-button" onClick={openCoach}><ExternalLink size={17}/> 영어 코치 열기</button>
          <button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={17}/> 분석 결과 새로고침</button>
        </div>
      </section>
    </div>
  );
}

