"use client";

import { ArrowRight, RefreshCw, RotateCcw } from "lucide-react";
import type { TodayReviewSummary } from "@/lib/todayData";

/**
 * A compact strip, not a card: three numbers and one action that jumps straight into
 * today's review queue.
 */
export function TodayReviewStrip({
  summary,
  loading,
  error,
  onRetry,
  onStartReview,
}: {
  summary: TodayReviewSummary | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onStartReview: () => void;
}) {
  return (
    <section className="today-section" aria-label="오늘의 복습">
      <div className="section-heading">
        <div><p className="eyebrow">SPACED REVIEW</p><h2>오늘의 복습</h2></div>
        <RotateCcw size={19} aria-hidden="true" />
      </div>

      {loading && !summary && (
        <div className="today-review-strip loading" role="status" aria-live="polite">
          복습 큐를 확인하고 있어요…
        </div>
      )}

      {!!error && !summary && (
        <div className="today-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" className="text-button" onClick={onRetry}><RefreshCw size={14} /> 다시 시도</button>
        </div>
      )}

      {summary && (
        summary.total_count ? (
          <div className="today-review-strip">
            <dl>
              <div>
                <dt>복습할 표현</dt>
                <dd>{summary.total_count}<span>개</span></dd>
              </div>
              <div>
                <dt>예상 시간</dt>
                <dd>{summary.estimated_minutes}<span>분</span></dd>
              </div>
              <div>
                <dt>다시 말할 문장</dt>
                <dd>{summary.speakAgainCount}<span>개</span></dd>
              </div>
            </dl>
            <button className="primary-button today-review-button" onClick={onStartReview}>
              복습 시작 <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <p className="muted-copy today-empty-line">
            지금 복습할 항목이 없어요. 학습 중 표현을 저장하면 망각곡선에 맞춰 다시 올라옵니다.
          </p>
        )
      )}
    </section>
  );
}
