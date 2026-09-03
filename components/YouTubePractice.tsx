"use client";

import Script from "next/script";
import { MouseEvent as ReactMouseEvent, TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Languages, LoaderCircle, Mic, Pause, Play, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isMobileDeviceRuntime, isNativeAppRuntime } from "@/lib/nativeRuntime";
import { useYouTubeStore, youtubeStore } from "@/lib/youtubeStore";
import type { TranscriptSegment } from "@/lib/youtubeStore";
import type { LearningPresetOptions, LearningSessionEntry, SpeechComparison } from "@/lib/learningSession";
import { LearningSessionHeader } from "./LearningSessionHeader";
import { SpeechPracticeSheet } from "./SpeechPracticeSheet";

type TranslationResponse = {
  segment_id: string;
  video_id: string;
  source_text: string;
  translation: string;
  model: string;
  cached: boolean;
};

type TranslationPanelState = {
  segment: TranscriptSegment;
  result: TranslationResponse | null;
  loading: boolean;
  error: string;
  left: number;
  top: number;
};

export type GrammarChunk = {
  text: string;
  label: string;
  meaning: string;
};

type NativeTranslationUpdate = {
  translation?: string;
  selectionText?: string;
  selectionTranslation?: string;
  loading?: boolean;
  error?: string;
};

type NativeTranslationBridge = {
  present: (payload: {
    segmentId: string;
    sourceText: string;
    translation: string;
    loading: boolean;
    error: string;
    grammarChunks: GrammarChunk[];
  }) => void;
  update?: (payload: NativeTranslationUpdate) => void;
  notify?: (payload: { message: string; kind?: "success" | "error" }) => void;
};

type AndroidTranslationHost = {
  present: (payload: string) => void;
  update?: (payload: string) => void;
  notify?: (payload: string) => void;
};

type YouTubePlayer = {
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, number | string>;
          events?: { onReady?: () => void };
        },
      ) => YouTubePlayer;
    };
    LoopineNativeTranslation?: NativeTranslationBridge;
    LoopineNativeTranslationHost?: AndroidTranslationHost;
  }
}

function getNativeTranslationBridge(): NativeTranslationBridge | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.LoopineNativeTranslation?.present) return window.LoopineNativeTranslation;
  const host = window.LoopineNativeTranslationHost;
  if (!host?.present) return undefined;
  return {
    present: (payload) => host.present(JSON.stringify(payload)),
    update: (payload) => host.update?.(JSON.stringify(payload)),
    notify: (payload) => host.notify?.(JSON.stringify(payload)),
  };
}

const GRAMMAR_CHUNK_PATTERNS: Array<{ pattern: RegExp; label: string; meaning: string }> = [
  { pattern: /\b(?:have|has|had) to\b/gi, label: "have to", meaning: "~해야 한다 · 의무/필요" },
  { pattern: /\b(?:am|is|are|was|were) going to\b/gi, label: "be going to", meaning: "~할 예정이다 · 계획" },
  { pattern: /\bused to\b/gi, label: "used to", meaning: "예전에는 ~하곤 했다" },
  { pattern: /\bwould like to\b/gi, label: "would like to", meaning: "~하고 싶다 · 공손한 표현" },
  { pattern: /\b(?:am|is|are|was|were) supposed to\b/gi, label: "be supposed to", meaning: "~하기로 되어 있다" },
  { pattern: /\b(?:need|needs|needed) to\b/gi, label: "need to", meaning: "~할 필요가 있다" },
  { pattern: /\b(?:want|wants|wanted) to\b/gi, label: "want to", meaning: "~하고 싶다" },
  { pattern: /\bmake sure\b/gi, label: "make sure", meaning: "반드시 확인하다" },
  { pattern: /\bas soon as\b/gi, label: "as soon as", meaning: "~하자마자" },
  { pattern: /\beven though\b/gi, label: "even though", meaning: "비록 ~이지만" },
  { pattern: /\bkind of\b/gi, label: "kind of", meaning: "약간 · 어느 정도" },
  { pattern: /\ba lot of\b/gi, label: "a lot of", meaning: "많은" },
  { pattern: /\b(?:there is|there are|there was|there were)\b/gi, label: "there be", meaning: "~이 있다" },
];

