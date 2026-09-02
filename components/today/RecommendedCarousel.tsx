"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, Play, RefreshCw } from "lucide-react";
import type { FeedVideo } from "@/lib/types";

function durationLabel(seconds: number) {
  if (!seconds) return "길이 미정";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Horizontal carousel of feed recommendations.
 *
 * Scrolling is a native overflow scroller with scroll snapping, so touch swipe and
 * trackpads work for free and the next card always peeks in from the right. Mouse
 * drag and the arrow buttons are layered on top; the track is focusable so the arrow
 * keys, Home and End move through the cards too.
 */
export function RecommendedCarousel({
  items,
  loading,
  error,
  onRetry,
  onOpenVideo,
}: {
  items: FeedVideo[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenVideo: (video: FeedVideo) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });

  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    syncEdges();
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener("scroll", syncEdges, { passive: true });
    window.addEventListener("resize", syncEdges);
    return () => {
      track.removeEventListener("scroll", syncEdges);
      window.removeEventListener("resize", syncEdges);
    };
  }, [items.length, syncEdges]);

  const step = useCallback((direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-carousel-card]");
    // Fall back to two thirds of the viewport when no card is measurable yet.
    const distance = card ? card.offsetWidth + 12 : track.clientWidth * 0.66;
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Touch is handled by native scrolling; only take over for mouse and pen.
    if (event.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = { active: true, startX: event.clientX, startScroll: track.scrollLeft, moved: 0 };
    track.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag.active || !track) return;
    const delta = event.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(delta));
    track.scrollLeft = drag.startScroll - delta;
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (track?.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    dragRef.current.active = false;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "Home") { event.preventDefault(); track.scrollTo({ left: 0, behavior: "smooth" }); }
    else if (event.key === "End") { event.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: "smooth" }); }
  }

  /** A drag that moved the track must not also open the card underneath. */
  function openVideo(video: FeedVideo) {
    if (dragRef.current.moved > 8) {
      dragRef.current.moved = 0;
      return;
    }
    onOpenVideo(video);
  }

  return (
    <section className="today-section" aria-label="오늘의 추천 영상">
      <div className="section-heading">
        <div><p className="eyebrow">FROM YOUR FEED</p><h2>오늘의 추천 영상</h2></div>
        <div className="today-carousel-nav">
          <button type="button" onClick={() => step(-1)} disabled={atStart || !items.length} aria-label="이전 추천 영상">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => step(1)} disabled={atEnd || !items.length} aria-label="다음 추천 영상">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading && !items.length && (
        <div className="today-carousel-skeleton" role="status" aria-live="polite">
          <span /><span /><span className="sr-only">추천 영상을 불러오는 중…</span>
        </div>
      )}

      {!!error && !items.length && (
        <div className="today-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" className="text-button" onClick={onRetry}><RefreshCw size={14} /> 다시 시도</button>
        </div>
      )}

      {!loading && !error && !items.length && (
        <p className="muted-copy today-empty-line">
          아직 추천할 영상이 없어요. 피드 탭에서 관심 있는 영상을 찜하면 여기에 모입니다.
        </p>
      )}

      {!!items.length && (
        <div
          className="today-carousel"
          ref={trackRef}
          role="group"
          tabIndex={0}
          aria-label="추천 영상 목록. 좌우 방향키로 넘길 수 있습니다."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          {items.map((video) => (
            <article className="today-video-card" key={video.id} data-carousel-card>
              <button type="button" onClick={() => openVideo(video)} aria-label={`${video.title} 피드에서 보기`}>
                <span className="today-video-thumb">
                  {video.thumbnail_url
                    ? <img src={video.thumbnail_url} alt="" loading="lazy" draggable={false} />
                    : <Clapperboard size={22} aria-hidden="true" />}
                  <em>{durationLabel(video.duration_seconds)}</em>
                  <i aria-hidden="true"><Play size={15} fill="currentColor" /></i>
                </span>
                <strong>{video.title}</strong>
                <small>
                  {video.channel_title}
                  {video.saved_status === "READY" ? " · 학습 준비됨" : video.saved_status === "PROCESSING" ? " · 자막 준비 중" : ""}
                </small>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
