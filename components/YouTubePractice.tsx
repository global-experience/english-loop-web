"use client";

import Script from "next/script";
import { MouseEvent as ReactMouseEvent, TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronLeft, ChevronRight, Eye, EyeOff, Languages, LoaderCircle, Mic, Pause, Play, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cancelRoutineReminderOccurrence } from "@/lib/nativeReminders";
import { isMobileDeviceRuntime, isNativeAppRuntime } from "@/lib/nativeRuntime";
import { useYouTubeStore, youtubeStore } from "@/lib/youtubeStore";
import type { TranscriptSegment } from "@/lib/youtubeStore";
import type { LearningPresetOptions, LearningSessionEntry, SpeechComparison } from "@/lib/learningSession";
import { useBodyScrollLock } from "@/lib/useMobileUi";
import { speakEnglish } from "@/lib/speech";
import { useSheetDragToClose } from "@/lib/sheetDrag";
import { routineCompletionProgress } from "@/lib/routineCompletion";
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
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: (event: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
    };
    LoopineNativeTranslation?: NativeTranslationBridge;
    LoopineNativeTranslationHost?: AndroidTranslationHost;
    /** 재생 정밀도 실측. 콘솔에서 `window.__loopineTiming` 으로 읽는다. */
    __loopineTiming?: PlaybackTimingSample[];
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

/**
 * 실제 재생기가 세그먼트 창을 얼마나 지키는지 잰다.
 *
 * `seekLanding` 은 seekTo 뒤 첫 프레임의 currentTime − start (키프레임에 걸리면
 * 음수·양수로 튄다), `stopOvershoot` 는 pause 직후 currentTime − end (폴링 주기
 * + 정지 명령 지연). 이 둘을 모르면 자막 정렬을 아무리 고쳐도 "뒤 대사가
 * 들린다" 가 모델 탓인지 재생기 탓인지 가를 수 없다. 기기별로 다르므로 실기기
 * 콘솔에서 읽는다 — 폴링 주기를 줄였다고 해결됐다고 보지 않기 위한 장치다.
 */
export type PlaybackTimingSample = {
  segmentId: string;
  playbackRate: number;
  seekLanding: number | null;
  stopOvershoot: number | null;
  at: number;
};

const TIMING_SAMPLE_LIMIT = 200;

export function recordPlaybackTiming(sample: PlaybackTimingSample) {
  if (typeof window === "undefined") return;
  const samples = (window.__loopineTiming ||= []);
  samples.push(sample);
  if (samples.length > TIMING_SAMPLE_LIMIT) samples.splice(0, samples.length - TIMING_SAMPLE_LIMIT);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[loopine timing]", sample);
  }
}

