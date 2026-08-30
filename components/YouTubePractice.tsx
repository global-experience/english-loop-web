"use client";

import Script from "next/script";
import { FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Languages, LoaderCircle, Pause, Play, RotateCcw, Sparkles, X, Youtube } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { isNativeAppRuntime } from "@/lib/nativeRuntime";
import { useYouTubeStore, youtubeStore } from "@/lib/youtubeStore";
import type { TranscriptSegment } from "@/lib/youtubeStore";

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

type SelectionTooltipState = {
  segmentId: string;
  sourceText: string;
  translation: string;
  loading: boolean;
  error: string;
  left: number;
  top: number;
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
  }
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

function useMobileTranslationUi() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 767px)");
    const capacitor = (window as typeof window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    const update = () => {
      setMobile(isNativeAppRuntime(capacitor, navigator.userAgent) || query?.matches === true);
    };
    update();
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, []);

  return mobile;
}

export function YouTubePractice() {
  const [storeState, setStoreState, loadTranscript] = useYouTubeStore();
  const {
    videoInput,
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
  const [portalReady, setPortalReady] = useState(false);
  const [translationPanel, setTranslationPanel] = useState<TranslationPanelState | null>(null);
  const [selectionTooltip, setSelectionTooltip] = useState<SelectionTooltipState | null>(null);
  const mobileTranslationUi = useMobileTranslationUi();

  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
  const completedRef = useRef(0);
  const translateClickRef = useRef(0);
  const selectionRequestRef = useRef(0);

  // Initialize default load if store has no transcript or active loading
  useEffect(() => {
    youtubeStore.initDefaultIfNeeded();
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!translationPanel || !mobileTranslationUi) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileTranslationUi, translationPanel]);

  useEffect(() => {
    if (!translationPanel && !selectionTooltip) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTranslationPanel(null);
      setSelectionTooltip(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectionTooltip, translationPanel]);

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
      const player = playerRef.current;
      player?.pauseVideo();
      if (returnToStart && transcript?.segments[selectedIndex]) {
        player?.seekTo(transcript.segments[selectedIndex].start, true);
      }
    },
    [clearLoopTimers, selectedIndex, transcript]
  );

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
      videoId,
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

  function startLoop(index = selectedIndex) {
    const segment = transcript?.segments[index];
    const player = playerRef.current;
    if (!segment) return;
    setStoreState({ selectedIndex: index, error: "" });
    setCompletedRepeats(0);
    completedRef.current = 0;
    clearLoopTimers();

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
        player.seekTo(segment.start, true);
        setIsLooping(false);
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
    if (!segment.id) {
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

    setTranslationPanel({ segment, result: null, loading: true, error: "", ...position });
    try {
      const result = await apiFetch<TranslationResponse>(
        `/api/v1/transcript/segments/${segment.id}/translate`,
        { method: "POST", body: JSON.stringify({ video_id: videoId }) },
      );
      setTranslationPanel((current) => current?.segment.id === segment.id
        ? { ...current, result, loading: false, error: "" }
        : current);
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
      setTranslationPanel((current) => current?.segment.id === segment.id
        ? {
            ...current,
            loading: false,
            error: caught instanceof Error ? caught.message : "AI 번역을 불러오지 못했습니다.",
          }
        : current);
    }
  }

  async function handleTextSelection(event: ReactMouseEvent<HTMLElement>) {
    if (mobileTranslationUi || event.button !== 0) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const sourceText = selection.toString().replace(/\s+/g, " ").trim();
    if (!sourceText || sourceText.length > 300) return;
    const anchor = selection.anchorNode;
    const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
    const selectable = anchorElement?.closest<HTMLElement>(".selectable-text[data-segment-id]");
    const segmentId = selectable?.dataset.segmentId;
    if (!segmentId || !transcript?.segments.some((item) => item.id === segmentId)) return;

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const left = Math.max(154, Math.min(window.innerWidth - 154, rect.left + rect.width / 2));
    const top = Math.max(96, rect.top - 12);
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setSelectionTooltip({ segmentId, sourceText, translation: "", loading: true, error: "", left, top });
    try {
      const result = await apiFetch<TranslationResponse>(
        `/api/v1/transcript/segments/${segmentId}/translate`,
        { method: "POST", body: JSON.stringify({ video_id: videoId, selection_text: sourceText }) },
      );
      if (selectionRequestRef.current !== requestId) return;
      setSelectionTooltip({ segmentId, sourceText, translation: result.translation, loading: false, error: "", left, top });
    } catch (caught) {
      if (selectionRequestRef.current !== requestId) return;
      setSelectionTooltip({
        segmentId,
        sourceText,
        translation: "",
        loading: false,
        error: caught instanceof Error ? caught.message : "선택한 문구를 번역하지 못했습니다.",
        left,
        top,
      });
    }
  }

  const trimmedInput = videoInput.trim();
  const isNewUrl = trimmedInput.length > 0 && (!videoId || !trimmedInput.includes(videoId));
  const isSubmitDisabled = !trimmedInput || (loading && !isNewUrl);

  function submitVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedInput || (loading && !isNewUrl)) return;
    if (isLooping) stopLoop(true);
    void loadTranscript(trimmedInput);
  }

  const selected = transcript?.segments[selectedIndex];

  // SVG Circular progress bar calculations
  const progressVal = Math.max(5, Math.min(100, jobProgress || 5));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * progressVal) / 100;

  const statusDetail =
    progressVal >= 90
      ? "자막 데이터 최종 정리 및 화면 생성 중..."
      : progressVal >= 60
        ? "Groq AI가 음성 대사를 문장별로 정리하고 있어요."
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
    <section className="youtube-practice" onMouseUp={handleTextSelection}>
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
        onReady={() => {
          if (window.YT?.Player) setApiReady(true);
        }}
        onError={() => setStoreState({ error: "YouTube 플레이어를 불러오지 못했습니다." })}
      />

      <header className="youtube-practice-head">
        <div>
          <p className="eyebrow">YOUTUBE · TRANSCRIPT LOOP</p>
          <h2>실제 자막을 골라<br />그 구간만 반복하기</h2>
          <p>공개 영상의 영어 자막을 불러와 원하는 문장을 바로 듣고 따라 말해 보세요.</p>
        </div>
        <span>
          <Youtube size={18} /> 개인 실습
        </span>
      </header>

      <form className="youtube-url-form" onSubmit={submitVideo}>
        <label className="sr-only" htmlFor="youtube-url">
          YouTube 영상 주소
        </label>
        <input
          id="youtube-url"
          type="url"
          value={videoInput}
          onChange={(event) => setStoreState({ videoInput: event.target.value })}
          placeholder="YouTube 영상 주소를 붙여넣으세요"
          required
        />
        <button type="submit" disabled={isSubmitDisabled}>
          {loading && !isNewUrl ? <LoaderCircle className="spin" size={17} /> : "자막 불러오기"}
        </button>
      </form>

      <div className="youtube-frame" aria-label="YouTube 학습 영상">
        <div ref={playerHostRef} />
      </div>

      <div className="youtube-source">
        <div>
          <strong>
            {transcript ? `${transcript.language} · ${transcript.segments.length}개 문장` : "YouTube 학습 영상"}
          </strong>
          <small>
            {transcript?.source === "groq_whisper"
              ? "YouTube 자막 없음 · Groq Whisper 음성 전사"
              : transcript?.source === "cloudflare_whisper"
                ? "YouTube 자막 없음 · Cloudflare Workers AI 음성 전사"
                : transcript?.source === "whisper"
                  ? "YouTube 자막 없음 · 3090 Whisper 음성 전사"
                  : transcript?.source === "youtube_caption+whisper"
                    ? "YouTube 자막 + Whisper 문장 복원"
                    : transcript?.is_generated
                      ? "YouTube 자동 생성 자막"
                      : transcript
                        ? "게시자가 등록한 자막"
                        : "영상 정보를 준비하고 있습니다"}
          </small>
        </div>
        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
          YouTube 열기 <ExternalLink size={14} />
        </a>
      </div>

      {error && <div className="youtube-error" role="alert">{error}</div>}

      <div className="youtube-loop-settings" aria-label="반복 재생 설정">
        <div>
          <span>반복</span>
          {(
            [1, 3, 5] as const
          ).map((count) => (
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
          {(
            [0.75, 1, 1.25] as const
          ).map((rate) => (
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
          <div className="youtube-shadowing">
            <p className="eyebrow">SELECTED LINE · {formatTime(selected.start)}</p>
            <h3 className="selectable-text" data-segment-id={selected.id}>{selected.text}</h3>
            <p>
              {isLooping
                ? `구간 반복 중 · ${completedRepeats} / ${repeatTarget}`
                : "재생을 누르면 이 자막 구간만 반복합니다."}
            </p>
            <div className="youtube-shadow-actions">
              <button type="button" className="primary-button" onClick={() => startLoop()}>
                {isLooping ? <RotateCcw size={17} /> : <Play size={17} />}{" "}
                {isLooping ? "처음부터 다시" : `${repeatTarget}회 반복 시작`}
              </button>
              <button
                type="button"
                className="icon-toggle"
                aria-label="반복 재생 중지"
                disabled={!isLooping}
                onClick={() => stopLoop(true)}
              >
                <Pause size={17} />
              </button>
            </div>
            <button
              type="button"
              className="youtube-translate-button"
              onClick={(event) => void requestSegmentTranslation(selected, event)}
              aria-haspopup="dialog"
            >
              <Languages size={16} /> 번역 보기
              {selected.translation && <span>저장됨</span>}
            </button>
          </div>

          <div className="youtube-transcript-list" aria-label="영상 자막 목록">
            <div className="youtube-transcript-head">
              <div>
                <p className="eyebrow">FULL TRANSCRIPT</p>
                <strong>연습할 문장을 선택하세요</strong>
              </div>
              <small>누르면 바로 {repeatTarget}회 반복</small>
            </div>
            <ol>
              {transcript.segments.map((segment, index) => (
                <li key={`${segment.start}-${index}`}>
                  {segment.scene && (index === 0 || transcript.segments[index - 1]?.scene !== segment.scene) && (
                    <p className="youtube-scene-label">장면 {segment.scene}</p>
                  )}
                  <button
                    type="button"
                    className={selectedIndex === index ? "active" : ""}
                    onClick={() => startLoop(index)}
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
    </section>
    {portalReady && translationPanel && createPortal(
      <div
        className={`translation-layer ${mobileTranslationUi ? "mobile" : "desktop"}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTranslationPanel(null);
        }}
      >
        <section
          className="translation-panel"
          role="dialog"
          aria-modal={mobileTranslationUi}
          aria-labelledby="translation-panel-title"
          style={mobileTranslationUi ? undefined : { left: translationPanel.left, top: translationPanel.top }}
          onMouseUp={handleTextSelection}
        >
          {mobileTranslationUi && <div className="translation-sheet-handle" aria-hidden="true" />}
          <header>
            <div>
              <p className="eyebrow"><Sparkles size={12} /> GROQ AI TRANSLATION</p>
              <h3 id="translation-panel-title">자연스러운 한국어 표현</h3>
            </div>
            <button type="button" onClick={() => setTranslationPanel(null)} aria-label="번역 닫기">
              <X size={19} />
            </button>
          </header>
          <div className="translation-copy original">
            <span>ORIGINAL</span>
            <p className="selectable-text" data-segment-id={translationPanel.segment.id} lang="en">
              {translationPanel.segment.text}
            </p>
          </div>
          <div className="translation-copy korean" aria-live="polite">
            <span>KOREAN</span>
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
          <footer>
            <span>{translationPanel.result?.cached ? "DB 캐시에서 즉시 불러옴" : "최초 번역은 DB에 안전하게 저장됩니다"}</span>
            {mobileTranslationUi && <small>영어 문구를 길게 눌러 OS 번역 메뉴를 사용할 수 있어요.</small>}
          </footer>
        </section>
      </div>,
      document.body,
    )}
    {portalReady && selectionTooltip && !mobileTranslationUi && createPortal(
      <aside
        className="selection-translation-tooltip"
        style={{ left: selectionTooltip.left, top: selectionTooltip.top }}
        role="status"
      >
        <button type="button" onClick={() => setSelectionTooltip(null)} aria-label="선택 번역 닫기">
          <X size={14} />
        </button>
        <strong>{selectionTooltip.sourceText}</strong>
        {selectionTooltip.loading && <span><LoaderCircle className="spin" size={13} /> 직역하는 중…</span>}
        {!selectionTooltip.loading && selectionTooltip.translation && <p>{selectionTooltip.translation}</p>}
        {!selectionTooltip.loading && selectionTooltip.error && <p className="error">{selectionTooltip.error}</p>}
      </aside>,
      document.body,
    )}
    </>
  );
}
