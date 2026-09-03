"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

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

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const videoId = useMemo(() => {
    if (!target) return null;
    const candidate = target.youtubeVideoId || target.youtubeUrl || target.contentId;
    if (!candidate) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;
    const match = candidate.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }, [target]);

  const startSec = Math.max(0, Math.floor(((target?.startMs || 0) / 1000)));

  function speakTts() {
    if (!target?.text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target.text);
    utterance.lang = "en-US";
    utterance.rate = speed;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => {
      setPlaying(false);
      if (repeatTarget > 0 && repeatsLeft > 1) {
        setRepeatsLeft((prev) => prev - 1);
        setTimeout(() => speakTts(), 500);
      }
    };
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  function startPlay() {
    setRepeatsLeft(repeatTarget);
    setPlaying(true);
    if (videoId && iframeRef.current) {
      const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${startSec}&controls=1&enablejsapi=1`;
      iframeRef.current.src = embedUrl;
    } else {
      speakTts();
    }
  }

  function togglePlay() {
    if (playing) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      startPlay();
    }
  }

  useEffect(() => {
    if (open && target) {
      setRepeatsLeft(repeatTarget);
      setPlaying(false);
    } else {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  }, [open, target, repeatTarget]);

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
              <iframe
                ref={iframeRef}
                title={target.title || "YouTube Subtitle Segment"}
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${startSec}&controls=1&enablejsapi=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
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
                onClick={() => setRepeatTarget(count)}
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
                  if (playing) startPlay();
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
