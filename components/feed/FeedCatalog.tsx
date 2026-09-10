"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, CircleAlert, Play } from "lucide-react";
import { SafeQueryClientProvider } from "@/app/providers";
import { catalogSeed } from "@/lib/catalog";
import { thumbnailUrl } from "@/lib/thumbnails";
import type { CatalogPage, CatalogRow, FeedVideo } from "@/lib/types";
import {
  catalogQueryKeys,
  useInfiniteCatalogQuery,
  useInfiniteCategoryVideosQuery,
} from "@/lib/useCatalogQuery";

function durationLabel(seconds: number) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function FeedCatalog(props: {
  onOpenVideo: (video: FeedVideo, row: CatalogRow, origin: DOMRect | null) => void;
  onClose: () => void;
}) {
  return (
    <SafeQueryClientProvider>
      <FeedCatalogContent {...props} />
    </SafeQueryClientProvider>
  );
}

function FeedCatalogContent({
  onOpenVideo,
  onClose,
}: {
  onOpenVideo: (video: FeedVideo, row: CatalogRow, origin: DOMRect | null) => void;
  onClose: () => void;
}) {
  const [seed, setSeed] = useState(() => catalogSeed());
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteCatalogQuery(seed);

  // 모든 페이지의 카테고리 행들을 하나로 병합 (중복 카테고리 필터링)
  const rows = useMemo(() => {
    if (!data?.pages) return [];
    const seen = new Set<string>();
    const list: CatalogRow[] = [];
    for (const page of data.pages) {
      if (!page?.rows) continue;
      for (const row of page.rows) {
        if (!seen.has(row.category.id)) {
          seen.add(row.category.id);
          list.push(row);
        }
      }
    }
    return list;
  }, [data?.pages]);

  // 비디오 변경(좋아요, 저장 상태 등) 패치 이벤트 수신
  useEffect(() => {
    const handlePatch = (e: Event) => {
      const customEvent = e as CustomEvent<{ videoId: string; patch: Partial<FeedVideo> }>;
      if (!customEvent.detail) return;
      const { videoId, patch } = customEvent.detail;
      queryClient.setQueriesData<InfiniteData<CatalogPage>>(
        { queryKey: catalogQueryKeys.infinite(seed) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              rows: page.rows.map((row) => ({
                ...row,
                items: row.items.map((item) => (item.id === videoId ? { ...item, ...patch } : item)),
              })),
            })),
          };
        },
      );
    };
    window.addEventListener("loopine:video-patch", handlePatch);
    return () => window.removeEventListener("loopine:video-patch", handlePatch);
  }, [queryClient, seed]);

  // 세로 무한 스크롤: 관찰 센티넬이 보이면 다음 카테고리 행들을 로드
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: null, rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Pull to refresh (당겨서 새로고침): 스켈레톤 UI를 즉시 노출하고 React Query 캐시 갱신
  useEffect(() => {
    const handlePull = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; done?: () => void }>;
      if (customEvent.detail?.tab === "feed" || customEvent.detail?.tab === "catalog") {
        setIsPullRefreshing(true);
        void (async () => {
          try {
            await queryClient.resetQueries({ queryKey: catalogQueryKeys.all });
          } catch {
            // ignore
          } finally {
            setIsPullRefreshing(false);
            customEvent.detail?.done?.();
          }
        })();
      }
    };
    window.addEventListener("loopine:pull-refresh", handlePull);
    return () => window.removeEventListener("loopine:pull-refresh", handlePull);
  }, [queryClient]);

  const isBusy = isLoading || isPullRefreshing;

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
        {isError && (
          <div className="feed-error">
            <CircleAlert size={16} />
            {error instanceof Error ? error.message : "카탈로그를 불러오지 못했습니다."}
          </div>
        )}

        {/* 로딩 중이거나 당겨서 새로고침 중일 때는 실측 크기의 스켈레톤 UI 표시 */}
        {isBusy ? (
          <CatalogSkeleton />
        ) : (
          <>
            {rows.map((row) => (
              <CatalogCategoryRow
                key={row.category.id}
                row={row}
                seed={seed}
                onOpenVideo={onOpenVideo}
              />
            ))}

            {hasNextPage && <div ref={sentinelRef} className="catalog-sentinel" aria-hidden="true" />}
            {isFetchingNextPage && <CatalogRowSkeleton titleWidth={150} descWidth={210} cardCount={5} />}
            {!rows.length && !isError && (
              <div className="catalog-empty">
                <Clapperboard size={28} aria-hidden="true" />
                <strong>아직 분류된 영상이 없습니다</strong>
                <p>관리자가 카테고리를 만들고 영상을 승인하면 여기에 표시됩니다.</p>
              </div>
            )}
          </>
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
  const trackRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCategoryVideosQuery({
    slug: initialRow.category.slug,
    seed,
    initialRow,
  });

  // 1페이지는 부모가 갱신한 최신 initialRow.items를 사용하고, 가로 스크롤로 추가된 페이지들을 병합
  const items = useMemo(() => {
    if (!data?.pages || data.pages.length <= 1) return initialRow.items;
    const seen = new Set<string>();
    const list: FeedVideo[] = [];
    for (const item of initialRow.items) {
      seen.add(item.id);
      list.push(item);
    }
    for (let i = 1; i < data.pages.length; i++) {
      const page = data.pages[i];
      if (!page?.items) continue;
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          list.push(item);
        }
      }
    }
    return list;
  }, [data?.pages, initialRow.items]);

  // 가로 스크롤이 끝에 가까워지면 다음 페이지 영상 로드
  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || !hasNextPage || isFetchingNextPage) return;
    const remaining = track.scrollWidth - track.scrollLeft - track.clientWidth;
    if (remaining < 320) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function nudge(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <section className="catalog-row">
      <div className="catalog-row-head">
        <div>
          <h3>{initialRow.category.label}</h3>
          {initialRow.category.description && <p>{initialRow.category.description}</p>}
        </div>
        <div className="catalog-row-nav">
          <button type="button" onClick={() => nudge(-1)} aria-label={`${initialRow.category.label} 이전`}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => nudge(1)} aria-label={`${initialRow.category.label} 다음`}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="catalog-track" ref={trackRef} onScroll={onScroll}>
        {items.map((video) => (
          <button
            type="button"
            className="catalog-card"
            key={video.id}
            onClick={(event) => onOpenVideo(video, initialRow, event.currentTarget.getBoundingClientRect())}
          >
            <span className="catalog-card-thumb">
              {video.thumbnail_url ? (
                <img
                  src={thumbnailUrl(video.thumbnail_url, "medium")}
                  alt=""
                  width={480}
                  height={270}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <Clapperboard size={22} aria-hidden="true" />
              )}
              <em>{durationLabel(video.duration_seconds)}</em>
              <i aria-hidden="true">
                <Play size={14} fill="currentColor" />
              </i>
              {video.saved_status === "READY" && <b className="catalog-card-badge">학습 준비됨</b>}
            </span>
            <strong>{video.title}</strong>
            <small>{video.channel_title}</small>
          </button>
        ))}
        {isFetchingNextPage && (
          <>
            <CatalogCardSkeleton />
            <CatalogCardSkeleton />
          </>
        )}
      </div>
    </section>
  );
}

