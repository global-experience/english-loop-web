"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clapperboard, LoaderCircle, Play, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePortalReady } from "@/lib/useMobileUi";
import {
  durationLabel,
  relativeDayLabel,
  type ContentListResponse,
  type ContentListView,
  type ContentProgressCard,
} from "@/lib/reviewTypes";
import { PanelEmpty, PanelError, PanelLoading } from "./ReviewStates";

const VIEWS: Array<{ key: ContentListView; label: string }> = [
  { key: "recent", label: "최근 학습" },
  { key: "needs_review", label: "복습 필요" },
  { key: "most_saved", label: "저장 많음" },
];

export function ContentCard({
  card,
  onOpen,
  onContinue,
  onDelete,
  deleting = false,
}: {
  card: ContentProgressCard;
  onOpen: () => void;
  onContinue?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <article className="content-record-card">
      <button className="content-record-main" onClick={onOpen} aria-label={`${card.title} 학습 기록 열기`}>
        <span className="content-record-thumb">
          {card.thumbnail_url
            ? <img src={card.thumbnail_url} alt="" loading="lazy" />
            : <Clapperboard size={22} aria-hidden="true" />}
          {card.due_count > 0 && <b className="content-record-due">복습 {card.due_count}</b>}
        </span>
        <div className="content-record-copy">
          <em>{card.source_label}</em>
          <strong>{card.title}</strong>
          <small>{relativeDayLabel(card.last_studied_at)} · {durationLabel(card.duration_seconds)}</small>
          <div className="content-record-progress" aria-label={`진행률 ${card.progress_percent}퍼센트`}>
            <i style={{ width: `${Math.max(2, card.progress_percent)}%` }} />
            <span>{card.progress_percent}%</span>
          </div>
          <ul className="content-record-stats">
            <li><b>{card.saved_item_count}</b> 저장 표현</li>
            <li><b>{card.retry_count}</b> 다시 말할 문장</li>
            <li><b>{card.speech_attempt_count}</b> 녹음</li>
          </ul>
        </div>
      </button>
      <div className="content-record-actions">
        {onContinue && (
          <button className="content-record-continue" onClick={onContinue} aria-label={`${card.title} 학습 탭에서 이어하기`}>
            <Play size={16} fill="currentColor" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="content-record-delete"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            aria-label={`${card.title} 학습 기록 삭제`}
            title="학습 기록 삭제"
          >
            {deleting ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
          </button>
        )}
      </div>
    </article>
  );
}

export function ContentRecordsPanel({
  active,
  onOpenDetail,
  onContinueLearning,
}: {
  active: boolean;
  onOpenDetail: (card: ContentProgressCard) => void;
  onContinueLearning?: (card: ContentProgressCard) => void;
}) {
  const portalReady = usePortalReady();
  const [view, setView] = useState<ContentListView>("recent");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ContentProgressCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ContentProgressCard | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (nextView: ContentListView, nextQuery: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: nextView });
      if (nextQuery.trim()) params.set("search", nextQuery.trim());
      const data = await apiFetch<ContentListResponse>(`/api/review/contents?${params.toString()}`);
      setItems(data.items);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "영상별 학습 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load(view, query);
  }, [active, load, query, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function deleteCard(card: ContentProgressCard) {
    setDeletingId(card.content_id);
    setActionError("");
    try {
      await apiFetch(`/api/review/contents/${encodeURIComponent(card.content_id)}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.content_id !== card.content_id));
      setDeleteTarget(null);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "학습 기록을 삭제하지 못했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  const emptyCopy = useMemo(() => {
    if (query.trim()) return { title: "검색 결과가 없어요.", description: "제목이나 채널명의 일부만 입력해도 찾을 수 있어요." };
    if (view === "needs_review") return { title: "복습이 필요한 영상이 없어요.", description: "다시 말할 문장이나 복습 예정 표현이 생기면 이 목록에 나타납니다." };
    if (view === "most_saved") return { title: "아직 저장한 표현이 없어요.", description: "학습 탭에서 자막의 단어나 문장을 저장하면 영상별로 모입니다." };
    return { title: "학습 기록이 아직 없어요.", description: "피드에서 영상을 찜하거나 학습 탭에서 콘텐츠를 열면 기록이 쌓입니다." };
  }, [query, view]);

  return (
    <div className="review-panel">
      <div className="review-filter-bar">
        <label className="review-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">영상 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="영상 제목·채널 검색"
            enterKeyHint="search"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          )}
        </label>
        <div className="segmented review-view-switch" role="tablist" aria-label="영상 기록 정렬">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              role="tab"
              aria-selected={view === option.key}
              className={view === option.key ? "active" : ""}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !loaded && <PanelLoading label="영상별 학습 기록을 불러오고 있어요." />}
      {error && <PanelError message={error} onRetry={() => void load(view, query)} />}
      {actionError && <p className="review-inline-error" role="alert">{actionError}</p>}
      {!error && loaded && !items.length && (
        <PanelEmpty icon={<Clapperboard size={26} />} title={emptyCopy.title} description={emptyCopy.description} />
      )}
      {!error && !!items.length && (
        <div className={`content-record-list ${loading ? "refreshing" : ""}`}>
          {items.map((card) => (
            <ContentCard
              key={card.content_id}
              card={card}
              onOpen={() => onOpenDetail(card)}
              onContinue={onContinueLearning ? () => onContinueLearning(card) : undefined}
              onDelete={() => setDeleteTarget(card)}
              deleting={deletingId === card.content_id}
            />
          ))}
        </div>
      )}

      {deleteTarget && portalReady && createPortal(
        <div
          className="confirm-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && !deletingId && setDeleteTarget(null)}
        >
          <section className="confirm-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="content-delete-title">
            <TriangleAlert size={24} />
            <h3 id="content-delete-title">이 영상의 학습 기록을 삭제할까요?</h3>
            <p>‘{deleteTarget.title}’ 영상에서 저장한 단어·문장, 다시 말할 문장, 녹음 기록이 모두 삭제됩니다.</p>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingId)}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-button danger-action"
                onClick={() => void deleteCard(deleteTarget)}
                disabled={Boolean(deletingId)}
              >
                {deletingId === deleteTarget.content_id ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} 삭제
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
