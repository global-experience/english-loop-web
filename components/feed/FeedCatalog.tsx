"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, CircleAlert, LoaderCircle, Play } from "lucide-react";
import {
  CATALOG_VIDEO_LIMIT,
  catalogSeed,
  fetchCatalogPage,
  fetchCategoryPage,
} from "@/lib/catalog";
import { thumbnailUrl } from "@/lib/thumbnails";
import type { CatalogRow, FeedVideo } from "@/lib/types";

function durationLabel(seconds: number) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * 카테고리별 브라우즈 화면.
 *
 * 두 축으로 페이지를 넘긴다 — 세로는 카테고리, 가로는 그 줄의 영상. 둘 다
 * 서버가 `next_cursor: null` 을 주는 순간 멈춘다. 끝이 없으면 스크롤할수록
 * 같은 요청이 계속 나간다.
 */
let catalogCache: { rows: CatalogRow[]; cursor: number | null; seed: string } | null = null;

export function FeedCatalog({
  onOpenVideo,
  onClose,
}: {
  onOpenVideo: (video: FeedVideo, row: CatalogRow, origin: DOMRect | null) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CatalogRow[]>(() => catalogCache?.rows || []);
  const [cursor, setCursor] = useState<number | null>(() => (catalogCache ? catalogCache.cursor : 0));
  const [loading, setLoading] = useState(() => catalogCache === null);
  const [error, setError] = useState("");

  const [seed, setSeed] = useState(() => catalogCache?.seed || catalogSeed());
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchCatalogPage(cursor, seed);
      setSeed(page.seed);
      setRows((current) => {
        // 같은 카테고리가 두 번 들어오면 화면에 줄이 겹친다.
        const seen = new Set(current.map((row) => row.category.id));
        const nextRows = [...current, ...page.rows.filter((row) => !seen.has(row.category.id))];
        catalogCache = { rows: nextRows, cursor: page.next_cursor, seed: page.seed };
        return nextRows;
      });
      setCursor(page.next_cursor);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "카탈로그를 불러오지 못했습니다.");
      // 실패한 커서로 계속 재시도하면 같은 오류가 반복된다. 사용자가 다시 시도하게 둔다.
      setCursor(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, seed]);

  useEffect(() => {
    if (!catalogCache) {
      void loadMore(); /* 최초 1페이지 */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handlePatch = (e: Event) => {
      const customEvent = e as CustomEvent<{ videoId: string; patch: Partial<FeedVideo> }>;
      if (!customEvent.detail) return;
      const { videoId, patch } = customEvent.detail;
      setRows((current) => {
        const nextRows = current.map((r) => {
          const hasVideo = r.items.some((item) => item.id === videoId);
          if (!hasVideo) return r;
          return {
            ...r,
            items: r.items.map((item) => (item.id === videoId ? { ...item, ...patch } : item)),
          };
        });
        if (catalogCache) {
          catalogCache.rows = nextRows;
        }
        return nextRows;
      });
    };
    window.addEventListener("loopine:video-patch", handlePatch);
    return () => window.removeEventListener("loopine:video-patch", handlePatch);
  }, []);

  // ── 세로 무한 스크롤. 카테고리가 떨어지면 관찰 자체를 멈춘다 ──
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || cursor === null) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
      { root: null, rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  return (
    <div className="catalog-shell">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">BROWSE BY CATEGORY</p>
          <h2>카테고리별 영상</h2>
        </div>
        <button type="button" className="catalog-close" onClick={onClose} aria-label="피드로 돌아가기">
          <ArrowLeft size={20} />
        </button>
      </header>

      <div className="catalog-content">
        {error && <div className="feed-error"><CircleAlert size={16} />{error}</div>}
        {rows.map((row) => (
          <CatalogCategoryRow
            key={row.category.id}
            row={row}
            seed={seed}
            onOpenVideo={onOpenVideo}
          />
        ))}

        {cursor !== null && <div ref={sentinelRef} className="catalog-sentinel" aria-hidden="true" />}
        {loading && <div className="catalog-loading"><LoaderCircle className="spin" size={20} /> 불러오는 중…</div>}
        {!loading && !rows.length && !error && (
          <div className="catalog-empty">
            <Clapperboard size={28} aria-hidden="true" />
            <strong>아직 분류된 영상이 없습니다</strong>
            <p>관리자가 카테고리를 만들고 영상을 승인하면 여기에 표시됩니다.</p>
          </div>
        )}
        {/* 끝에 도달했음을 알린다. 아무 표시가 없으면 더 있는데 안 나오는 줄 안다. */}
        {cursor === null && rows.length > 0 && !error && (
          <p className="catalog-end">모든 카테고리를 확인했습니다</p>
        )}
      </div>
    </div>
  );
}