export function effectiveSegmentEnd(segments: TranscriptSegment[], index: number) {
  const segment = segments[index];
  if (!segment) return 0;

  // 발화 경계가 있으면 서버가 이웃 간격까지 보고 재생 창을 확정한 것이다.
  // 여기서 단어 수로 다시 늘리면 그 정책을 무효로 만들고, 뒤 대사가 들린다.
  if (segment.speech_end != null) return segment.end;

  // ── legacy: 발화 경계가 없는 옛 캐시. 퍼블리셔 자막의 큐 길이가 실제 발화보다
  //    짧게 신고되던 문제를 단어 수로 보정한다. 새 결과에는 적용하지 않는다.
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

export function YouTubePractice({ active = true, entry, presets, onChangeContent, onEndSession, onSessionEntryChange, onOpenReview, onNextRoutine, onRefresh = async () => undefined }: {
  active?: boolean;
  entry: LearningSessionEntry;
  presets: LearningPresetOptions;
  onChangeContent: () => void;
  onEndSession: () => void;
  onSessionEntryChange: (entry: LearningSessionEntry) => void;
  onOpenReview: () => void;
  onNextRoutine: () => void;
  onRefresh?: () => Promise<void>;
}) {
  const clientSessionIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `learn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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
  /**
   * 네이티브 시트에서 오는 이벤트 핸들러는 `transcript`/`videoId` 가 바뀔 때만
   * 다시 등록된다. 그 시점에는 플레이어가 아직 준비되지 않았으므로, 상태 변수를
   * 그대로 읽으면 영원히 `false` 인 값을 보게 된다(스테일 클로저). 호출 시점의
   * 진짜 값을 읽어야 해서 ref 로 함께 들고 간다.
   */
  const playerReadyRef = useRef(false);
  const [isLooping, setIsLooping] = useState(false);
  const [loopPaused, setLoopPaused] = useState(false);
  const [showTranscriptText, setShowTranscriptText] = useState(
    entry.routineConfig?.subtitleMode !== "hidden" && entry.routineSnapshot?.config?.subtitleMode !== "hidden",
  );
  const [speechOpen, setSpeechOpen] = useState(false);
  const [nextLineHint, setNextLineHint] = useState(false);
  const [practicedLines, setPracticedLines] = useState<Set<string>>(new Set());
  const [spokenLines, setSpokenLines] = useState<Set<string>>(new Set());
  const [recalledLines, setRecalledLines] = useState<Set<string>>(new Set());
  const [savedLines, setSavedLines] = useState<Set<string>>(new Set());
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [retryLines, setRetryLines] = useState<Set<string>>(new Set());
  const [missingWords, setMissingWords] = useState<Set<string>>(new Set());
  const [sessionMessage, setSessionMessage] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [translationPanel, setTranslationPanel] = useState<TranslationPanelState | null>(null);
  const { mobile: mobileTranslationUi, platform: translationPlatform } = useMobileTranslationUi();
  const mobileTranslationSheetOpen = mobileTranslationUi && translationPanel !== null;
  const closeTranslationPanel = useCallback(() => setTranslationPanel(null), []);
  const {
    sheetRef: translationSheetRef,
    sheetClassName: translationSheetClassName,
    handleProps: translationHandleProps,
  } = useSheetDragToClose({ onClose: closeTranslationPanel, enabled: mobileTranslationUi });

  useBodyScrollLock(mobileTranslationSheetOpen);

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
  const automaticCompletionRef = useRef("");

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
    window.addEventListener("loopine:tab-visibility", handleTabVisibility as EventListener);
    return () => {
      window.removeEventListener("loopine:tab-visibility", handleTabVisibility as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleNativeTranslationAction = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{
        action?: "selection" | "save" | "listen";
        segmentId?: string;
        text?: string;
        slow?: boolean;
      }>;
      const { action, segmentId, text: rawText, slow } = event.detail || {};
      if (!action) return;

      if (action === "listen") {
        const state = youtubeStore.getState();
        const currentSegments = state.transcript?.segments || transcript?.segments || [];
        let indexToPlay = currentSegments.findIndex((item) => item.id === segmentId);
        if (indexToPlay < 0) indexToPlay = state.selectedIndex;
        if (slow) setStoreState({ playbackRate: Math.min(state.playbackRate, 0.75) });
        else setStoreState({ playbackRate: 1.0 });
        window.setTimeout(() => startLoop(indexToPlay, false, true), 0);
        return;
      }

      const sourceText = rawText?.replace(/\s+/g, " ").trim() || "";
      const currentTranscript = youtubeStore.getState().transcript || transcript;
      const segment = currentTranscript?.segments.find((item) => item.id === segmentId);
      const bridge = getNativeTranslationBridge();
      if (!segment) return;

      if (!sourceText || sourceText.length > 300 || !bridge) return;

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

  useEffect(() => {
    playerReadyRef.current = playerReady;
  }, [playerReady]);

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
      // host 미지정 → 기본 www.youtube.com 임베드를 사용한다.
      // youtube-nocookie.com은 쿠키를 전달하지 않는 도메인이라 로그인 세션이 임베드에
      // 붙지 않고, 항상 익명 클라이언트로 요청되어 봇 확인 화면에 걸린다.
      // controls: 0: 구간 반복(시작 지점 이동) 시 유튜브 재생 버튼, 자막 버튼, 상단/하단 UI가 자동으로 팝업되는 현상을 완전히 제거
      // cc_load_policy: 0 / iv_load_policy: 3: 플레이어 내부 자막 및 안내 레이어 비활성화 (웹 앱 자체 자막 리스트 사용)
      // modestbranding: 1 / rel: 0: 유튜브 로고 및 추천 영상 노출 최소화
      playerVars: { controls: 0, cc_load_policy: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
      events: {
        onReady: () => setPlayerReady(true),
        onError: (event: { data: number }) => {
          const code = event.data;
          if (code === 101 || code === 150 || code === 100 || code === 2 || code === 5) {
            youtubeStore.stopActiveJob();
            const msg =
              code === 101 || code === 150
                ? "이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다. 다른 영상을 선택해 주세요."
                : code === 100
                  ? "영상을 찾을 수 없거나 비공개된 영상입니다."
                  : "영상을 재생할 수 없습니다. 다른 영상을 선택해 주세요.";
            if (typeof window !== "undefined") {
              window.alert(msg);
            }
            onEndSession();
          }
        },
      },
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

  function startLoop(index = selectedIndex, revealWorkspace = false, keepTranslationPanel = false) {
    const currentTranscript = youtubeStore.getState().transcript || transcript;
    const segment = currentTranscript?.segments[index];
    const player = playerRef.current;
    if (!segment) return;
    if (!keepTranslationPanel) {
      setTranslationPanel(null);
    }
    setStoreState({ selectedIndex: index, error: "" });
    setCompletedRepeats(0);
    setLoopPaused(false);
    setNextLineHint(false);
    completedRef.current = 0;
    clearLoopTimers();

    if (revealWorkspace) {
      window.setTimeout(() => playerFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }

    const currentRate = youtubeStore.getState().playbackRate || playbackRate;

    // 「영상 듣기」는 영상 소리만 낸다. 준비가 안 됐을 때 TTS 로 대체하면
    // 「발음 듣기」와 구별이 안 되고, 사용자는 영상 소리를 들었다고 착각한다.
    // 들려줄 수 없으면 말해주는 편이 낫다.
    if (!player || !playerReadyRef.current || typeof player.seekTo !== "function" || typeof player.playVideo !== "function") {
      setStoreState({ error: "YouTube 플레이어를 준비하고 있습니다. 잠시 후 다시 눌러주세요." });
      return;
    }

    setIsLooping(true);
    const segmentEnd = effectiveSegmentEnd(currentTranscript.segments, index);
    player.setPlaybackRate(currentRate);
    player.seekTo(segment.start, true);
    player.playVideo();
    let seekLanding: number | null = null;

    loopTimerRef.current = setInterval(() => {
      const now = player.getCurrentTime();
      // seek 가 어디에 내려앉았는지는 첫 틱에서만 알 수 있다.
      if (seekLanding === null && now >= segment.start - 1) seekLanding = Math.round((now - segment.start) * 1000) / 1000;
      if (transitioningRef.current || now < segmentEnd + 0.05) return;
      const nextCount = completedRef.current + 1;
      completedRef.current = nextCount;
      setCompletedRepeats(nextCount);

      if (nextCount >= repeatTarget) {
        clearLoopTimers();
        player.pauseVideo();
        recordPlaybackTiming({
          segmentId: segment.id,
          playbackRate: currentRate,
          seekLanding,
          stopOvershoot: Math.round((player.getCurrentTime() - segmentEnd) * 1000) / 1000,
          at: Date.now(),
        });
        setIsLooping(false);
        setLoopPaused(false);
        setPracticedLines((current) => new Set(current).add(segment.id));
        // 스토어의 transcript 를 우선 쓰는 지점이므로 여기서도 같은 값을 봐야 한다.
        // 상태 변수 `transcript` 는 null 일 수 있고, 이 콜백은 반복 완료 시 실행된다.
        setNextLineHint(index < currentTranscript.segments.length - 1);
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

  const handleTranslationListen = useCallback(
    (slow = false) => {
      if (!translationPanel?.segment) return;
      const targetSegment = translationPanel.segment;
      const segmentIndex = transcript?.segments.findIndex((s) => s.id === targetSegment.id);
      const indexToPlay = segmentIndex !== -1 && segmentIndex != null ? segmentIndex : selectedIndex;

      const targetRate = slow ? Math.min(playbackRate, 0.75) : 1.0;
      setStoreState({ playbackRate: targetRate });

      // 준비 판정과 오류 안내는 startLoop 이 한 곳에서 처리한다. 여기서 또
      // 분기하면 TTS 대체가 되살아난다.
      window.setTimeout(() => startLoop(indexToPlay, false, true), 0);
    },
    [translationPanel, transcript, selectedIndex, playbackRate],
  );

  const handleTranslationSpeech = useCallback(() => {
    if (!translationPanel?.segment) return;
    const targetSegment = translationPanel.segment;
    const selection = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
    const textToSpeak = (selection && selection.length < 300) ? selection : targetSegment.text;
    speakEnglish(textToSpeak, { rate: 0.85 });
  }, [translationPanel]);

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

  // 키보드 단축키 (PC/데스크톱): 왼쪽/오른쪽 키로 이전 자막/다음 자막 이동
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("dialog, [role='dialog'], .content-picker-layer, .speech-sheet-backdrop"))
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        if (!transcript?.segments.length) return;
        e.preventDefault();
        const prevIndex = Math.max(0, selectedIndex - 1);
        if (prevIndex !== selectedIndex) {
          selectSegment(prevIndex, true, true);
        }
      } else if (e.key === "ArrowRight") {
        if (!transcript?.segments.length) return;
        e.preventDefault();
        const nextIndex = Math.min(transcript.segments.length - 1, selectedIndex + 1);
        if (nextIndex !== selectedIndex) {
          selectSegment(nextIndex, true, true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, transcript?.segments.length, selectedIndex]);

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
    setSpeechOpen(false);
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

  const routineProgress = routineCompletionProgress(entry, {
    practiced: practicedLines.size,
    spoken: spokenLines.size,
    recalled: recalledLines.size,
  });

  useEffect(() => {
    if (!entry.routineItemId) return;
    void apiFetch(`/api/routines/items/${entry.routineItemId}/start`, {
      method: "POST",
      body: JSON.stringify({ content_id: entry.contentId }),
    }).catch(() => undefined);
  }, [entry.contentId, entry.routineItemId]);

  useEffect(() => {
    if (!routineProgress.eligible || !entry.routineItemId) return;
    const completionKey = `${entry.routineItemId}:${clientSessionIdRef.current}`;
    if (automaticCompletionRef.current === completionKey) return;
    automaticCompletionRef.current = completionKey;
    void apiFetch(`/api/routines/items/${entry.routineItemId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        content_id: entry.contentId,
        actual_minutes: entry.routineSnapshot?.estimated_minutes || 0,
      }),
    }).then(async () => {
      await cancelRoutineReminderOccurrence(entry.routineItemId!);
      setSessionMessage(`${routineProgress.label} 목표 ${routineProgress.target}개를 달성해 오늘 루틴을 완료했어요.`);
      await onRefresh();
    }).catch(() => {
      automaticCompletionRef.current = "";
      setSessionMessage("루틴 완료를 저장하지 못했어요. 세션 종료에서 다시 저장할 수 있습니다.");
    });
  }, [entry.contentId, entry.routineItemId, entry.routineSnapshot?.estimated_minutes, onRefresh, routineProgress.eligible, routineProgress.label, routineProgress.target]);

  async function completeWorkspace(next: "review" | "routine" | "end") {
    setSessionMessage("세션 결과를 저장하는 중이에요…");
    try {
      await apiFetch("/api/learning/sessions/complete", {
        method: "POST",
        body: JSON.stringify({
          client_session_id: clientSessionIdRef.current,
          content_id: entry.contentId,
          activity_id: entry.activityId || null,
          routine_item_id: entry.routineItemId || null,
          routine_snapshot: entry.routineSnapshot || {},
          entry_source: entry.entrySource,
          practiced_line_count: completionSummary.practiced,
          saved_expression_count: completionSummary.saved,
          retry_line_count: completionSummary.retry,
          missing_words: Array.from(missingWords),
        }),
      });
      if (entry.routineItemId) await cancelRoutineReminderOccurrence(entry.routineItemId);
      await onRefresh();
      if (next === "review") onOpenReview();
      else if (next === "routine") onNextRoutine();
      else onEndSession();
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
          onCompleteAndEnd={() => void completeWorkspace("end")}
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
              <div className="selected-line-meta"><p className="eyebrow">LINE {selectedIndex + 1} / {transcript.segments.length} · {formatTime(selected.start)}</p><button className="record-inline-button" onClick={() => { setTranslationPanel(null); setSpeechOpen(true); }}><Mic size={16} /> 녹음</button></div>
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
                <button type="button" onClick={(event) => { setSpeechOpen(false); void requestSegmentTranslation(selected, event); }} aria-haspopup="dialog"><Languages size={15} /> 번역 보기</button>
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
          setSpokenLines((current) => new Set(current).add(selected.id));
          if (!showTranscriptText) setRecalledLines((current) => new Set(current).add(selected.id));
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
            ref={translationSheetRef}
            className={`translation-panel${translationSheetClassName}`}
            role="dialog"
            aria-modal={mobileTranslationUi}
            aria-labelledby="translation-panel-title"
          >
            {mobileTranslationUi && (
              <div className="translation-sheet-grabber" {...translationHandleProps}>
                <div className="translation-sheet-handle" aria-hidden="true" />
              </div>
            )}
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
                <div className="translation-audio-actions">
                  <button
                    type="button"
                    onClick={() => handleTranslationListen(false)}
                    aria-label="영상 듣기"
                  >
                    <Play size={13} /> 영상 듣기
                  </button>
                  <button
                    type="button"
                    onClick={handleTranslationSpeech}
                    aria-label="발음 듣기"
                  >
                    <Volume2 size={13} /> 발음 듣기
                  </button>
                </div>
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
