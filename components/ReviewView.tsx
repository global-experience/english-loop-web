"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  REVIEW_TABS,
  type ContentProgressCard,
  type ReviewGradeResponse,
  type ReviewItem,
  type ReviewQueueResponse,
  type ReviewQueueSummary,
  type ReviewTabKey,
} from "@/lib/reviewTypes";
import { ContentDetailPanel } from "./review/ContentDetailPanel";
import { ContentRecordsPanel } from "./review/ContentRecordsPanel";
import { LibraryPanel } from "./review/LibraryPanel";
import { ReviewQueuePanel } from "./review/ReviewQueuePanel";

/** Where the review tab hands control back to the learning tab. */
export type ReviewLearningTarget = {
  contentId: string;
  transcriptLineId?: string | null;
  title?: string | null;
  youtubeUrl?: string | null;
  sourceLabel?: string | null;
};

export function ReviewView({
  active = true,
  openLearning,
}: {
  active?: boolean;
  openLearning?: (target: ReviewLearningTarget) => void;
}) {
  const [tab, setTab] = useState<ReviewTabKey>("today");
  const [detailCard, setDetailCard] = useState<ContentProgressCard | null>(null);
  const [summary, setSummary] = useState<ReviewQueueSummary | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<ReviewQueueResponse>("/api/review/queue?limit=40");
      setSummary(data.summary);
      setItems(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "복습 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const onGraded = useCallback((itemId: string, response: ReviewGradeResponse) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSummary((current) => {
      if (!current) return current;
      const total = Math.max(0, current.total_count - 1);
      const done = response.completed_today;
      return {
        ...current,
        total_count: total,
        completed_today: done,
        progress_percent: total + done ? Math.round((done / (total + done)) * 100) : 100,
      };
    });
  }, []);

  const jumpToLearning = useCallback((target: ReviewLearningTarget) => {
    openLearning?.(target);
  }, [openLearning]);

  const openFromQueue = useCallback((item: ReviewItem) => {
    if (!item.content_id) return;
    jumpToLearning({
      contentId: item.content_id,
      transcriptLineId: item.transcript_line_id,
      title: item.content_title,
      sourceLabel: `복습 · ${item.kind_label}`,
    });
  }, [jumpToLearning]);

  const openFromCard = useCallback((card: ContentProgressCard, transcriptLineId?: string | null) => {
    jumpToLearning({
      contentId: card.content_id,
      transcriptLineId: transcriptLineId || null,
      title: card.title,
      youtubeUrl: card.source_type === "YOUTUBE" ? card.source_url : null,
      sourceLabel: `복습 · ${card.source_label}`,
    });
  }, [jumpToLearning]);

  const dueBadge = summary?.total_count || 0;

  return (
    <div className="view-stack review-view">
      <header className="view-title">
        <p className="eyebrow">REVIEW</p>
        <h2>기억이 흐려지기 전에<br />한 번 더 꺼내기.</h2>
        <span>
          {dueBadge
            ? `오늘 복습할 항목 ${dueBadge}개 · 예상 ${summary?.estimated_minutes || 0}분`
            : "오늘 예정된 복습을 모두 마쳤어요."}
        </span>
      </header>

      <nav className="segmented review-tab-switch" role="tablist" aria-label="복습 영역">
        {REVIEW_TABS.map((option) => (
          <button
            key={option.key}
            id={`review-subtab-${option.key}`}
            role="tab"
            aria-selected={tab === option.key}
            aria-controls={`review-subpanel-${option.key}`}
            className={tab === option.key ? "active" : ""}
            onClick={() => { setTab(option.key); if (option.key !== "contents") setDetailCard(null); }}
          >
            {option.label}
            {option.key === "today" && dueBadge ? <b>{dueBadge}</b> : null}
          </button>
        ))}
      </nav>

      <section
        id="review-subpanel-today"
        role="tabpanel"
        aria-labelledby="review-subtab-today"
        hidden={tab !== "today"}
      >
        {tab === "today" && (
          <ReviewQueuePanel
            summary={summary}
            items={items}
            loading={loading}
            error={error}
            onRetry={() => void loadQueue()}
            onGraded={onGraded}
            openLearning={openLearning ? openFromQueue : undefined}
          />
        )}
      </section>

      <section
        id="review-subpanel-contents"
        role="tabpanel"
        aria-labelledby="review-subtab-contents"
        hidden={tab !== "contents"}
      >
        {tab === "contents" && (detailCard ? (
          <ContentDetailPanel
            card={detailCard}
            onBack={() => setDetailCard(null)}
            openLearning={openLearning
              ? ({ transcriptLineId, card }) => openFromCard(card, transcriptLineId)
              : undefined}
          />
        ) : (
          <ContentRecordsPanel
            active={active && tab === "contents"}
            onOpenDetail={setDetailCard}
            onContinueLearning={openLearning ? (card) => openFromCard(card) : undefined}
          />
        ))}
      </section>

      <section
        id="review-subpanel-library"
        role="tabpanel"
        aria-labelledby="review-subtab-library"
        hidden={tab !== "library"}
      >
        {tab === "library" && (
          <LibraryPanel active={active && tab === "library"} openLearning={openLearning ? jumpToLearning : undefined} />
        )}
      </section>
    </div>
  );
}
