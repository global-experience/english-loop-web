"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, Play, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
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
}: {
  card: ContentProgressCard;
  onOpen: () => void;
  onContinue?: () => void;
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
      {onContinue && (
        <button className="content-record-continue" onClick={onContinue} aria-label={`${card.title} 학습 탭에서 이어하기`}>
          <Play size={16} fill="currentColor" />
        </button>
      )}
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
  const [view, setView] = useState<ContentListView>("recent");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ContentProgressCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
