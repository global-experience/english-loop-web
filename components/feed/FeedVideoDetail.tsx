"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen, Bookmark, ChevronDown, ChevronUp, CircleAlert, Heart,
  LoaderCircle, Play, Share2, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { CATALOG_VIDEO_LIMIT, fetchCategoryPage, toggleVideoLike } from "@/lib/catalog";
import { thumbnailUrl } from "@/lib/thumbnails";
import type { CatalogRow, FeedVideo } from "@/lib/types";

/**
 * 카탈로그에서 연 영상 상세.
 * 기존 피드 탭과 동일하게 위아래 스크롤 스냅(feed-stream)으로 영상들을 넘겨볼 수 있다.
 */
export function FeedVideoDetail({
  row,
  startIndex,
  seed,
  originRect: _originRect,
  onClose,
  onOpenLearning,
  onPatchVideo,
}: {
  row: CatalogRow;
  startIndex: number;
  seed: string;
  originRect?: DOMRect | null;
  onClose: () => void;
  onOpenLearning: (video: FeedVideo) => void;
  onPatchVideo?: (videoId: string, patch: Partial<FeedVideo>) => void;
}) {
  const [items, setItems] = useState<FeedVideo[]>(row.items);
  const [nextCursor, setNextCursor] = useState<number | null>(row.next_cursor);
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  const streamRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const initialScrolledRef = useRef(startIndex === 0);

  const video = items[index];

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [closing, onClose]);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || nextCursor === null) return;
    loadingRef.current = true;
    try {
      const page = await fetchCategoryPage(row.category.slug, nextCursor, seed, CATALOG_VIDEO_LIMIT);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      setNextCursor(null);
    } finally {
      loadingRef.current = false;
    }
  }, [nextCursor, row.category.slug, seed]);

  const scrollToVideo = useCallback((targetIndex: number, behavior: ScrollBehavior = "smooth") => {
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const root = streamRef.current;
    if (!root) return;
    const targetCard = root.querySelector<HTMLElement>(`[data-feed-index="${targetIndex}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior, block: "start" });
    }
  }, [items.length]);

  // 첫 진입 시 startIndex로 즉시 스크롤
  useEffect(() => {
    if (initialScrolledRef.current) return;
    const root = streamRef.current;
    if (!root) return;
    const targetCard = root.querySelector<HTMLElement>(`[data-feed-index="${startIndex}"]`);
    if (targetCard) {
      root.style.scrollBehavior = "auto";
      root.style.scrollSnapType = "none";
      targetCard.scrollIntoView({ behavior: "instant", block: "start" });
      root.scrollTop = targetCard.offsetTop;
      initialScrolledRef.current = true;
      window.requestAnimationFrame(() => {
        if (root) {
          root.style.scrollSnapType = "";
          root.style.scrollBehavior = "";
        }
      });
    }
  }, [startIndex]);

  // 스크롤 감지: 화면에 보이는 카드를 찾아 active index 업데이트
  useEffect(() => {
    const root = streamRef.current;
    if (!root || !items.length) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-index]"));
    const observer = new IntersectionObserver(
      (entries) => {
        if (!initialScrolledRef.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible || visible.intersectionRatio < 0.5) return;
        const nextIndex = Number((visible.target as HTMLElement).dataset.feedIndex || 0);
        setIndex((current) => (current === nextIndex ? current : nextIndex));
      },
      { root, threshold: [0.5, 0.75] }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items]);

  // 끝이 가까워지면 미리 채운다.
  useEffect(() => {
    if (items.length - index <= 2) void loadMore();
  }, [index, items.length, loadMore]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
      else if (event.key === "ArrowDown") scrollToVideo(index + 1);
      else if (event.key === "ArrowUp") scrollToVideo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, index, scrollToVideo]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function patchVideo(id: string, patch: Partial<FeedVideo>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("loopine:video-patch", {
          detail: { videoId: id, patch },
        })
      );
    }
    onPatchVideo?.(id, patch);
  }

  async function toggleLike(target: FeedVideo) {
    if (busy === `like:${target.id}`) return;
    setBusy(`like:${target.id}`);
    setError("");
    const next = !target.liked;
    try {
      await toggleVideoLike(target.id, next);
      patchVideo(target.id, { liked: next });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "좋아요를 반영하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function save(target: FeedVideo) {
    if (target.saved_status) return;
    setBusy(target.id);
    setError("");
    try {
      await apiFetch(`/api/feed/${target.id}/save`, { method: "POST" });
      patchVideo(target.id, { saved_status: "PROCESSING" });
      setNotice("찜했습니다. 자막을 준비하는 중이에요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "찜하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function share(target: FeedVideo) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://loopine.life";
    const url = `${origin}/feed/categories/${target.youtube_video_id}`;
    const payload = { title: target.title, text: `${target.title} · ${target.channel_title}`, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("링크를 복사했습니다.");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setNotice("링크를 복사하지 못했습니다.");
    }
  }

  if (!video) return null;

  const modalNode = (
    <div className={`video-detail-layer${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label={video.title}>
      <div className="video-detail-sheet">
        <button
          type="button"
          className="video-detail-close"
          onClick={handleClose}
          aria-label="닫기"
        >
          <X size={20} />
        </button>

        <div
          className="feed-stream video-detail-stream"
          ref={streamRef}
          tabIndex={0}
          aria-label="카테고리 영상 피드. 위아래로 스크롤해 영상을 넘기세요."
        >
          {items.map((item, idx) => {
            const isPlaying = idx === index;
            return (
              <article
                className="feed-card video-detail-card"
                key={item.id}
                data-feed-index={idx}
              >
                <div className="feed-media video-detail-hero">
                  {isPlaying ? (
                    <>
                      <iframe
                        key={item.youtube_video_id}
                        src={`https://www.youtube.com/embed/${item.youtube_video_id}?autoplay=1&playsinline=1&controls=0&fs=0&disablekb=1&rel=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0`}
                        title={item.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                      <div
                        className="video-detail-top-shield"
                        aria-hidden="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <img
                        src={thumbnailUrl(item.thumbnail_url, "medium")}
                        alt=""
                        aria-hidden="true"
                        onClick={() => scrollToVideo(idx)}
                        style={{ cursor: "pointer" }}
                      />
                      <span
                        className="feed-play"
                        onClick={() => scrollToVideo(idx)}
                        style={{ cursor: "pointer" }}
                      >
                        <Play fill="currentColor" />
                      </span>
                    </>
                  )}
                </div>

                <div className="feed-copy video-detail-body">
                  <div className="feed-meta">
                    <span>{item.channel_title}</span>
                    <span className="video-detail-category">{row.category.label}</span>
                  </div>
                  <h3>{item.title}</h3>
                  {item.recommendation_reason && (
                    <p className="feed-recommendation-reason">{item.recommendation_reason}</p>
                  )}

                  <div className="feed-actions video-detail-actions">
                    <button
                      type="button"
                      className={item.saved_status ? "feed-save saved" : "feed-save"}
                      onClick={() => save(item)}
                      disabled={busy === item.id || Boolean(item.saved_status)}
                    >
                      {busy === item.id ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <Bookmark size={18} fill={item.saved_status ? "currentColor" : "none"} />
                      )}
                      <span>{item.saved_status === "READY" ? "학습 준비됨" : item.saved_status ? "준비 중" : "찜하기"}</span>
                    </button>
                    <button
                      type="button"
                      className={item.liked ? "video-detail-secondary liked" : "video-detail-secondary"}
                      onClick={() => toggleLike(item)}
                      disabled={busy === `like:${item.id}`}
                      aria-pressed={Boolean(item.liked)}
                    >
                      {busy === `like:${item.id}` ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <Heart size={18} fill={item.liked ? "currentColor" : "none"} />
                      )}
                      <span>좋아요</span>
                    </button>
                    <button type="button" className="feed-learn" onClick={() => onOpenLearning(item)}>
                      <BookOpen size={18} />
                      <span>바로 학습</span>
                    </button>
                    <button type="button" className="video-detail-secondary" onClick={() => share(item)}>
                      <Share2 size={18} />
                      <span>공유</span>
                    </button>
                  </div>

                  {notice && idx === index && <p className="video-detail-notice" role="status">{notice}</p>}
                  {error && idx === index && <p className="video-detail-error" role="alert"><CircleAlert size={15} /> {error}</p>}
                </div>
              </article>
            );
          })}

          {nextCursor !== null && (
            <div className="feed-tail">
              <LoaderCircle className="spin" />
              <span>다음 영상을 준비하고 있어요.</span>
            </div>
          )}
        </div>
      </div>

      <nav className="feed-pc-nav" aria-label="피드 영상 이동 컨트롤">
        <button
          type="button"
          className="feed-pc-nav-btn"
          onClick={() => scrollToVideo(index - 1)}
          disabled={index === 0}
          aria-label="이전 영상"
          title="이전 영상"
        >
          <ChevronUp size={20} />
        </button>
        <span className="feed-pc-nav-count">{index + 1} / {items.length}</span>
        <button
          type="button"
          className="feed-pc-nav-btn"
          onClick={() => {
            if (index >= items.length - 1 && nextCursor !== null) {
              void loadMore();
            } else {
              scrollToVideo(index + 1);
            }
          }}
          disabled={index >= items.length - 1 && nextCursor === null}
          aria-label="다음 영상"
          title="다음 영상"
        >
          <ChevronDown size={20} />
        </button>
      </nav>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
}
