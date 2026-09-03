"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ContentDetailResponse } from "@/lib/reviewTypes";
import { useBodyScrollLock, useMobileUi, usePortalReady } from "@/lib/useMobileUi";

export type SubtitlePlayerTarget = {
  text: string;
  koreanText?: string | null;
  contentId?: string | null;
  transcriptLineId?: string | null;
  youtubeUrl?: string | null;
  youtubeVideoId?: string | null;
  startMs?: number | null;
  endMs?: number | null;
  title?: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SubtitlePlayerSheet({
  open,
  target,
  onClose,
  onOpenFullLearning,
}: {
  open: boolean;
  target: SubtitlePlayerTarget | null;
  onClose: () => void;
  onOpenFullLearning?: () => void;
}) {
  const { mobile } = useMobileUi();
  const portalReady = usePortalReady();

  const [repeatsLeft, setRepeatsLeft] = useState(3);
  const [repeatTarget, setRepeatTarget] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [apiReady, setApiReady] = useState(Boolean(typeof window !== "undefined" && (window as any).YT?.Player));
  const [resolvedTiming, setResolvedTiming] = useState<{ startMs: number; endMs: number } | null>(null);

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const repeatsLeftRef = useRef(3);
  const repeatTargetRef = useRef(3);
  const speedRef = useRef(1);

  useEffect(() => {
    repeatsLeftRef.current = repeatsLeft;
    repeatTargetRef.current = repeatTarget;
    speedRef.current = speed;
  }, [repeatsLeft, repeatTarget, speed]);

  // Extract 11-char YouTube Video ID
  const videoId = useMemo(() => {
    if (!target) return null;
    const candidate = target.youtubeVideoId || target.youtubeUrl || target.contentId;
    if (!candidate) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;
    const match = candidate.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }, [target]);

  // Ensure YouTube IFrame API script is loaded
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT?.Player) {
      setApiReady(true);
      return;
    }
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      setApiReady(true);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, []);

  // Resolve start/end timing from target or backend
  useEffect(() => {
    if (!open || !target) {
      setResolvedTiming(null);
      return;
    }
    if (target.startMs != null) {
      setResolvedTiming({
        startMs: target.startMs,
        endMs: target.endMs != null ? target.endMs : target.startMs + 5000,
      });
      return;
    }
    if (target.contentId) {
      void apiFetch<ContentDetailResponse>(`/api/review/contents/${encodeURIComponent(target.contentId)}`)
        .then((res) => {
          const line = res.transcript_lines?.find((l) => l.id === target.transcriptLineId) || res.transcript_lines?.[0];
          if (line && line.start_ms != null) {
            setResolvedTiming({
              startMs: line.start_ms,
              endMs: line.end_ms != null ? line.end_ms : line.start_ms + 5000,
            });
          }
        })
        .catch(() => undefined);
    }
  }, [open, target]);

  // Initialize YT Player with controls: 0 (no seek bar, no position editing)
  useEffect(() => {
    if (!open || !apiReady || !videoId || !playerHostRef.current) return;

    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    }

    const host = playerHostRef.current;
    host.innerHTML = "";
    const container = document.createElement("div");
    host.appendChild(container);

    const startSec = (resolvedTiming?.startMs || target?.startMs || 0) / 1000;
    const YT = (window as any).YT;

    const player = new YT.Player(container, {
      videoId,
      // host 미지정 → 기본 www.youtube.com 임베드를 사용한다.
      // youtube-nocookie.com은 쿠키를 전달하지 않는 도메인이라 로그인 세션이 임베드에
      // 붙지 않고, 항상 익명 클라이언트로 요청되어 봇 확인 화면에 걸린다.
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        cc_load_policy: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady: () => {
          setPlayerReady(true);
          try {
            if (typeof player.setPlaybackRate === "function") player.setPlaybackRate(speedRef.current);
            if (typeof player.seekTo === "function") player.seekTo(startSec, true);
            if (typeof player.playVideo === "function") player.playVideo();
            setPlaying(true);
          } catch { /* ignore */ }
        },
        onStateChange: (event: { data: number }) => {
          if (YT?.PlayerState) {
            if (event.data === YT.PlayerState.PLAYING) setPlaying(true);
            else if (event.data === YT.PlayerState.PAUSED) setPlaying(false);
          }
        },
      },
    });

    playerRef.current = player;

    return () => {
      setPlayerReady(false);
      try { player.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [open, apiReady, videoId, resolvedTiming, target]);

  // Real-time speed updates
  useEffect(() => {
    if (playerReady && playerRef.current && typeof playerRef.current.setPlaybackRate === "function") {
      try {
        playerRef.current.setPlaybackRate(speed);
      } catch { /* ignore */ }
    }
  }, [speed, playerReady]);

  // Strict Segment Loop Monitor
  useEffect(() => {
    if (!open || !playing || !playerReady || !playerRef.current) return;

    const startSec = (resolvedTiming?.startMs || target?.startMs || 0) / 1000;
    const endSec = (resolvedTiming?.endMs || target?.endMs || (startSec * 1000 + 5000)) / 1000;

    const interval = setInterval(() => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== "function") return;
      try {
        const current = playerRef.current.getCurrentTime();
        if (current >= endSec || current < startSec - 0.5) {
          if (repeatTargetRef.current > 0 && repeatsLeftRef.current <= 1) {
            playerRef.current.pauseVideo();
            playerRef.current.seekTo(startSec, true);
            setPlaying(false);
          } else {
            if (repeatTargetRef.current > 0) {
              repeatsLeftRef.current -= 1;
              setRepeatsLeft(repeatsLeftRef.current);
            }
            playerRef.current.seekTo(startSec, true);
            playerRef.current.playVideo();
          }
        }
      } catch { /* ignore */ }
    }, 100);

    return () => clearInterval(interval);
  }, [open, playing, playerReady, resolvedTiming, target]);

  function speakTts() {
    if (!target?.text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target.text);
    utterance.lang = "en-US";
    utterance.rate = speed;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => {
      setPlaying(false);
      if (repeatTargetRef.current > 0 && repeatsLeftRef.current > 1) {
        repeatsLeftRef.current -= 1;
        setRepeatsLeft(repeatsLeftRef.current);
        setTimeout(() => speakTts(), 500);
      }
    };
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  function startPlay() {
    repeatsLeftRef.current = repeatTarget;
    setRepeatsLeft(repeatTarget);
    const startSec = (resolvedTiming?.startMs || target?.startMs || 0) / 1000;
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.setPlaybackRate === "function") playerRef.current.setPlaybackRate(speed);
        if (typeof playerRef.current.seekTo === "function") playerRef.current.seekTo(startSec, true);
        if (typeof playerRef.current.playVideo === "function") playerRef.current.playVideo();
        setPlaying(true);
      } catch { /* ignore */ }
    } else {
      speakTts();
    }
  }

  function togglePlay() {
    const startSec = (resolvedTiming?.startMs || target?.startMs || 0) / 1000;
    if (playerRef.current) {
      try {
        if (playing) {
          if (typeof playerRef.current.pauseVideo === "function") playerRef.current.pauseVideo();
          setPlaying(false);
        } else {
          if (typeof playerRef.current.setPlaybackRate === "function") playerRef.current.setPlaybackRate(speed);
          if (typeof playerRef.current.playVideo === "function") playerRef.current.playVideo();
          setPlaying(true);
        }
      } catch { /* ignore */ }
    } else {
      if (playing) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
        setPlaying(false);
      } else {
        speakTts();
      }
    }
  }

  useEffect(() => {
    if (open && target) {
      repeatsLeftRef.current = repeatTarget;
      setRepeatsLeft(repeatTarget);
      setPlaying(false);
    } else {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  }, [open, target, repeatTarget]);

  useBodyScrollLock(open);

  // Auto close popup when switching tabs
  useEffect(() => {
    if (!open) return;
    const handleTabVisibility = (event: CustomEvent<{ tab: string; active: boolean }>) => {
      if (!event.detail.active) {
        onClose();
      }
    };
    window.addEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    return () => {
      window.removeEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    };
  }, [open, onClose]);

  if (!open || !target || !portalReady) return null;

  return createPortal(
    <div
      className={`speech-sheet-layer ${mobile ? "mobile" : "desktop"} subtitle-player-layer`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="speech-sheet subtitle-player-sheet" role="dialog" aria-modal={mobile} aria-labelledby="subtitle-player-title">
        {mobile && <div className="speech-sheet-handle" aria-hidden="true" />}
        <header>
          <div>
            <p className="eyebrow">SUBTITLE AUDIO</p>
            <h2 id="subtitle-player-title">{target.title || "자막 구간 듣기"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="팝업 닫기">
            <X size={19} />
          </button>
        </header>

        <div className="subtitle-player-media">
          {videoId ? (
            <div className="subtitle-player-video-wrap">
              <div ref={playerHostRef} className="subtitle-player-video-host" />
            </div>
          ) : (
            <div className="subtitle-player-audio-fallback">
              <Volume2 size={32} />
              <p>오디오 전용 자막 재생</p>
            </div>
          )}
        </div>

        <div className="subtitle-player-copy">
          <strong className="subtitle-player-english">{target.text}</strong>
          {target.koreanText && <p className="subtitle-player-korean">{target.koreanText}</p>}
        </div>

        <div className="subtitle-player-controls">
          <div className="subtitle-control-group">
            <span>반복</span>
            {[1, 3, 5, 0].map((count) => (
              <button
                key={count}
                type="button"
                className={`subtitle-chip ${repeatTarget === count ? "active" : ""}`}
                onClick={() => {
                  setRepeatTarget(count);
                  repeatsLeftRef.current = count;
                  setRepeatsLeft(count);
                  if (playerRef.current) {
                    const startSec = (resolvedTiming?.startMs || target?.startMs || 0) / 1000;
                    try {
                      if (typeof playerRef.current.seekTo === "function") playerRef.current.seekTo(startSec, true);
                      if (typeof playerRef.current.playVideo === "function") playerRef.current.playVideo();
                      setPlaying(true);
                    } catch { /* ignore */ }
                  }
                }}
              >
                {count === 0 ? "무한" : `${count}회`}
              </button>
            ))}
          </div>

          <div className="subtitle-control-group">
            <span>속도</span>
            {[0.75, 1, 1.25, 1.5].map((s) => (
              <button
                key={s}
                type="button"
                className={`subtitle-chip ${speed === s ? "active" : ""}`}
                onClick={() => {
                  setSpeed(s);
                  if (playerRef.current && typeof playerRef.current.setPlaybackRate === "function") {
                    try {
                      playerRef.current.setPlaybackRate(s);
                    } catch { /* ignore */ }
                  }
                }}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="subtitle-player-actions">
          <button type="button" className="primary-button" onClick={startPlay}>
            <RotateCcw size={17} /> 구간 반복 재생
          </button>
          <button type="button" className="secondary-button" onClick={togglePlay}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
            {playing ? "일시정지" : "재생"}
          </button>
        </div>

        {onOpenFullLearning && (
          <div className="subtitle-player-foot">
            <button type="button" className="text-button" onClick={onOpenFullLearning}>
              <BookOpen size={14} /> 원본 세션 전체 학습으로 이동
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
