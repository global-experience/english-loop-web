"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Clapperboard, Filter, Mic, Play, Quote, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  durationLabel,
  type LibraryKind,
  type LibraryResponse,
  type SavedItem,
  type SavedVideoRecord,
  type SpeechAttemptRecord,
} from "@/lib/reviewTypes";
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

export function LibraryPanel({
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
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [removingVideoId, setRemovingVideoId] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ kind, sort });
      if (query.trim()) params.set("search", query.trim());
      if (source) params.set("source", source);
      if (level) params.set("level", level);
      setData(await apiFetch<LibraryResponse>(`/api/review/library?${params.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "보관함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [kind, level, query, sort, source]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const replaceItem = useCallback((next: SavedItem) => {
    setData((current) => current && ({
      ...current,
      items: (current.items as SavedItem[]).map((row) =>
        row.expression_progress_id === next.expression_progress_id ? next : row
      ),
    }));
  }, []);

  const dropItem = useCallback((matches: (row: SavedItem | SavedVideoRecord | SpeechAttemptRecord) => boolean, countKey?: "words" | "sentences") => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        items: (current.items as Array<SavedItem | SavedVideoRecord | SpeechAttemptRecord>).filter((row) => !matches(row)) as typeof current.items,
        counts: countKey
          ? { ...current.counts, [countKey]: Math.max(0, current.counts[countKey] - 1) }
          : current.counts,
      };
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  const showWordFilters = kind === "words" || kind === "sentences";
  // `data` still holds the previous kind's rows while a new kind is loading, and the
  // four kinds have completely different row shapes. Only render rows that actually
  // belong to the selected kind, otherwise the cast below reads missing fields.
  const showsSelectedKind = data?.kind === kind;
  const items = showsSelectedKind ? data.items : [];
  const switching = !showsSelectedKind;

  return (
    <div className="review-panel library-panel">
      <div className="segmented library-kind-switch" role="tablist" aria-label="보관함 분류">
        {KINDS.map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={kind === option.key}
            className={kind === option.key ? "active" : ""}
            onClick={() => setKind(option.key)}
          >
            {option.label}
            {option.key === "words" && data ? <b>{data.counts.words}</b> : null}
            {option.key === "sentences" && data ? <b>{data.counts.sentences}</b> : null}
          </button>
        ))}
      </div>

      <div className="review-filter-bar">
        <label className="review-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">보관함 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={kind === "videos" ? "영상 제목·채널 검색" : "단어·문장·영상 검색"}
            enterKeyHint="search"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="검색어 지우기">
              <X size={15} />
            </button>
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
              {(data?.sources || []).map((option) => (
                <option key={option.content_id} value={option.content_id}>{option.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">난이도</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">전체 난이도</option>
              {(data?.levels || []).map((option) => <option key={option} value={option}>{option}</option>)}
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

      {!error && (loading || switching) && <PanelLoading label="보관함을 불러오고 있어요." />}
      {error && <PanelError message={error} onRetry={() => void load()} />}
      {actionError && <p className="review-inline-error" role="alert">{actionError}</p>}

      {!error && !loading && showsSelectedKind && !items.length && (
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

      {!error && showsSelectedKind && !!items.length && (kind === "words" || kind === "sentences") && (
        <div className="saved-item-list">
          {(items as SavedItem[]).map((item) => (
            <SavedItemCard
              key={item.expression_progress_id}
              item={item}
              onOpenSource={item.content_id && openLearning
                ? () => openLearning({
                    contentId: item.content_id!,
                    transcriptLineId: item.transcript_line_id,
                    title: item.content_title,
                    sourceLabel: "보관함",
                  })
                : undefined}
              onEdited={replaceItem}
              onDeleted={(progressId) => dropItem(
                (row) => (row as SavedItem).expression_progress_id === progressId,
                kind === "sentences" ? "sentences" : "words",
              )}
            />
          ))}
        </div>
      )}

      {!error && showsSelectedKind && !!items.length && kind === "videos" && (
        <div className="library-video-list">
          {(items as SavedVideoRecord[]).map((video) => (
            <article className="library-video-card" key={video.id}>
              <span className="content-record-thumb">
                <img src={video.thumbnail_url} alt="" loading="lazy" />
              </span>
              <div>
                <em>{video.channel_title}</em>
                <strong>{video.title}</strong>
                <small>
                  {durationLabel(video.duration_seconds)} ·{" "}
                  {video.status === "READY" ? "학습 준비됨" : video.status === "PROCESSING" ? "자막 준비 중" : "자막 준비 실패"}
                </small>
                {video.error_message && <p className="library-video-error">{video.error_message}</p>}
                <div className="library-video-actions">
                  <ConfirmDeleteButton
                    label={`${video.title} 찜 해제`}
                    confirmLabel="찜을 해제할까요? 학습 기록은 남습니다."
                    busy={removingVideoId === video.id}
                    onDelete={() => void unsaveVideo(video)}
                  />
                </div>
              </div>
              {openLearning && (
                <button
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
            </article>
          ))}
        </div>
      )}

      {!error && showsSelectedKind && !!items.length && kind === "recordings" && (
        <div className="recording-list">
          {(items as SpeechAttemptRecord[]).map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              showContentTitle
              onPlayOriginal={recording.content_id && openLearning
                ? () => openLearning({
                    contentId: recording.content_id!,
                    transcriptLineId: recording.transcript_line_id,
                    title: recording.content_title,
                    sourceLabel: "보관함 · 대표 녹음",
                  })
                : undefined}
              onRetry={recording.content_id && openLearning
                ? () => openLearning({
                    contentId: recording.content_id!,
                    transcriptLineId: recording.transcript_line_id,
                    title: recording.content_title,
                    sourceLabel: "보관함 · 다시 녹음",
                  })
                : undefined}
              onPinChanged={() => void load()}
              onDeleted={(recordingId) => dropItem((row) => (row as SpeechAttemptRecord).id === recordingId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
