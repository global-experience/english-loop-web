"use client";

import { Clipboard, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import type { CoachHint as CoachHintData } from "@/lib/todayData";

/**
 * The AI coach line. It is deliberately advisory: a failed analysis request degrades
 * to the generic hint rather than surfacing an error, because this section must never
 * block the Today tab.
 */
export function CoachHint({
  hint,
  loading,
  sessionLabel,
  sessionDetail,
  onCopyStart,
  onOpenCoach,
}: {
  hint: CoachHintData | null;
  loading: boolean;
  sessionLabel: string;
  sessionDetail: string;
  onCopyStart: () => void;
  onOpenCoach: () => void;
}) {
  return (
    <section className="today-section today-coach" aria-label="AI 코치 안내">
      <div className="section-heading">
        <div><p className="eyebrow">AI COACH</p><h2>다음 행동 제안</h2></div>
        <Sparkles size={19} aria-hidden="true" />
      </div>

      <div className="today-coach-card">
        {loading && !hint ? (
          <p className="today-coach-loading" role="status" aria-live="polite">최근 학습 기록을 확인하고 있어요…</p>
        ) : (
          <>
            <strong>{hint?.headline || "오늘 루틴부터 시작해 보세요."}</strong>
            <p>{hint?.body || "한 단계를 마치면 다음 행동을 여기에서 제안해 드려요."}</p>
            {!!hint?.focusTags.length && (
              <ul className="today-coach-tags">
                {hint.focusTags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            )}
            {hint && !hint.personalised && (
              <small className="today-coach-note">아직 분석할 학습 기록이 없어 일반 안내를 보여드리고 있어요.</small>
            )}
          </>
        )}
      </div>

      <div className="today-coach-session">
        <div>
          <MessageCircle size={16} aria-hidden="true" />
          <strong>{sessionLabel}</strong>
          <span>{sessionDetail}</span>
        </div>
        <div className="today-coach-actions">
          <button type="button" className="secondary-button" onClick={onCopyStart}>
            <Clipboard size={15} /> 시작 문구 복사
          </button>
          <button type="button" className="secondary-button" onClick={onOpenCoach}>
            <ExternalLink size={15} /> 영어 코치 열기
          </button>
        </div>
      </div>
    </section>
  );
}
