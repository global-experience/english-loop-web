"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Play, Sparkles, Subtitles, Volume2, VolumeX } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isNativeAppRuntime, shouldStartFeedMuted, hasUserActivation } from "@/lib/nativeRuntime";
import type { FeedVideo } from "@/lib/types";

type FeedResponse = {
  items: FeedVideo[];
  seed: string;
  next_cursor: number | null;
  total: number;
};

type FeedPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
};

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const GESTURES = ["touchend", "click", "keydown", "touchstart", "pointerdown"] as const;

function isNativeApp() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return isNativeAppRuntime(capacitor, navigator.userAgent);
}

export function FeedView({ openLearning }: { openLearning: (videoUrl: string) => void }) {
  const [items, setItems] = useState<FeedVideo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(() =>
    shouldStartFeedMuted({
      native: isNativeApp(),
      userInteracted: false,
      userMuted: false,
    })
  );
  const [seed, setSeed] = useState("");
  const [cursor, setCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const activeStartedAt = useRef(Date.now());
  const previousActive = useRef<FeedVideo | null>(null);
  const userInteractedRef = useRef(false);   // true once user has touched/clicked anywhere
  const userMutedRef = useRef(false);          // true if user explicitly chose to mute
  const playerRef = useRef<FeedPlayer | null>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const activeTabRef = useRef(true);

  // ── YouTube IFrame API readiness ──
  useEffect(() => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setApiReady(true);
    };
    if (window.YT?.Player) setApiReady(true);
    return () => { window.onYouTubeIframeAPIReady = prev; };
  }, []);

  // ── First user gesture / existing sticky activation → unlock audio ──
  useEffect(() => {
    if (hasUserActivation()) {
      userInteractedRef.current = true;
      if (!userMutedRef.current) {
        setIsMuted(false);
      }
    }

    const unlock = () => {
      userInteractedRef.current = true;
      if (!userMutedRef.current) {
        // Unmute the active player directly (no iframe reload)
        const player = playerRef.current;
        if (player) {
          try { player.unMute(); player.playVideo(); } catch { /* ignore */ }
        }
        setIsMuted(false);
      }
      GESTURES.forEach((ev) => window.removeEventListener(ev, unlock, { capture: true }));
    };
    GESTURES.forEach((ev) => window.addEventListener(ev, unlock, { capture: true, once: true }));
    return () => {
      GESTURES.forEach((ev) => window.removeEventListener(ev, unlock, { capture: true }));
    };
  }, []);

  // ── Create / destroy YT.Player when activeIndex or apiReady changes ──
  useEffect(() => {
    const video = items[activeIndex];
    if (!apiReady || !window.YT?.Player || !video) return;

    const hostEl = playerHostRef.current;
    if (!hostEl) return;

    const ytVideoId = video.youtube_video_id;
    if (currentVideoIdRef.current === ytVideoId && playerRef.current) return;

    // Destroy previous player
    try { playerRef.current?.destroy(); } catch { /* ignore */ }
    playerRef.current = null;
    currentVideoIdRef.current = null;

    // Clear the host div so YT.Player creates a fresh iframe inside it
    hostEl.innerHTML = "";
    const target = document.createElement("div");
    hostEl.appendChild(target);

    // If document has sticky user activation (e.g. user navigated in SPA) or is Native, play unmuted!
    const shouldMute = shouldStartFeedMuted({
      native: isNativeApp(),
      userInteracted: userInteractedRef.current,
      userMuted: userMutedRef.current,
      hasBeenActive: hasUserActivation(),
    });

    const player = new window.YT.Player(target, {
      videoId: ytVideoId,
      host: "https://www.youtube-nocookie.com",
      playerVars: {
        autoplay: 1,
        mute: shouldMute ? 1 : 0,
        playsinline: 1,
        controls: 0,
        cc_load_policy: 1,
        rel: 0,
        enablejsapi: 1,
        modestbranding: 1,
        iv_load_policy: 3,
        loop: 1
      },
      events: {
        onReady: () => {
          currentVideoIdRef.current = ytVideoId;
          setIsMuted(shouldMute);
          try { player.playVideo(); } catch { /* ignore */ }
        },
      },
    }) as unknown as FeedPlayer;

    playerRef.current = player;

    return () => {
      // Cleanup only if this effect re-runs (activeIndex changed)
      // The destroy happens at the top of the next effect run
    };
  }, [apiReady, activeIndex, items]);

  // ── Sync mute state to player when user toggles ──
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (!activeTabRef.current) {
      try { player.pauseVideo(); } catch { /* player not ready yet */ }
      return;
    }
    try {
      if (isMuted) player.mute();
      else { player.unMute(); player.playVideo(); }
    } catch { /* player not ready yet */ }
  }, [isMuted]);

  useEffect(() => {
    const handleTabVisibility = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ tab?: string; active?: boolean }>;
      if (event.detail?.tab !== "feed") return;
      activeTabRef.current = event.detail.active === true;
      const player = playerRef.current;
      if (!player) return;
      try {
        if (activeTabRef.current) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      } catch {
        // Ignore transient YouTube iframe state.
      }
    };
    const pauseForBackground = () => {
      activeTabRef.current = false;
      try { playerRef.current?.pauseVideo(); } catch { /* ignore */ }
    };
    window.addEventListener("loopine:tab-visibility", handleTabVisibility);
    window.addEventListener("loopine:app-background", pauseForBackground);
    return () => {
      window.removeEventListener("loopine:tab-visibility", handleTabVisibility);
      window.removeEventListener("loopine:app-background", pauseForBackground);
    };
  }, []);

  const scrollToVideo = (index: number) => {
    if (index < 0 || index >= items.length) return;
    const root = streamRef.current;
    if (!root) return;
    const targetCard = root.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setError("");
    try {
      const params = new URLSearchParams({ limit: "20", cursor: String(cursor) });
      if (seed) params.set("seed", seed);
      const data = await apiFetch<FeedResponse>(`/api/feed?${params}`);
      setSeed(data.seed);
      setCursor(data.next_cursor);
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !known.has(item.id))];
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "피드를 불러오지 못했습니다.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, seed]);

  useEffect(() => { void loadMore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendEvent = useCallback((video: FeedVideo, eventType: "VIEW" | "SKIP" | "OPEN_LEARNING", watchSeconds?: number) => {
    void apiFetch(`/api/feed/${video.id}/events`, {
      method: "POST",
      body: JSON.stringify({ event_type: eventType, watch_seconds: watchSeconds }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = streamRef.current;
    if (!root || !items.length) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-feed-index]"));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || visible.intersectionRatio < 0.62) return;
      const nextIndex = Number((visible.target as HTMLElement).dataset.feedIndex || 0);
      setActiveIndex((current) => current === nextIndex ? current : nextIndex);
    }, { root, threshold: [0.62, 0.8] });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const current = items[activeIndex];
    if (!current) return;
    const previous = previousActive.current;
    if (previous?.id === current.id) {
      if (activeIndex >= items.length - 6 && cursor !== null) void loadMore();
      return;
    }
    if (previous && previous.id !== current.id) {
      const watched = Math.max(0, Math.round((Date.now() - activeStartedAt.current) / 1000));
      sendEvent(previous, "SKIP", watched);
    }
    previousActive.current = current;
    activeStartedAt.current = Date.now();
    sendEvent(current, "VIEW");
    if (activeIndex >= items.length - 6 && cursor !== null) void loadMore();
  }, [activeIndex, cursor, items, loadMore, sendEvent]);

  async function save(video: FeedVideo) {
    if (video.saved_status === "PROCESSING" || video.saved_status === "READY") return;
    setSavingId(video.id);
    setError("");
    try {
      const saved = await apiFetch<{ status: FeedVideo["saved_status"] }>(`/api/feed/${video.id}/save`, { method: "POST" });
      setItems((current) => current.map((item) => item.id === video.id ? { ...item, saved_status: saved.status } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "영상을 저장하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  if (loading) return <section className="feed-loading"><LoaderCircle className="spin" /><p>오늘의 영어 영상을 고르고 있어요.</p></section>;
  if (!items.length) return <section className="empty-state"><Sparkles /><h2>아직 피드 영상이 없습니다.</h2><p>관리자에서 후보 영상을 수집하고 승인하면 여기에 나타납니다.</p>{error && <span className="feed-error">{error}</span>}</section>;

  return (
    <section className="feed-view">
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
        onReady={() => { if (window.YT?.Player) setApiReady(true); }}
        onError={() => setError("YouTube 플레이어를 불러오지 못했습니다.")}
      />

      <header className="feed-heading">
        <div>
          <p className="eyebrow">DISCOVER · SAVE · LEARN</p>
        </div>
        <span>{items.length}개 준비됨</span>
      </header>
      {error && <div className="feed-error"><CircleAlert size={16} />{error}</div>}

      <div className="feed-container">
        <div className="feed-stream" ref={streamRef} tabIndex={0} aria-label="영어 영상 피드. 위아래로 스크롤해 영상을 넘기세요.">
          {items.map((video, index) => {
            const active = index === activeIndex;
            const saved = video.saved_status === "READY" || video.saved_status === "PROCESSING";
            return <article className="feed-card" key={video.id} data-feed-index={index}>
              <div className="feed-media">
                {active
                  ? <div className="feed-player-host" ref={playerHostRef} />
                  : <><img src={video.thumbnail_url} alt="" /><span className="feed-play"><Play fill="currentColor" /></span></>
                }
                <button
                  type="button"
                  className="feed-sound-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    userInteractedRef.current = true;
                    setIsMuted((prev) => {
                      const next = !prev;
                      userMutedRef.current = next;
                      return next;
                    });
                  }}
                  aria-label={isMuted ? "소리 켜기" : "음소거"}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  <span>{isMuted ? "소리 켜기" : "소리 끎"}</span>
                </button>
                <span className="feed-duration">{durationLabel(video.duration_seconds)}</span>
              </div>
              <div className="feed-copy">
                <div className="feed-meta"><span>{video.channel_title}</span>{video.caption_available && <span className="cc"><Subtitles size={13} /> CC</span>}</div>
                <h3>{video.title}</h3>
                <div className="feed-actions">
                  <button className={saved ? "feed-save saved" : "feed-save"} onClick={() => void save(video)} disabled={savingId === video.id || saved}>
                    {savingId === video.id ? <LoaderCircle className="spin" size={17} /> : saved ? <Check size={17} /> : <Bookmark size={17} />}
                    {video.saved_status === "READY" ? "학습 준비됨" : video.saved_status === "PROCESSING" ? "자막 준비 중" : "찜하기"}
                  </button>
                  <button className="feed-learn" onClick={() => { sendEvent(video, "OPEN_LEARNING"); openLearning(video.youtube_url); }}><Play size={17} fill="currentColor" /> 바로 학습</button>
                </div>
              </div>
            </article>;
          })}
          {cursor !== null && <div className="feed-tail"><LoaderCircle className="spin" /><span>다음 영상을 준비하고 있어요.</span></div>}
        </div>

        <nav className="feed-pc-nav" aria-label="피드 영상 이동 컨트롤">
          <button
            type="button"
            className="feed-pc-nav-btn"
            onClick={() => scrollToVideo(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="이전 영상"
            title="이전 영상"
          >
            <ChevronUp size={20} />
          </button>
          <span className="feed-pc-nav-count">{activeIndex + 1} / {items.length}</span>
          <button
            type="button"
            className="feed-pc-nav-btn"
            onClick={() => scrollToVideo(activeIndex + 1)}
            disabled={activeIndex >= items.length - 1}
            aria-label="다음 영상"
            title="다음 영상"
          >
            <ChevronDown size={20} />
          </button>
        </nav>
      </div>
    </section>
  );
}
