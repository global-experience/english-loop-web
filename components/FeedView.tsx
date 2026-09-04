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
  stopVideo?: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
  getPlayerState?: () => number;
  getDuration?: () => number;
};

function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const GESTURES = ["touchend", "click", "keydown", "touchstart", "pointerdown"] as const;

/**
 * 스크롤이 이만큼 멈춘 뒤에만 임베드를 생성한다.
 * 스와이프로 지나가는 영상까지 플레이어를 만들면 한 IP에서 몇 초 만에 수십 개의 재생
 * 세션이 열리고, YouTube가 이를 자동화로 판정해 "로그인하여 봇이 아님을 확인하세요"
 * 화면을 띄운다. 실제로 머무른 영상만 로드해 사람과 같은 요청 패턴을 유지한다.
 */
const PLAY_SETTLE_MS = 450;

/** onReady 이후 이 시간 안에 재생도 메타데이터 로드도 확인되지 않으면 차단으로 판정한다. */
const PLAYBACK_WATCHDOG_MS = 5000;

const YT_STATE_PLAYING = 1;
const YT_STATE_BUFFERING = 3;

function openOnYouTube(ytVideoId: string) {
  // 네이티브 앱에서는 유니버설 링크가 YouTube 앱으로 넘겨준다.
  // 앱에는 이미 로그인되어 있으므로 봇 확인 화면을 만나지 않는다.
  window.open(`https://www.youtube.com/watch?v=${ytVideoId}`, "_blank", "noopener,noreferrer");
}

function isNativeApp() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return isNativeAppRuntime(capacitor, navigator.userAgent);
}