export function CatalogCardSkeleton() {
  return (
    <div className="catalog-card catalog-card-skeleton" aria-hidden="true">
      <span className="catalog-card-thumb skeleton-shimmer">
        <div className="catalog-skeleton-play" />
        <div className="catalog-skeleton-pill" />
      </span>
      <div className="catalog-skeleton-text-group">
        <div className="catalog-skeleton-line title-1 skeleton-shimmer" />
        <div className="catalog-skeleton-line title-2 skeleton-shimmer" />
        <div className="catalog-skeleton-line channel skeleton-shimmer" />
      </div>
    </div>
  );
}

export function CatalogRowSkeleton({
  titleWidth = 140,
  descWidth = 220,
  cardCount = 5,
}: {
  titleWidth?: number;
  descWidth?: number;
  cardCount?: number;
}) {
  return (
    <section className="catalog-row catalog-row-skeleton" aria-hidden="true">
      <div className="catalog-row-head">
        <div className="catalog-skeleton-head-copy">
          <div className="catalog-skeleton-head-title skeleton-shimmer" style={{ width: `${titleWidth}px` }} />
          <div className="catalog-skeleton-head-desc skeleton-shimmer" style={{ width: `${descWidth}px` }} />
        </div>
        <div className="catalog-row-nav">
          <div className="catalog-skeleton-nav-btn skeleton-shimmer" />
          <div className="catalog-skeleton-nav-btn skeleton-shimmer" />
        </div>
      </div>
      <div className="catalog-track">
        {Array.from({ length: cardCount }).map((_, i) => (
          <CatalogCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function CatalogSkeleton() {
  return (
    <div className="catalog-skeleton-group" aria-label="카테고리 목록 불러오는 중">
      <CatalogRowSkeleton titleWidth={140} descWidth={230} cardCount={5} />
      <CatalogRowSkeleton titleWidth={175} descWidth={190} cardCount={5} />
      <CatalogRowSkeleton titleWidth={120} descWidth={250} cardCount={5} />
    </div>
  );
}