function CatalogCategoryRow({
  row: initialRow,
  seed,
  onOpenVideo,
}: {
  row: CatalogRow;
  seed: string;
  onOpenVideo: (video: FeedVideo, row: CatalogRow, origin: DOMRect | null) => void;
}) {
  const [row, setRow] = useState(initialRow);
  const [loading, setLoading] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => setRow(initialRow), [initialRow]);

  useEffect(() => {
    const handlePatch = (e: Event) => {
      const customEvent = e as CustomEvent<{ videoId: string; patch: Partial<FeedVideo> }>;
      if (!customEvent.detail) return;
      const { videoId, patch } = customEvent.detail;
      setRow((current) => {
        const hasVideo = current.items.some((item) => item.id === videoId);
        if (!hasVideo) return current;
        return {
          ...current,
          items: current.items.map((item) => (item.id === videoId ? { ...item, ...patch } : item)),
        };
      });
    };
    window.addEventListener("loopine:video-patch", handlePatch);
    return () => window.removeEventListener("loopine:video-patch", handlePatch);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || row.next_cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchCategoryPage(row.category.slug, row.next_cursor, seed, CATALOG_VIDEO_LIMIT);
      setRow((current) => {
        const seen = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))],
          next_cursor: page.next_cursor,
          total: page.total,
        };
      });
    } catch {
      // 이 줄만 실패한 것이다. 화면 전체를 오류로 덮지 않고 더 불러오기만 멈춘다.
      setRow((current) => ({ ...current, next_cursor: null }));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [row.category.slug, row.next_cursor, seed]);

  // ── 가로 스크롤이 끝에 가까워지면 그 줄만 더 불러온다 ──
  function onScroll() {
    const track = trackRef.current;
    if (!track || row.next_cursor === null) return;
    const remaining = track.scrollWidth - track.scrollLeft - track.clientWidth;
    if (remaining < 320) void loadMore();
  }

  function nudge(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section className="catalog-row">
      <div className="catalog-row-head">
        <div>
          <h3>{row.category.label}</h3>
          {row.category.description && <p>{row.category.description}</p>}
        </div>
        <div className="catalog-row-nav">
          <button type="button" onClick={() => nudge(-1)} aria-label={`${row.category.label} 이전`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => nudge(1)} aria-label={`${row.category.label} 다음`}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="catalog-track" ref={trackRef} onScroll={onScroll}>
        {row.items.map((video) => (
          <button
            type="button"
            className="catalog-card"
            key={video.id}
            onClick={(event) => onOpenVideo(video, row, event.currentTarget.getBoundingClientRect())}
          >
            <span className="catalog-card-thumb">
              {video.thumbnail_url
                ? <img
                    src={thumbnailUrl(video.thumbnail_url, "medium")}
                    alt=""
                    width={480}
                    height={270}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                : <Clapperboard size={22} aria-hidden="true" />}
              <em>{durationLabel(video.duration_seconds)}</em>
              <i aria-hidden="true"><Play size={14} fill="currentColor" /></i>
              {video.saved_status === "READY" && <b className="catalog-card-badge">학습 준비됨</b>}
            </span>
            <strong>{video.title}</strong>
            <small>{video.channel_title}</small>
          </button>
        ))}
        {loading && <div className="catalog-card-loading"><LoaderCircle className="spin" size={18} /></div>}
      </div>
    </section>
  );
}