export function findGrammarChunks(sourceText: string): GrammarChunk[] {
  const chunks: GrammarChunk[] = [];
  const seen = new Set<string>();
  for (const { pattern, label, meaning } of GRAMMAR_CHUNK_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of sourceText.matchAll(pattern)) {
      const text = match[0].trim();
      const key = `${label}:${text.toLowerCase()}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      chunks.push({ text, label, meaning });
    }
  }
  return chunks;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function effectiveSegmentEnd(segments: TranscriptSegment[], index: number) {
  const segment = segments[index];
  if (!segment) return 0;

  const wordCount = segment.text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.max(1.2, Math.min(12, wordCount / 2.4 + 0.45));
  const reportedDuration = Math.max(0, segment.end - segment.start);
  if (reportedDuration >= estimatedDuration * 0.6) return segment.end;

  const estimatedEnd = segment.start + estimatedDuration;
  const nextStart = segments[index + 1]?.start;
  if (nextStart != null && nextStart > segment.start + 0.25) {
    return Math.max(segment.start + 0.25, Math.min(nextStart - 0.08, estimatedEnd));
  }
  return Math.max(segment.end, estimatedEnd);
}

type TranslationPlatform = "ios" | "android" | "web";

function useMobileTranslationUi() {
  const [mobile, setMobile] = useState(false);
  const [platform, setPlatform] = useState<TranslationPlatform>("web");

  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 767px)");
    const capacitor = (window as typeof window & {
      Capacitor?: {
        getPlatform?: () => string;
        isNativePlatform?: () => boolean;
      };
    }).Capacitor;
    const update = () => {
      setMobile(isNativeAppRuntime(capacitor, navigator.userAgent) || query?.matches === true);
      const capacitorPlatform = capacitor?.getPlatform?.();
      const isIPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      if (capacitorPlatform === "ios" || /iPad|iPhone|iPod/i.test(navigator.userAgent) || isIPadOs) {
        setPlatform("ios");
      } else if (capacitorPlatform === "android" || /Android/i.test(navigator.userAgent)) {
        setPlatform("android");
      } else {
        setPlatform("web");
      }
    };
    update();
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, []);

  return { mobile, platform };
}

export function YouTubePractice({ entry, presets, onChangeContent, onEndSession, onSessionEntryChange, onOpenReview, onNextRoutine }: {
  entry: LearningSessionEntry;
  presets: LearningPresetOptions;
  onChangeContent: () => void;
  onEndSession: () => void;
  onSessionEntryChange: (entry: LearningSessionEntry) => void;
  onOpenReview: () => void;
  onNextRoutine: () => void;
}) {
  const [storeState, setStoreState, loadTranscript] = useYouTubeStore();
  const {
    videoId,
    transcript,
    selectedIndex,
    repeatTarget,
    playbackRate,
    loading,
    jobProgress,
    jobProvider,
    executionTarget,
    error,
  } = storeState;

  const [completedRepeats, setCompletedRepeats] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [loopPaused, setLoopPaused] = useState(false);
  const [showTranscriptText, setShowTranscriptText] = useState(true);
  const [speechOpen, setSpeechOpen] = useState(false);
  const [nextLineHint, setNextLineHint] = useState(false);
  const [practicedLines, setPracticedLines] = useState<Set<string>>(new Set());
  const [savedLines, setSavedLines] = useState<Set<string>>(new Set());
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [retryLines, setRetryLines] = useState<Set<string>>(new Set());
  const [missingWords, setMissingWords] = useState<Set<string>>(new Set());
  const [sessionMessage, setSessionMessage] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [translationPanel, setTranslationPanel] = useState<TranslationPanelState | null>(null);
  const { mobile: mobileTranslationUi, platform: translationPlatform } = useMobileTranslationUi();
  const mobileTranslationSheetOpen = mobileTranslationUi && translationPanel !== null;

  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      setIsMobileDevice(isMobileDeviceRuntime(navigator.userAgent, navigator.maxTouchPoints || 0, capacitor));
    }
  }, []);

  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerFrameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const latestVideoIdRef = useRef(videoId);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
  const completedRef = useRef(0);
  const translateClickRef = useRef(0);
  const nativeSelectionCacheRef = useRef(new Map<string, string>());
  const nativeSelectionRequestRef = useRef(0);
  const activeTabRef = useRef(true);
  const touchStartRef = useRef(0);
  const transcriptListRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    latestVideoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    const sourceUrl = entry.youtubeUrl || entry.content?.source_url;
    if (!sourceUrl) return;
    const state = youtubeStore.getState();
    const sameVideo = state.videoId && sourceUrl.includes(state.videoId);
    if (!sameVideo && !state.loading) void loadTranscript(sourceUrl);
  }, [entry.content?.source_url, entry.youtubeUrl, loadTranscript]);

  useEffect(() => {
    if (!transcript?.segments.length || !entry.transcriptLineId) return;
    const targetIndex = transcript.segments.findIndex((segment) => segment.id === entry.transcriptLineId);
    if (targetIndex >= 0 && targetIndex !== selectedIndex) setStoreState({ selectedIndex: targetIndex });
  }, [entry.transcriptLineId, selectedIndex, setStoreState, transcript]);

  useEffect(() => {
    if (!presets.repeats.includes(repeatTarget)) setStoreState({ repeatTarget: presets.repeats[0] });
    if (!presets.speeds.includes(playbackRate)) setStoreState({ playbackRate: presets.speeds[1] });
  }, [playbackRate, presets, repeatTarget, setStoreState]);

  useEffect(() => {
    if (!mobileTranslationSheetOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    const previousRootStyle = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
      scrollBehavior: root.style.scrollBehavior,
    };

    root.classList.add("translation-sheet-open");
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    root.style.scrollBehavior = "auto";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      root.classList.remove("translation-sheet-open");
      Object.assign(body.style, previousBodyStyle);
      root.style.overflow = previousRootStyle.overflow;
      root.style.overscrollBehavior = previousRootStyle.overscrollBehavior;
      if (window.scrollY !== scrollY) {
        window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      }
      root.style.scrollBehavior = previousRootStyle.scrollBehavior;
    };
  }, [mobileTranslationSheetOpen]);

  useEffect(() => {
    if (!translationPanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTranslationPanel(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [translationPanel]);

  useEffect(() => {
    const handleTabVisibility = (event: CustomEvent<{ tab: string; active: boolean }>) => {
      if (!event.detail.active) {
        setTranslationPanel(null);
        setSpeechOpen(false);
      }
    };
    window.addEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    return () => {
      window.removeEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    };
  }, []);

  useEffect(() => {
    const handleNativeTranslationAction = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{
        action?: "selection" | "save";
        segmentId?: string;
        text?: string;
      }>;
      const { action, segmentId, text: rawText } = event.detail || {};
      const sourceText = rawText?.replace(/\s+/g, " ").trim() || "";
      const segment = transcript?.segments.find((item) => item.id === segmentId);
      const bridge = getNativeTranslationBridge();
      if (!action || !segment || !sourceText || sourceText.length > 300 || !bridge) return;

      const translateSelection = async () => apiFetch<TranslationResponse>(
        `/api/v1/transcript/segments/${segment.id}/translate`,
        { method: "POST", body: JSON.stringify({ video_id: videoId, selection_text: sourceText }) },
      );

      if (action === "selection") {
        nativeSelectionRequestRef.current += 1;
        const requestId = nativeSelectionRequestRef.current;
        bridge.update?.({
          selectionText: sourceText,
          selectionTranslation: "번역하는 중…",
        });
        void (async () => {
          try {
            const cacheKey = `${segment.id}:${sourceText.toLowerCase()}`;
            const cached = nativeSelectionCacheRef.current.get(cacheKey);
            const result = cached
              ? { translation: cached }
              : sourceText === segment.text && segment.translation
                ? { translation: segment.translation }
                : await translateSelection();
            if (nativeSelectionRequestRef.current !== requestId) return;
            nativeSelectionCacheRef.current.set(cacheKey, result.translation);
            bridge.update?.({
              selectionText: sourceText,
              selectionTranslation: result.translation,
            });
          } catch (caught) {
            if (nativeSelectionRequestRef.current !== requestId) return;
            bridge.update?.({
              selectionText: sourceText,
              selectionTranslation: caught instanceof Error ? caught.message : "선택한 구절을 번역하지 못했습니다.",
            });
          }
        })();
        return;
      }

      void (async () => {
        try {
          const cacheKey = `${segment.id}:${sourceText.toLowerCase()}`;
          const cached = nativeSelectionCacheRef.current.get(cacheKey);
          const result = cached
            ? { translation: cached }
            : sourceText === segment.text && segment.translation
              ? { translation: segment.translation }
              : await translateSelection();
          await apiFetch("/api/expressions", {
            method: "POST",
            body: JSON.stringify({
              canonical_text: sourceText,
              korean_meaning: result.translation,
              example_sentence: segment.text,
              category: "YOUTUBE_VOCAB",
              level: "B1",
              tags: ["youtube", "selected-text", videoId],
            }),
          });
          bridge.notify?.({ message: "단어장과 복습 목록에 저장했어요.", kind: "success" });
        } catch (caught) {
          bridge.notify?.({
            message: caught instanceof Error ? caught.message : "단어장에 저장하지 못했습니다.",
            kind: "error",
          });
        }
      })();
    };

    window.addEventListener("loopine:native-translation-action", handleNativeTranslationAction);
    return () => window.removeEventListener("loopine:native-translation-action", handleNativeTranslationAction);
  }, [transcript, videoId]);

  const clearLoopTimers = useCallback(() => {
    if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    loopTimerRef.current = null;
    transitionTimerRef.current = null;
    transitioningRef.current = false;
  }, []);

  const stopLoop = useCallback(
    (returnToStart = false) => {
      clearLoopTimers();
      setIsLooping(false);
      setLoopPaused(false);
      const player = playerRef.current;
      player?.pauseVideo();
      if (returnToStart && transcript?.segments[selectedIndex]) {
        player?.seekTo(transcript.segments[selectedIndex].start, true);
      }
    },
    [clearLoopTimers, selectedIndex, transcript]
  );

  useEffect(() => {
    const handleTabVisibility = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ tab?: string; active?: boolean }>;
      if (event.detail?.tab !== "learn") return;
      activeTabRef.current = event.detail.active === true;
      if (!activeTabRef.current) stopLoop(false);
    };
    const pauseForBackground = () => {
      activeTabRef.current = false;
      stopLoop(false);
    };
    window.addEventListener("loopine:tab-visibility", handleTabVisibility);
    window.addEventListener("loopine:app-background", pauseForBackground);
    return () => {
      window.removeEventListener("loopine:tab-visibility", handleTabVisibility);
      window.removeEventListener("loopine:app-background", pauseForBackground);
    };
  }, [stopLoop]);

  useEffect(() => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      setApiReady(true);
    };
    if (window.YT?.Player) setApiReady(true);
    return () => {
      window.onYouTubeIframeAPIReady = previousReadyHandler;
    };
  }, []);

  useEffect(() => {
    if (!apiReady || !window.YT?.Player || !playerHostRef.current || playerRef.current) return;
    playerRef.current = new window.YT.Player(playerHostRef.current, {
      videoId: latestVideoIdRef.current,
      host: "https://www.youtube-nocookie.com",
      // controls: 0: 구간 반복(시작 지점 이동) 시 유튜브 재생 버튼, 자막 버튼, 상단/하단 UI가 자동으로 팝업되는 현상을 완전히 제거
      // cc_load_policy: 0 / iv_load_policy: 3: 플레이어 내부 자막 및 안내 레이어 비활성화 (웹 앱 자체 자막 리스트 사용)
      // modestbranding: 1 / rel: 0: 유튜브 로고 및 추천 영상 노출 최소화
      playerVars: { controls: 0, cc_load_policy: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
      events: { onReady: () => setPlayerReady(true) },
    });
    return () => {
      clearLoopTimers();
      setPlayerReady(false);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apiReady, clearLoopTimers]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    if (typeof playerRef.current.cueVideoById === "function") {
      try {
        playerRef.current.cueVideoById(videoId);
      } catch (err) {
        console.warn("cueVideoById error:", err);
      }
    }
  }, [playerReady, videoId]);

  useEffect(() => {
    if (playerReady && typeof playerRef.current?.setPlaybackRate === "function") {
      try {
        playerRef.current.setPlaybackRate(playbackRate);
      } catch {
        // Ignore playback rate errors if buffering
      }
    }
  }, [playerReady, playbackRate]);

  function startLoop(index = selectedIndex, revealWorkspace = false) {
    const segment = transcript?.segments[index];
    const player = playerRef.current;
    if (!segment) return;
    setTranslationPanel(null);
    setStoreState({ selectedIndex: index, error: "" });
    setCompletedRepeats(0);
    setLoopPaused(false);
    setNextLineHint(false);
    completedRef.current = 0;
    clearLoopTimers();

    if (revealWorkspace) {
      window.setTimeout(() => playerFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }

    if (!player || !playerReady || typeof player.seekTo !== "function" || typeof player.playVideo !== "function") {
      setStoreState({ error: "YouTube 플레이어를 준비하고 있습니다. 잠시 후 다시 눌러주세요." });
      return;
    }

    setIsLooping(true);
    const segmentEnd = effectiveSegmentEnd(transcript.segments, index);
    player.setPlaybackRate(playbackRate);
    player.seekTo(segment.start, true);
    player.playVideo();

    loopTimerRef.current = setInterval(() => {
      if (transitioningRef.current || player.getCurrentTime() < segmentEnd + 0.05) return;
      const nextCount = completedRef.current + 1;
      completedRef.current = nextCount;
      setCompletedRepeats(nextCount);

      if (nextCount >= repeatTarget) {
        clearLoopTimers();
        player.pauseVideo();
        setIsLooping(false);
        setLoopPaused(false);
        setPracticedLines((current) => new Set(current).add(segment.id));
        setNextLineHint(index < transcript.segments.length - 1);
        return;
      }

      transitioningRef.current = true;
      player.seekTo(segment.start, true);
      player.playVideo();
      transitionTimerRef.current = setTimeout(() => {
        transitioningRef.current = false;
      }, 350);
    }, 100);
  }

  function pauseResumeLoop() {
    const player = playerRef.current;
    if (!player || !isLooping) return;
    if (loopPaused) {
      player.playVideo();
      setLoopPaused(false);
    } else {
      player.pauseVideo();
      setLoopPaused(true);
    }
  }

  function selectSegment(index: number, play = true, revealWorkspace = true) {
    if (!transcript?.segments[index]) return;
    if (isLooping) stopLoop(false);
    setStoreState({ selectedIndex: index });
    setNextLineHint(false);
    const segment = transcript.segments[index];
    onSessionEntryChange({ ...entry, transcriptLineId: segment.id });
    window.requestAnimationFrame(() => {
      const container = transcriptListRef.current;
      const selectedButton = container?.querySelector<HTMLElement>(`[data-line-index="${index}"]`);
      const selectedItem = selectedButton?.closest("li") || selectedButton;
      if (selectedItem && container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (itemRect.top - containerRect.top);
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
      }
      if (revealWorkspace) {
        window.setTimeout(() => playerFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    });
    if (play) window.setTimeout(() => startLoop(index), 0);
  }

  function handleSentenceSwipeEnd(event: TouchEvent<HTMLElement>) {
    const distance = event.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(distance) < 45) return;
    selectSegment(
      Math.max(0, Math.min((transcript?.segments.length || 1) - 1, selectedIndex + (distance < 0 ? 1 : -1))),
      true,
      true
    );
  }

  async function saveSelectedExpression() {
    const segment = transcript?.segments[selectedIndex];
    if (!segment || savingSegmentId === segment.id) return;
    setSavingSegmentId(segment.id);
    try {
      if (savedLines.has(segment.id)) {
        try {
          await apiFetch(`/api/review/saved-items/${segment.id}`, { method: "DELETE" });
        } catch {
          // Unsaving locally still updates UI if API fails
        }
        setSavedLines((current) => {
          const next = new Set(current);
          next.delete(segment.id);
          return next;
        });
        setSessionMessage("복습 목록에서 문장 저장을 취소했어요.");
        return;
      }
      let translation = segment.translation || "복습할 문장";
      if (!segment.translation) {
        try {
          const result = await apiFetch<TranslationResponse>(`/api/v1/transcript/segments/${segment.id}/translate`, { method: "POST", body: JSON.stringify({ video_id: videoId }) });
          translation = result.translation;
        } catch {
          // Saving the English sentence must still work when translation is temporarily unavailable.
        }
      }
      await apiFetch("/api/expressions", {
        method: "POST",
        body: JSON.stringify({
          canonical_text: segment.text,
          korean_meaning: translation,
          example_sentence: segment.text,
          category: "YOUTUBE_VOCAB",
          level: entry.content?.level || "B1",
          tags: ["youtube", videoId, `content:${entry.contentId || videoId}`, `transcript:${segment.id}`],
          source_content_id: entry.contentId || videoId,
          source_transcript_line_id: segment.id,
        }),
      });
      setSavedLines((current) => new Set(current).add(segment.id));
      setSessionMessage("선택한 문장을 영상과 자막 위치에 연결해 복습 목록에 저장했어요.");
    } finally {
      setSavingSegmentId(null);
    }
  }

  function panelPosition(event?: ReactMouseEvent<HTMLElement>) {
    if (!event || mobileTranslationUi) {
      return { left: Math.round(window.innerWidth / 2), top: Math.round(window.innerHeight / 2) };
    }
    return {
      left: Math.max(176, Math.min(window.innerWidth - 176, event.clientX)),
      top: Math.max(160, Math.min(window.innerHeight - 160, event.clientY)),
    };
  }

  async function requestSegmentTranslation(
    segment: TranscriptSegment,
    event?: ReactMouseEvent<HTMLElement>,
  ) {
    const now = Date.now();
    if (now - translateClickRef.current < 500) return;
    translateClickRef.current = now;
    const position = panelPosition(event);
    const nativeBridge = mobileTranslationUi ? getNativeTranslationBridge() : undefined;
    const nativePayload = (translation = "", loading = false, error = "") => ({
      segmentId: segment.id,
      sourceText: segment.text,
      translation,
      loading,
      error,
      grammarChunks: findGrammarChunks(segment.text),
    });
    if (!segment.id) {
      if (nativeBridge?.present) {
        nativeBridge.present(nativePayload("", false, "이 자막은 이전 캐시 데이터입니다. 자막을 다시 불러와 주세요."));
        return;
      }
      setTranslationPanel({
        segment,
        result: null,
        loading: false,
        error: "이 자막은 이전 캐시 데이터입니다. 자막을 다시 불러온 뒤 번역해 주세요.",
        ...position,
      });
      return;
    }
    if (segment.translation) {
      if (nativeBridge?.present) {
        nativeBridge.present(nativePayload(segment.translation));
        return;
      }
      setTranslationPanel({
        segment,
        result: {
          segment_id: segment.id,
          video_id: videoId,
          source_text: segment.text,
          translation: segment.translation,
          model: "DB cache",
          cached: true,
        },
        loading: false,
        error: "",
        ...position,
      });
      return;
    }

    if (nativeBridge?.present) nativeBridge.present(nativePayload("", true));
    else setTranslationPanel({ segment, result: null, loading: true, error: "", ...position });
    try {
      const result = await apiFetch<TranslationResponse>(
        `/api/v1/transcript/segments/${segment.id}/translate`,
        { method: "POST", body: JSON.stringify({ video_id: videoId }) },
      );
      if (nativeBridge?.update) nativeBridge.update({ translation: result.translation, loading: false, error: "" });
      else {
        setTranslationPanel((current) => current?.segment.id === segment.id
          ? { ...current, result, loading: false, error: "" }
          : current);
      }
      if (transcript) {
        setStoreState({
          transcript: {
            ...transcript,
            segments: transcript.segments.map((item) => item.id === segment.id
              ? { ...item, translation: result.translation }
              : item),
          },
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "AI 번역을 불러오지 못했습니다.";
      if (nativeBridge?.update) nativeBridge.update({ loading: false, error: message });
      else {
        setTranslationPanel((current) => current?.segment.id === segment.id
          ? { ...current, loading: false, error: message }
          : current);
      }
    }
  }

  const selected = transcript?.segments[selectedIndex];
  const sessionProgress = transcript?.segments.length ? (practicedLines.size / transcript.segments.length) * 100 : 0;
  const estimatedDurationSeconds = entry.content?.duration_seconds || (transcript?.segments.length || 0) * 5 || 60;
  const remainingMinutes = Math.max(1, Math.ceil((estimatedDurationSeconds * (1 - sessionProgress / 100)) / 60));
  const completionSummary = useMemo(() => ({
    practiced: practicedLines.size,
    saved: savedLines.size,
    retry: retryLines.size,
  }), [practicedLines.size, retryLines.size, savedLines.size]);

  async function completeWorkspace(next: "review" | "routine") {
    setSessionMessage("세션 결과를 저장하는 중이에요…");
    try {
      await apiFetch("/api/learning/sessions/complete", {
        method: "POST",
        body: JSON.stringify({
          content_id: entry.contentId,
          activity_id: entry.activityId || null,
          routine_item_id: entry.routineItemId || null,
          routine_snapshot: entry.routineSnapshot || null,
          entry_source: entry.entrySource,
          practiced_line_count: completionSummary.practiced,
          saved_expression_count: completionSummary.saved,
          retry_line_count: completionSummary.retry,
          missing_words: Array.from(missingWords),
        }),
      });
      if (next === "review") onOpenReview(); else onNextRoutine();
    } catch (caught) {
      setSessionMessage(caught instanceof Error ? caught.message : "세션 결과를 저장하지 못했어요.");
    }
  }

  // SVG Circular progress bar calculations
  const progressVal = Math.max(5, Math.min(100, jobProgress || 5));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * progressVal) / 100;

  const statusDetail =
    progressVal >= 90
      ? "자막 데이터 최종 정리 및 화면 생성 중..."
      : progressVal >= 60
        ? "AI가 음성 대사를 문장별로 정리하고 있어요."
        : progressVal >= 30
          ? "영상 오디오를 추출하여 AI에 전달하고 있어요."
          : jobProvider === "LOCAL_GPU"
            ? "집 3090 GPU 서버에서 정밀하게 분석하고 있어요."
            : executionTarget === "LOCAL_CLOUD"
              ? "로컬 Mac 클라우드 러너에서 분석하고 있어요."
              : executionTarget === "RENDER_CLOUD"
                ? "Render 클라우드 러너에서 분석하고 있어요."
                : "영상 및 자막 정보를 준비하고 있어요.";

  return (
    <>
      <section className="youtube-practice">
        <Script
          src="https://www.youtube.com/iframe_api"
          strategy="afterInteractive"
          onReady={() => {
            if (window.YT?.Player) setApiReady(true);
          }}
          onError={() => setStoreState({ error: "YouTube 플레이어를 불러오지 못했습니다." })}
        />

        <LearningSessionHeader
          entry={entry}
          progress={sessionProgress}
          remainingMinutes={remainingMinutes}
          onChangeContent={onChangeContent}
          onEndSession={onEndSession}
          summary={completionSummary}
          missingWords={missingWords}
          onGoToReview={() => void completeWorkspace("review")}
          onNextRoutine={() => void completeWorkspace("routine")}
        />

        <div className="youtube-frame learning-workspace-scroll-anchor" aria-label="YouTube 학습 영상" ref={playerFrameRef}>
          <div ref={playerHostRef} />
        </div>

        {error && <div className="youtube-error" role="alert">{error}</div>}

        <div className="youtube-loop-settings" aria-label="반복 재생 설정">
          <div>
            <span>반복</span>
            {presets.repeats.map((count) => (
              <button
                key={count}
                type="button"
                className={repeatTarget === count ? "active" : ""}
                onClick={() => {
                  if (isLooping) stopLoop(true);
                  setStoreState({ repeatTarget: count });
                }}
              >
                {count}회
              </button>
            ))}
          </div>
          <div>
            <span>속도</span>
            {presets.speeds.map((rate) => (
              <button
                key={rate}
                type="button"
                className={playbackRate === rate ? "active" : ""}
                onClick={() => setStoreState({ playbackRate: rate })}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="youtube-loading" aria-live="polite">
            <div className="youtube-progress-ring">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="rgba(24, 32, 29, 0.12)"
                  strokeWidth="7"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke="var(--coral)"
                  strokeWidth="7"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{ transition: "stroke-dashoffset 0.4s ease" }}
                />
              </svg>
              <div className="youtube-progress-percent">
                <span>{progressVal}%</span>
              </div>
            </div>

            <strong>영어 대사를 문장으로 정리하는 중…</strong>
            <span>{statusDetail}</span>
          </div>
        )}

        {!loading && !transcript && !error && (
          <div className="youtube-empty-state">
            <p>YouTube 영상 주소를 입력하고 <strong>자막 불러오기</strong>를 누르면 문장별 반복 연습이 시작됩니다.</p>
          </div>
        )}

        {!loading && transcript && selected && (
          <>
            <div className={`youtube-shadowing sentence-swipe-stage ${nextLineHint ? "show-next-hint" : ""}`} onTouchStart={(event) => { touchStartRef.current = event.touches[0].clientX; }} onTouchEnd={handleSentenceSwipeEnd}>
              <div className="selected-line-meta"><p className="eyebrow">LINE {selectedIndex + 1} / {transcript.segments.length} · {formatTime(selected.start)}</p><button className="record-inline-button" onClick={() => setSpeechOpen(true)}><Mic size={16} /> 녹음</button></div>
              <h3
                className={`selectable-text ${!showTranscriptText ? "blurred-text" : ""}`}
                data-segment-id={selected.id}
                onClick={() => {
                  if (!showTranscriptText) {
                    setShowTranscriptText(true);
                  }
                }}
              >
                {selected.text}
              </h3>
              <p className="video-repeat-title">
                {isLooping
                  ? `${loopPaused ? "일시정지" : "구간 반복 중"} · ${completedRepeats} / ${repeatTarget}`
                  : nextLineHint ? "반복 완료 · 옆으로 밀어 다음 문장으로 이동하세요." : "재생을 누르면 이 자막 구간만 반복합니다."}
              </p>
              <div className="current-sentence-tools">
                <button type="button" onClick={(event) => void requestSegmentTranslation(selected, event)} aria-haspopup="dialog"><Languages size={15} /> 번역 보기</button>
                <button
                  type="button"
                  className={savedLines.has(selected.id) ? "saved" : ""}
                  onClick={() => void saveSelectedExpression()}
                  disabled={savingSegmentId === selected.id}
                >
                  {savingSegmentId === selected.id ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Bookmark size={15} fill={savedLines.has(selected.id) ? "currentColor" : "none"} />
                  )}{" "}
                  {savingSegmentId === selected.id
                    ? savedLines.has(selected.id) ? "저장 취소 중…" : "저장 중…"
                    : savedLines.has(selected.id) ? "문장 저장됨" : "문장 저장"}
                </button>
                {/* <button type="button" onClick={() => { setStoreState({ playbackRate: Math.min(playbackRate, 0.75) }); window.setTimeout(() => startLoop(), 0); }}><Volume2 size={15} /> 느리게 듣기</button> */}
                <button type="button" onClick={() => setShowTranscriptText((value) => !value)}>{showTranscriptText ? <EyeOff size={15} /> : <Eye size={15} />} 자막 {showTranscriptText ? "숨기기" : "보기"}</button>
              </div>
              {!isMobileDevice && <div className="sentence-swipe-nav"><button onClick={() => selectSegment(selectedIndex - 1, true, true)} disabled={selectedIndex === 0}><ChevronLeft /></button><span>{nextLineHint ? "다음 문장으로 넘겨보세요" : `${selectedIndex + 1} / ${transcript.segments.length}`}</span><button onClick={() => selectSegment(selectedIndex + 1, true, true)} disabled={selectedIndex === transcript.segments.length - 1}><ChevronRight /></button></div>}
              <div className="youtube-shadow-actions">
                <button type="button" className="primary-button" onClick={() => startLoop(selectedIndex, true)}>
                  {isLooping ? <RotateCcw size={17} /> : <Play size={17} />}{" "}
                  {isLooping ? "처음부터 다시" : `${repeatTarget}회 반복 시작`}
                </button>
                <button
                  type="button"
                  className="icon-toggle"
                  aria-label={loopPaused ? "반복 재생 이어서 재생" : "반복 재생 일시정지"}
                  disabled={!isLooping}
                  onClick={pauseResumeLoop}
                >
                  {loopPaused ? <Play size={17} /> : <Pause size={17} />}
                </button>
              </div>
            </div>

            <div className="youtube-transcript-list" aria-label="영상 자막 목록">
              <div className="youtube-transcript-head">
                <div>
                  <p className="eyebrow">FULL TRANSCRIPT</p>
                  <strong>연습할 문장을 선택하세요</strong>
                </div>
                <small>누르면 바로 {repeatTarget}회 반복</small>
              </div>
              <ol className="transcript-list" ref={transcriptListRef}>
                {transcript.segments.map((segment, index) => (
                  <li key={`${segment.start}-${index}`}>
                    {segment.scene && (index === 0 || transcript.segments[index - 1]?.scene !== segment.scene) && (
                      <p className="youtube-scene-label">장면 {segment.scene}</p>
                    )}
                    <button
                      type="button"
                      data-line-index={index}
                      className={selectedIndex === index ? "active" : ""}
                      onClick={() => selectSegment(index, true, true)}
                    >
                      <time>{formatTime(segment.start)}</time>
                      <span>{segment.text}</span>
                      <Play size={14} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        <p className="youtube-copyright">
          개인 학습용 비공식 연동입니다. 영상은 공식 YouTube 플레이어로 재생하며, 내려받은 임시 오디오는 전사 직후 삭제하고
          재처리 방지를 위한 문장 데이터만 서버에 캐시합니다.
        </p>
        {sessionMessage && <p className="save-message" role="status">{sessionMessage}</p>}
      </section>
      {selected && <SpeechPracticeSheet
        open={speechOpen}
        entry={entry}
        lineId={selected.id}
        referenceText={selected.text}
        onClose={() => setSpeechOpen(false)}
        onListen={(slow) => {
          if (slow) setStoreState({ playbackRate: Math.min(playbackRate, 0.75) });
          window.setTimeout(() => startLoop(), 0);
        }}
        onSaved={(comparison: SpeechComparison) => {
          setPracticedLines((current) => new Set(current).add(selected.id));
          if (comparison.missingWords.length || comparison.differentWords.length) setRetryLines((current) => new Set(current).add(selected.id));
          else setRetryLines((current) => { const next = new Set(current); next.delete(selected.id); return next; });
          setMissingWords((current) => new Set([...current, ...comparison.missingWords]));
        }}
      />}
      {portalReady && translationPanel && createPortal(
        <div
          className={`translation-layer ${mobileTranslationUi ? `mobile ${translationPlatform}` : "desktop"}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTranslationPanel(null);
          }}
        >
          <section
            className="translation-panel"
            role="dialog"
            aria-modal={mobileTranslationUi}
            aria-labelledby="translation-panel-title"
          >
            {mobileTranslationUi && <div className="translation-sheet-handle" aria-hidden="true" />}
            <header>
              <div>
                {!mobileTranslationUi && <p className="eyebrow"><Sparkles size={12} /> AI TRANSLATION</p>}
                <h3 id="translation-panel-title">{mobileTranslationUi ? "번역" : "자연스러운 한국어 표현"}</h3>
              </div>
              <button type="button" onClick={() => setTranslationPanel(null)} aria-label="번역 닫기">
                <X size={19} />
              </button>
            </header>
            <div className="translation-content-card">
              <div className="translation-copy original">
                <span>다음으로 감지됨 · 영어</span>
                <p className="selectable-text" data-segment-id={translationPanel.segment.id} lang="en">
                  {translationPanel.segment.text}
                </p>
              </div>
              <div className="translation-copy korean" aria-live="polite">
                <span>한국어</span>
                {translationPanel.loading && (
                  <p className="translation-loading"><LoaderCircle className="spin" size={17} /> 문맥에 맞게 번역하는 중…</p>
                )}
                {!translationPanel.loading && translationPanel.result && (
                  <p className="selectable-text" lang="ko">{translationPanel.result.translation}</p>
                )}
                {!translationPanel.loading && translationPanel.error && (
                  <div className="translation-error" role="alert">
                    <p>{translationPanel.error}</p>
                    <button
                      type="button"
                      onClick={(event) => {
                        translateClickRef.current = 0;
                        void requestSegmentTranslation(translationPanel.segment, event);
                      }}
                    >
                      다시 시도
                    </button>
                  </div>
                )}
              </div>
            </div>
            {findGrammarChunks(translationPanel.segment.text).length > 0 && (
              <div className="translation-grammar">
                <strong>문법 덩어리</strong>
                <div>
                  {findGrammarChunks(translationPanel.segment.text).map((chunk) => (
                    <span key={`${chunk.label}-${chunk.text}`}>
                      <b>{chunk.text}</b>
                      <small>{chunk.meaning}</small>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <footer>
              {/* [refactor]: 다음 정보가 뜨도록 수정 */}
              {/* <span>{translationPanel.result?.cached ? "DB 캐시에서 즉시 불러옴" : "최초 번역은 DB에 안전하게 저장됩니다"}</span> */}
              <span>선택한 구절은 기기 번역 메뉴를 사용하고, 전체 문장은 Loopine 번역으로 저장됩니다.</span>
              {mobileTranslationUi && (
                <small>
                  {translationPlatform === "ios"
                    ? "앱에서는 영어 문구를 드래그하면 선택한 구절만 기기 번역으로 자동 표시됩니다."
                    : translationPlatform === "android"
                      ? "영어 문구를 길게 누르고 범위를 조절한 뒤 ‘기기 번역’을 선택하세요."
                      : "영어 문구를 드래그하여 원하는 범위를 지정할 수 있어요."}
                </small>
              )}
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
