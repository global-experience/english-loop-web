"use client";

import { CalendarPlus, ExternalLink, LoaderCircle, Play, Sparkles, Target, Timer } from "lucide-react";
import type { TodayData } from "@/lib/types";
import { dateLabelInSeoul, stepOpensCoach, targetExpressionCount, type TodayFocus } from "@/lib/todayPlan";

/**
 * The one card at the top of the Today tab. It answers "what now?" and nothing else:
 * which routine the clock is in, how long it takes, and a single primary action that
 * sits at the bottom so the thumb always lands in the same place.
 */
export function TodaySummary({
  today,
  focus,
  onStart,
  noPlan = false,
  creatingPlan = false,
  onCreatePlan,
}: {
  today: TodayData;
  focus: TodayFocus;
  onStart: () => void;
  /** The day has no routine yet, which happens on any day the night session did not plan. */
  noPlan?: boolean;
  creatingPlan?: boolean;
  onCreatePlan?: () => void;
}) {
  const dateLabel = dateLabelInSeoul(today.study_date);
  const expressionCount = targetExpressionCount(today);
  const opensCoach = stepOpensCoach(focus.step?.slot);
  const minutes = Math.max(1, focus.estimatedMinutes || focus.remainingMinutes || 1);

  return (
    <section className="today-summary" aria-label="오늘 요약">
      <div className="today-summary-top">
        <span className="pill light">{dateLabel}</span>
        <div
          className="progress-orbit today-summary-orbit"
          style={{ "--progress": `${today.progress_percent}%` } as React.CSSProperties}
          aria-label={`오늘 진행률 ${today.progress_percent}퍼센트`}
        >
          <strong>{today.progress_percent}</strong>
          <span>%</span>
        </div>
      </div>

      {noPlan ? (
        <div className="today-summary-copy">
          <p className="eyebrow">TODAY&apos;S ROUTINE</p>
          <h2>오늘 루틴이<br /><em>아직 없어요</em></h2>
          <p>4단계 루틴을 만들면 지금 시간대에 맞는 단계부터 바로 시작할 수 있어요. 아래 추천 영상과 복습은 지금도 쓸 수 있습니다.</p>
        </div>
      ) : focus.allDone || !focus.step ? (
        <div className="today-summary-copy">
          <p className="eyebrow">TODAY&apos;S ROUTINE</p>
          <h2>오늘 루틴을<br /><em>모두 마쳤어요</em></h2>
          <p>복습으로 마무리하거나, 피드에서 내일 학습할 영상을 미리 찜해두세요.</p>
        </div>
      ) : (
        <div className="today-summary-copy">
          <p className="eyebrow">NOW · {focus.step.label}</p>
          <h2>지금은<br /><em>{focus.step.label}</em></h2>
          <p>{focus.step.guidance}</p>
        </div>
      )}

      <dl className="today-summary-meta">
        <div>
          <dt><Timer size={13} /> 예상 시간</dt>
          <dd>{noPlan || focus.allDone ? "—" : `${minutes}분`}</dd>
        </div>
        <div>
          <dt><Target size={13} /> 목표 표현</dt>
          <dd>{noPlan ? "—" : `${expressionCount}개`}</dd>
        </div>
        <div>
          <dt><Sparkles size={13} /> 완료 단계</dt>
          <dd>{noPlan ? "0/4" : `${focus.completedCount}/4`}</dd>
        </div>
      </dl>

      {noPlan ? (
        <button
          className="primary-button today-start-button"
          onClick={() => onCreatePlan?.()}
          disabled={creatingPlan || !onCreatePlan}
        >
          {creatingPlan ? <LoaderCircle className="spin" size={18} /> : <CalendarPlus size={18} />}
          {creatingPlan ? "루틴을 만드는 중…" : "오늘 루틴 만들기"}
        </button>
      ) : (
        <button className="primary-button today-start-button" onClick={onStart} disabled={focus.allDone}>
          {opensCoach ? <ExternalLink size={18} /> : <Play size={18} fill="currentColor" />}
          {focus.allDone ? "오늘 루틴 완료" : opensCoach ? "음성 대화 열기" : "학습 시작"}
        </button>
      )}
    </section>
  );
}