export function FeedView({
  active = true,
  openLearning,
  focusVideo = null,
  focusKey = 0,
  onFocusConsumed,
}: {
  active?: boolean;
  openLearning: (video: FeedVideo, transcriptLineId?: string | null) => void;
  /** A video the Today tab asked to open. Selected and played on arrival. */
  focusVideo?: FeedVideo | null;
  focusKey?: number;
  onFocusConsumed?: () => void;
}) {
  const [items, setItems] = useState<FeedVideo[]>([]);
  const itemsRef = useRef<FeedVideo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /** 실제로 임베드를 붙일 인덱스. activeIndex가 PLAY_SETTLE_MS 동안 유지될 때만 승격된다. */
  const [playIndex, setPlayIndex] = useState(0);
  /** 봇 확인 화면 등으로 임베드 재생이 불가능하다고 판정된 YouTube 영상 ID. */
  const [blockedVideoIds, setBlockedVideoIds] = useState<string[]>([]);
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
  const activeTabRef = useRef(active);
  const watchdogRef = useRef<number | null>(null);

  const pausePlayer = useCallback((hardStop = false) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.pauseVideo();
      if (hardStop) player.stopVideo?.();
    } catch {
      // Ignore transient YouTube iframe state.
    }
  }, []);

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
        if (player && activeTabRef.current) {
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

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** 임베드로는 볼 수 없는 영상으로 표시하고 플레이어를 정리한다. */
  const markBlocked = useCallback((ytVideoId: string) => {
    clearWatchdog();
    try { playerRef.current?.destroy(); } catch { /* ignore */ }
    playerRef.current = null;
    currentVideoIdRef.current = null;
    setBlockedVideoIds((current) => current.includes(ytVideoId) ? current : [...current, ytVideoId]);
  }, [clearWatchdog]);

  const retryVideo = useCallback((ytVideoId: string) => {
    setBlockedVideoIds((current) => current.filter((id) => id !== ytVideoId));
  }, []);

  // ── Promote activeIndex → playIndex only once scrolling has settled ──
  // 넘기는 중에는 임베드를 만들지 않는다. 이것이 봇 판정을 유발하는 요청 폭주를 막는 핵심.
  useEffect(() => {
    if (playIndex === activeIndex) return;
    const timer = window.setTimeout(() => setPlayIndex(activeIndex), PLAY_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, playIndex]);

  // ── Create / destroy YT.Player when playIndex or apiReady changes ──
  useEffect(() => {
    activeTabRef.current = active;
    const video = items[playIndex];
    const blocked = video ? blockedVideoIds.includes(video.youtube_video_id) : false;
    if (!active || !apiReady || !window.YT?.Player || !video || blocked) {
      if (!active) pausePlayer(true);
      return;
    }

    const hostEl = playerHostRef.current;
    if (!hostEl) return;

    const ytVideoId = video.youtube_video_id;
    if (currentVideoIdRef.current === ytVideoId && playerRef.current) return;

    // Destroy previous player
    clearWatchdog();
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
      // host 미지정 → 기본 www.youtube.com 임베드를 사용한다.
      // youtube-nocookie.com은 쿠키를 전달하지 않는 도메인이라 로그인 세션이 임베드에
      // 붙지 않고, 항상 익명 클라이언트로 요청되어 봇 확인 화면에 걸린다.
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
          try {
            if (activeTabRef.current) player.playVideo();
            else pausePlayer(true);
          } catch { /* ignore */ }

          // 봇 확인 화면이 뜨면 onError가 오지 않는다. 플레이어는 "정상" 로드되고 화면만
          // 바뀌기 때문에, 재생이 시작되지도 않고 메타데이터(duration)도 없는 상태를 차단으로
          // 판정한다. 브라우저 자동재생 정책 때문에 멈춘 경우에는 duration이 정상적으로
          // 잡히므로 두 상황이 구분된다.
          watchdogRef.current = window.setTimeout(() => {
            watchdogRef.current = null;
            let state = -1;
            let duration = 0;
            try {
              state = player.getPlayerState?.() ?? -1;
              duration = player.getDuration?.() ?? 0;
            } catch { /* ignore */ }
            const started = state === YT_STATE_PLAYING || state === YT_STATE_BUFFERING;
            if (!started && duration <= 0) markBlocked(ytVideoId);
          }, PLAYBACK_WATCHDOG_MS);
        },
        onStateChange: (event: { data: number }) => {
          if (event.data === YT_STATE_PLAYING || event.data === YT_STATE_BUFFERING) clearWatchdog();
        },
        // 2: 잘못된 파라미터, 5: HTML5 재생 오류, 100: 삭제/비공개, 101·150: 임베드 차단
        onError: () => markBlocked(ytVideoId),
      },
    }) as unknown as FeedPlayer;

    playerRef.current = player;

    return () => {
      // Cleanup only if this effect re-runs (playIndex changed)
      // The destroy happens at the top of the next effect run
    };
  }, [active, apiReady, playIndex, items, pausePlayer, blockedVideoIds, clearWatchdog, markBlocked]);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  // ── Sync mute state to player when user toggles ──
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    activeTabRef.current = active;
    if (!activeTabRef.current) {
      pausePlayer(true);
      return;
    }
    try {
      if (isMuted) player.mute();
      else { player.unMute(); player.playVideo(); }
    } catch { /* player not ready yet */ }
  }, [active, isMuted, pausePlayer]);

  useEffect(() => {
    activeTabRef.current = active;
    if (!active) pausePlayer(true);
  }, [active, pausePlayer]);

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
          pausePlayer(true);
        }
      } catch {
        // Ignore transient YouTube iframe state.
      }
    };
    const pauseForBackground = () => {
      activeTabRef.current = false;
      pausePlayer(true);
    };
    const handleTabReselect = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ tab?: string }>;
      if (event.detail?.tab !== "feed") return;
      setActiveIndex(0);
      activeIndexRef.current = 0;
      streamRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    };
    window.addEventListener("loopine:tab-visibility", handleTabVisibility);
    window.addEventListener("loopine:tab-reselect", handleTabReselect);
    window.addEventListener("loopine:app-background", pauseForBackground);
    return () => {
      window.removeEventListener("loopine:tab-visibility", handleTabVisibility);
      window.removeEventListener("loopine:tab-reselect", handleTabReselect);
      window.removeEventListener("loopine:app-background", pauseForBackground);
    };
  }, [pausePlayer]);

  // ── Focus a video handed over by the Today tab ──
  const focusVideoId = focusVideo?.id || "";
  const lastHandledKeyRef = useRef<number>(0);
  const [focusTrigger, setFocusTrigger] = useState<{ id: string; key: number } | null>(null);

  useEffect(() => {
    if (!focusVideo || !focusVideoId) return;
    const targetKey = focusKey || 1;
    if (lastHandledKeyRef.current === targetKey) return;
    lastHandledKeyRef.current = targetKey;

    setItems((current) => {
      const index = current.findIndex((item) => item.id === focusVideoId);
      if (index >= 0) {
        setActiveIndex(index);
        setPlayIndex(index);
        activeIndexRef.current = index;
        return [...current];
      }
      // The Today carousel and the feed can be paginated differently, so make sure
      // the requested video exists here before selecting it.
      setActiveIndex(0);
      setPlayIndex(0);
      activeIndexRef.current = 0;
      return [focusVideo, ...current];
    });

    setFocusTrigger({ id: focusVideoId, key: targetKey });
  }, [focusVideo, focusVideoId, focusKey]);

  useEffect(() => {
    if (!focusTrigger || !active) return;
    const root = streamRef.current;
    if (!root) return;

    const index = items.findIndex((item) => item.id === focusTrigger.id);
    if (index < 0) return;

    const card = root.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
    if (card) {
      root.style.scrollBehavior = "auto";
      root.style.scrollSnapType = "none";
      root.scrollTop = card.offsetTop;
      setActiveIndex(index);
      setPlayIndex(index);
      activeIndexRef.current = index;
      window.requestAnimationFrame(() => {
        if (root) {
          root.style.scrollSnapType = "";
          root.style.scrollBehavior = "";
        }
      });
      setFocusTrigger(null);
      onFocusConsumed?.();
    } else {
      const rafId = window.requestAnimationFrame(() => {
        const retryCard = root.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
        if (retryCard) {
          root.style.scrollBehavior = "auto";
          root.style.scrollSnapType = "none";
          root.scrollTop = retryCard.offsetTop;
          setActiveIndex(index);
          setPlayIndex(index);
          activeIndexRef.current = index;
          window.requestAnimationFrame(() => {
            if (root) {
              root.style.scrollSnapType = "";
              root.style.scrollBehavior = "";
            }
          });
          setFocusTrigger(null);
          onFocusConsumed?.();
        }
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [active, focusTrigger, items, onFocusConsumed]);

  const scrollToVideo = (index: number, behavior: ScrollBehavior = "smooth") => {
    if (index < 0 || index >= items.length) return;
    const root = streamRef.current;
    if (!root) return;
    const targetCard = root.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior, block: "start" });
    }
  };

  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Restore scroll position to active video instantly when returning to feed tab
  useEffect(() => {
    if (!active) return;
    // When a focus request is in flight, do not restore previous scroll position
    if (focusTrigger) return;
    const root = streamRef.current;
    const targetIndex = activeIndexRef.current;
    if (!root || targetIndex <= 0) return;

    const restore = () => {
      if (focusTrigger) return;
      const targetCard = root.querySelector<HTMLElement>(`[data-feed-index="${targetIndex}"]`);
      if (targetCard) {
        root.style.scrollBehavior = "auto";
        root.style.scrollSnapType = "none";
        root.scrollTop = targetCard.offsetTop;
        window.requestAnimationFrame(() => {
          root.style.scrollSnapType = "";
          root.style.scrollBehavior = "";
        });
      }
    };

    restore();
    const rafId = window.requestAnimationFrame(restore);
    const timerId = window.setTimeout(restore, 30);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [active, focusTrigger]);

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

  const reloadFeed = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "20", cursor: "0" });
      const data = await apiFetch<FeedResponse>(`/api/feed?${params}`);
      setSeed(data.seed);
      setCursor(data.next_cursor);
      setItems(data.items);
      setActiveIndex(0);
      setPlayIndex(0);
      if (streamRef.current) {
        streamRef.current.scrollTo({ top: 0, behavior: "instant" });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "피드를 불러오지 못했습니다.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handlePull = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; done?: () => void }>;
      if (customEvent.detail?.tab === "feed") {
        void reloadFeed().finally(() => {
          customEvent.detail?.done?.();
        });
      }
    };
    window.addEventListener("loopine:pull-refresh", handlePull);
    return () => window.removeEventListener("loopine:pull-refresh", handlePull);
  }, [reloadFeed]);

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
      if (!activeTabRef.current) return;
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
            const saved = video.saved_status === "READY" || video.saved_status === "PROCESSING";
            const blocked = blockedVideoIds.includes(video.youtube_video_id);
            const showPlayer = index === playIndex && !blocked;
            return <article className="feed-card" key={video.id} data-feed-index={index}>
              <div className="feed-media">
                {showPlayer
                  ? <div className="feed-player-host" ref={playerHostRef} />
                  : <><img src={video.thumbnail_url} alt="" /><span className="feed-play"><Play fill="currentColor" /></span></>
                }
                {blocked && index === playIndex && (
                  <div className="feed-blocked" role="status">
                    <CircleAlert size={22} />
                    <p>여기서는 이 영상을 재생할 수 없어요.<br />YouTube에서 열면 바로 볼 수 있습니다.</p>
                    <div className="feed-blocked-actions">
                      <button type="button" className="feed-blocked-open" onClick={() => openOnYouTube(video.youtube_video_id)}>
                        YouTube에서 열기
                      </button>
                      <button type="button" className="feed-blocked-retry" onClick={() => retryVideo(video.youtube_video_id)}>
                        다시 시도
                      </button>
                    </div>
                  </div>
                )}
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
                  <button className="feed-learn" onClick={() => { sendEvent(video, "OPEN_LEARNING"); openLearning(video); }}><Play size={17} fill="currentColor" /> 바로 학습</button>
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
