"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Clapperboard, Filter, LoaderCircle, Mic, Play, Quote, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  durationLabel,
  type LibraryKind,
  type LibraryResponse,
  type SavedItem,
  type SavedVideoRecord,
  type SpeechAttemptRecord,
} from "@/lib/reviewTypes";
import { useInfiniteLibraryQuery, useInvalidateReviewQueries } from "@/lib/useReviewQuery";
import { SubtitlePlayerSheet, type SubtitlePlayerTarget } from "@/components/SubtitlePlayerSheet";
import { RecordingCard } from "./RecordingCard";
import { SavedItemCard } from "./SavedItemCard";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";
import { PanelEmpty, PanelError, PanelLoading } from "./ReviewStates";

const KINDS: Array<{ key: LibraryKind; label: string }> = [
  { key: "words", label: "전체 단어" },
  { key: "sentences", label: "전체 문장" },
  { key: "videos", label: "찜한 영상" },
  { key: "recordings", label: "대표 녹음" },
];

const SORTS = [
  { key: "recent", label: "최근 저장" },
  { key: "oldest", label: "오래된 순" },
  { key: "alphabetical", label: "알파벳" },
  { key: "stage", label: "학습 단계" },
];

import { SafeQueryClientProvider } from "@/app/providers";

function LibraryPanelInner({
  active,
  openLearning,
}: {
  active: boolean;
  openLearning?: (target: { contentId: string; transcriptLineId?: string | null; title?: string | null; youtubeUrl?: string | null; sourceLabel?: string | null }) => void;
}) {
  const [kind, setKind] = useState<LibraryKind>("words");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState("recent");
  const [removingVideoId, setRemovingVideoId] = useState("");
  const [actionError, setActionError] = useState("");
  const [playerTarget, setPlayerTarget] = useState<SubtitlePlayerTarget | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteLibraryQuery({
    kind,
    search: query,
    source,
    level,
    sort,
    active,
  });

  const { invalidateLibrary } = useInvalidateReviewQueries();

  const rawItems = useMemo(() => {
    if (!data?.pages) return [] as Array<SavedItem | SavedVideoRecord | SpeechAttemptRecord>;
    const list: Array<SavedItem | SavedVideoRecord | SpeechAttemptRecord> = [];
    for (const page of data.pages) {
      if (Array.isArray(page.items)) {
        for (const item of page.items) {
          list.push(item);
        }
      }
    }
    return list;
  }, [data]);

  const [items, setItems] = useState<Array<SavedItem | SavedVideoRecord | SpeechAttemptRecord>>([]);

  useEffect(() => {
    setItems(rawItems);
  }, [rawItems]);

  const replaceItem = useCallback(
    (next: SavedItem) => {
      setItems((current) =>
        (current as SavedItem[]).map((row) =>
          (row as SavedItem).expression_progress_id === next.expression_progress_id ? next : row
        )
      );
    },
    []
  );

  const dropItem = useCallback(
    (matches: (row: SavedItem | SavedVideoRecord | SpeechAttemptRecord) => boolean) => {
      setItems((current) => current.filter((row) => !matches(row)));
      invalidateLibrary();
    },
    [invalidateLibrary]
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  async function unsaveVideo(video: SavedVideoRecord) {
    setRemovingVideoId(video.id);
    setActionError("");
    try {
      await apiFetch(`/api/review/saved-videos/${video.id}`, { method: "DELETE" });
      dropItem((row) => (row as SavedVideoRecord).id === video.id);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "찜을 해제하지 못했습니다.");
    } finally {
      setRemovingVideoId("");
    }
  }

  const firstPage = data?.pages[0];
  const showWordFilters = kind === "words" || kind === "sentences";
  const showsSelectedKind = !firstPage?.kind || firstPage.kind === kind || isLoading;

  return (
    <div className="review-panel">
      <div className="review-filter-bar flex-col align-stretch">
        <div className="segmented library-kind-switch" role="tablist" aria-label="보관함 분류">
          {KINDS.map((option) => (
            <button
              key={option.key}
              role="tab"
              aria-selected={kind === option.key}
              className={kind === option.key ? "active" : ""}
              onClick={() => {
                setKind(option.key);
                setSearch("");
                setQuery("");
                setSource("");
                setLevel("");
              }}
            >
              {option.label}
              {option.key === "words" && !!firstPage?.counts?.words && <small>({firstPage.counts.words})</small>}
              {option.key === "sentences" && !!firstPage?.counts?.sentences && <small>({firstPage.counts.sentences})</small>}
            </button>
          ))}
        </div>

        <label className="review-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">보관함 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              const next = event.target.value;
              setSearch(next);
              if (!next.trim()) setQuery("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setQuery(search.trim());
                (event.target as HTMLElement).blur();
              }
            }}
            placeholder={kind === "videos" ? "영상 제목·채널 검색" : "단어·문장·영상 검색"}
            enterKeyHint="search"
          />
          {(search || search.trim()) && (
            <div className="review-search-actions">
              {search && (
                <button
                  type="button"
                  className="review-search-clear"
                  onClick={() => {
                    setSearch("");
                    setQuery("");
                  }}
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
              {search.trim() && (
                <button
                  type="button"
                  className="review-search-submit"
                  onClick={() => setQuery(search.trim())}
                  aria-label="검색 실행"
                  title="검색"
                >
                  <Search size={14} />
                </button>
              )}
            </div>
          )}
        </label>
      </div>

      {showWordFilters && (
        <div className="library-filters" aria-label="보관함 필터">
          <span className="library-filter-icon" aria-hidden="true"><Filter size={14} /></span>
          <label>
            <span className="sr-only">출처</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">전체 출처</option>
              {(firstPage?.sources || []).map((option) => (
                <option key={option.content_id} value={option.content_id}>{option.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">난이도</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">전체 난이도</option>
              {(firstPage?.levels || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">저장일 정렬</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {isLoading && <PanelLoading label="보관함을 불러오고 있어요." />}
      {isError && <PanelError message={error instanceof Error ? error.message : "보관함을 불러오지 못했습니다."} onRetry={() => void refetch()} />}
      {actionError && <p className="review-inline-error" role="alert">{actionError}</p>}

      {!isError && !isLoading && showsSelectedKind && !items.length && (
        <PanelEmpty
          icon={kind === "videos" ? <Clapperboard size={24} /> : kind === "recordings" ? <Mic size={24} /> : kind === "sentences" ? <Quote size={24} /> : <Bookmark size={24} />}
          title={query || source || level ? "조건에 맞는 항목이 없어요." : "아직 보관된 항목이 없어요."}
          description={
            kind === "videos"
              ? "피드에서 영상을 찜하면 학습용 자막이 준비되고 이곳에 모입니다."
              : kind === "recordings"
                ? "문장을 따라 말하고 ‘복습에 고정’을 누르면 대표 녹음으로 남습니다."
                : "학습 탭에서 자막의 단어나 문장을 저장해 보세요."
          }
        />
      )}

      {!isError && showsSelectedKind && !!items.length && (kind === "words" || kind === "sentences") && (
        <div key={kind} className="saved-item-list review-panel-scene">
          {(items as SavedItem[]).map((item, index) => (
            <SavedItemCard
              key={`${item.expression_progress_id || item.expression_id || 'item'}-${index}`}
              item={item}
              onOpenAudio={() => setPlayerTarget({
                text: item.canonical_text,
                koreanText: item.korean_meaning,
                contentId: item.content_id,
                transcriptLineId: item.transcript_line_id,
                title: item.content_title,
              })}
              onOpenSource={item.content_id && openLearning
                ? () => openLearning({
                  contentId: item.content_id!,
                  transcriptLineId: item.transcript_line_id,
                  title: item.content_title,
                  sourceLabel: "보관함",
                })
                : undefined}
              onEdited={replaceItem}
              onDeleted={(progressId) => dropItem((row) => (row as SavedItem).expression_progress_id === progressId)}
            />
          ))}

          {hasNextPage && (
            <div key="sentinel" ref={sentinelRef} className="review-infinite-sentinel" style={{ padding: "16px", textAlign: "center" }}>
              {isFetchingNextPage && <LoaderCircle size={20} className="spin" aria-label="10개씩 더 불러오는 중" />}
            </div>
          )}
        </div>
      )}

      {!isError && showsSelectedKind && !!items.length && kind === "videos" && (
        <div key={kind} className="library-video-list review-panel-scene">
          {(items as SavedVideoRecord[]).map((video, index) => (
            <article className="library-video-card" key={`${video.id || video.content_id || 'video'}-${index}`}>
              <span className="content-record-thumb">
                {video.thumbnail_url
                  ? <img src={video.thumbnail_url} alt="" loading="lazy" />
                  : <Clapperboard size={22} aria-hidden="true" />}
              </span>
              <div>
                <em>{video.channel_title}</em>
                <strong>{video.title}</strong>
                <small>
                  {durationLabel(video.duration_seconds)} ·{" "}
                  {video.status === "READY" ? "학습 준비됨" : video.status === "PROCESSING" ? "자막 준비 중" : "자막 준비 실패"}
                </small>
                {video.error_message && <p className="library-video-error">{video.error_message}</p>}
              </div>
              <div className="content-record-actions">
                {openLearning && (
                  <button
                    type="button"
                    className="content-record-continue"
                    onClick={() => openLearning({
                      contentId: video.learning_content_id || video.feed_video_id,
                      title: video.title,
                      youtubeUrl: video.youtube_url,
                      sourceLabel: `찜한 영상 · ${video.channel_title}`,
                    })}
                    disabled={video.status === "FAILED"}
                    aria-label={`${video.title} 학습 열기`}
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                )}
                <ConfirmDeleteButton
                  label={`${video.title} 찜 해제`}
                  confirmLabel="찜을 해제할까요? 학습 기록은 남습니다."
                  busy={removingVideoId === video.id}
                  compact
                  onDelete={() => void unsaveVideo(video)}
                />
              </div>
            </article>
          ))}

          {hasNextPage && (
            <div key="sentinel" ref={sentinelRef} className="review-infinite-sentinel" style={{ padding: "16px", textAlign: "center" }}>
              {isFetchingNextPage && <LoaderCircle size={20} className="spin" aria-label="10개씩 더 불러오는 중" />}
            </div>
          )}
        </div>
      )}

      {!isError && showsSelectedKind && !!items.length && kind === "recordings" && (
        <div key={kind} className="recording-list review-panel-scene">
          {(items as SpeechAttemptRecord[]).map((recording, index) => (
            <RecordingCard
              key={`${recording.id || 'rec'}-${index}`}
              recording={recording}
              showContentTitle
              onPlayOriginal={() => setPlayerTarget({
                text: recording.transcript_line_text || recording.reference_text,
                contentId: recording.content_id,
                transcriptLineId: recording.transcript_line_id,
                title: recording.content_title,
              })}
              onRetry={recording.content_id && openLearning
                ? () => openLearning({
                  contentId: recording.content_id!,
                  transcriptLineId: recording.transcript_line_id,
                  title: recording.content_title,
                  sourceLabel: "보관함 · 다시 녹음",
                })
                : undefined}
              onPinChanged={() => invalidateLibrary()}
              onDeleted={(recordingId) => dropItem((row) => (row as SpeechAttemptRecord).id === recordingId)}
            />
          ))}

          {hasNextPage && (
            <div key="sentinel" ref={sentinelRef} className="review-infinite-sentinel" style={{ padding: "16px", textAlign: "center" }}>
              {isFetchingNextPage && <LoaderCircle size={20} className="spin" aria-label="10개씩 더 불러오는 중" />}
            </div>
          )}
        </div>
      )}

      <SubtitlePlayerSheet
        open={Boolean(playerTarget)}
        target={playerTarget}
        onClose={() => setPlayerTarget(null)}
        onOpenFullLearning={playerTarget?.contentId && openLearning ? () => openLearning({ contentId: playerTarget.contentId!, transcriptLineId: playerTarget.transcriptLineId, title: playerTarget.title }) : undefined}
      />
    </div>
  );
}

export function LibraryPanel(props: {
  active: boolean;
  openLearning?: (target: { contentId: string; transcriptLineId?: string | null; title?: string | null; youtubeUrl?: string | null; sourceLabel?: string | null }) => void;
}) {
  return (
    <SafeQueryClientProvider>
      <LibraryPanelInner {...props} />
    </SafeQueryClientProvider>
  );
}
