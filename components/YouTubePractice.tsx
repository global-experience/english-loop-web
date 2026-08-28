"use client";

import Script from "next/script";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Pause, Play, RotateCcw, Youtube } from "lucide-react";
import { apiFetch } from "@/lib/api";

const DEFAULT_VIDEO_ID = "m2UD0-IC7iY";
const DEFAULT_VIDEO_URL = `https://www.youtube.com/watch?v=${DEFAULT_VIDEO_ID}`;

type TranscriptSegment = {
  text: string;
  start: number;
  duration: number;
  end: number;
  scene?: number;
};

type TranscriptResponse = {
  video_id: string;
  language: string;
  language_code: string;
  is_generated: boolean;
  source?: "youtube_caption" | "youtube_caption+whisper" | "whisper" | "groq_whisper" | "cloudflare_whisper";
  segments: TranscriptSegment[];
};

type YouTubeJobResponse = {
  id: string;
  video_id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  provider: "LOCAL_GPU" | "GROQ" | "CLOUDFLARE" | "CLOUD_AUTO";
  progress: number;
  error_message: string | null;
  result: TranscriptResponse | null;
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

export function YouTubePractice() {
  const [videoInput, setVideoInput] = useState(DEFAULT_VIDEO_URL);
  const [videoId, setVideoId] = useState(DEFAULT_VIDEO_ID);
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [repeatTarget, setRepeatTarget] = useState<1 | 3 | 5>(3);
  const [completedRepeats, setCompletedRepeats] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobProvider, setJobProvider] = useState<YouTubeJobResponse["provider"] | null>(null);

  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
  const completedRef = useRef(0);
  const initialLoadRef = useRef(false);
  const loadSequenceRef = useRef(0);

  const clearLoopTimers = useCallback(() => {
    if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    loopTimerRef.current = null;
    transitionTimerRef.current = null;
    transitioningRef.current = false;
  }, []);

  const stopLoop = useCallback((returnToStart = false) => {
    clearLoopTimers();
    setIsLooping(false);
    const player = playerRef.current;
    player?.pauseVideo();
    if (returnToStart && transcript?.segments[selectedIndex]) {
      player?.seekTo(transcript.segments[selectedIndex].start, true);
    }
  }, [clearLoopTimers, selectedIndex, transcript]);

  const loadTranscript = useCallback(async (value: string) => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setJobProgress(0);
    setJobProvider(null);
    setError("");
    clearLoopTimers();
    setIsLooping(false);
    try {
      let job = await apiFetch<YouTubeJobResponse>("/api/youtube/jobs", {
        method: "POST",
        body: JSON.stringify({ video: value, languages: ["en", "en-US", "en-GB"] }),
      });
      setJobProgress(job.progress);
      setJobProvider(job.provider);
      while (job.status === "QUEUED" || job.status === "PROCESSING") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (sequence !== loadSequenceRef.current) return;
        job = await apiFetch<YouTubeJobResponse>(`/api/youtube/jobs/${job.id}`);
        setJobProgress(job.progress);
        setJobProvider(job.provider);
      }
      if (job.status === "FAILED" || !job.result) {
        throw new Error(job.error_message || "영상 분석을 완료하지 못했습니다.");
      }
      const result = job.result;

      setTranscript(result);
      setVideoId(result.video_id);
      setSelectedIndex(0);
      setCompletedRepeats(0);
    } catch (reason) {
      if (sequence !== loadSequenceRef.current) return;
      setTranscript(null);
      setError(reason instanceof Error ? reason.message : "자동 자막을 가져오지 못했습니다.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [clearLoopTimers]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadTranscript(DEFAULT_VIDEO_URL);
  }, [loadTranscript]);

  useEffect(() => () => {
    loadSequenceRef.current += 1;
  }, []);

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
      playerVars: { cc_load_policy: 1, playsinline: 1, rel: 0 },
      events: { onReady: () => setPlayerReady(true) },
    });
    return () => {
      clearLoopTimers();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apiReady, clearLoopTimers]);

  useEffect(() => {
    if (!playerReady) return;
    playerRef.current?.cueVideoById(videoId);
  }, [playerReady, videoId]);

  useEffect(() => {
    playerRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  function startLoop(index = selectedIndex) {
    const segment = transcript?.segments[index];
    const player = playerRef.current;
    if (!segment) return;
    setSelectedIndex(index);
    setError("");
    setCompletedRepeats(0);
    completedRef.current = 0;
    clearLoopTimers();

    if (!player || !playerReady) {
      setError("YouTube 플레이어를 준비하고 있습니다. 잠시 후 다시 눌러주세요.");
      return;
    }

    setIsLooping(true);
    player.setPlaybackRate(playbackRate);
    player.seekTo(segment.start, true);
    player.playVideo();

    loopTimerRef.current = setInterval(() => {
      if (transitioningRef.current || player.getCurrentTime() < segment.end + 0.05) return;
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

  function submitVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (videoInput.trim()) void loadTranscript(videoInput);
  }

  const selected = transcript?.segments[selectedIndex];

  return (
    <section className="youtube-practice">
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
        onReady={() => { if (window.YT?.Player) setApiReady(true); }}
        onError={() => setError("YouTube 플레이어를 불러오지 못했습니다.")}
      />

      <header className="youtube-practice-head">
        <div><p className="eyebrow">YOUTUBE · TRANSCRIPT LOOP</p><h2>실제 자막을 골라<br/>그 구간만 반복하기</h2><p>공개 영상의 영어 자막을 불러와 원하는 문장을 바로 듣고 따라 말해 보세요.</p></div>
        <span><Youtube size={18}/> 개인 실습</span>
      </header>

      <form className="youtube-url-form" onSubmit={submitVideo}>
        <label className="sr-only" htmlFor="youtube-url">YouTube 영상 주소</label>
        <input id="youtube-url" type="url" value={videoInput} onChange={(event) => setVideoInput(event.target.value)} placeholder="YouTube 영상 주소를 붙여넣으세요" required/>
        <button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17}/> : "자막 불러오기"}</button>
      </form>

      <div className="youtube-frame" aria-label="YouTube 학습 영상">
        <div ref={playerHostRef}/>
      </div>

      <div className="youtube-source">
        <div><strong>{transcript ? `${transcript.language} · ${transcript.segments.length}개 문장` : "YouTube 학습 영상"}</strong><small>{transcript?.source === "groq_whisper" ? "YouTube 자막 없음 · Groq Whisper 음성 전사" : transcript?.source === "cloudflare_whisper" ? "YouTube 자막 없음 · Cloudflare Workers AI 음성 전사" : transcript?.source === "whisper" ? "YouTube 자막 없음 · 3090 Whisper 음성 전사" : transcript?.source === "youtube_caption+whisper" ? "YouTube 자막 + Whisper 문장 복원" : transcript?.is_generated ? "YouTube 자동 생성 자막" : "게시자가 등록한 자막"}</small></div>
        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">YouTube 열기 <ExternalLink size={14}/></a>
      </div>

      {error && <div className="youtube-error" role="alert">{error}</div>}

      <div className="youtube-loop-settings" aria-label="반복 재생 설정">
        <div><span>반복</span>{([1, 3, 5] as const).map((count) => <button key={count} type="button" className={repeatTarget === count ? "active" : ""} onClick={() => { if (isLooping) stopLoop(true); setRepeatTarget(count); }}>{count}회</button>)}</div>
        <div><span>속도</span>{([0.75, 1, 1.25] as const).map((rate) => <button key={rate} type="button" className={playbackRate === rate ? "active" : ""} onClick={() => setPlaybackRate(rate)}>{rate}×</button>)}</div>
      </div>

      {loading && <div className="youtube-loading"><LoaderCircle className="spin"/><strong>영어 대사를 문장으로 정리하는 중… {jobProgress ? `${jobProgress}%` : ""}</strong><span>{jobProvider === "LOCAL_GPU" ? "3090 서버에서 정밀하게 분석하고 있어요." : jobProvider ? "클라우드 음성 인식으로 처리하고 있어요." : "처리 서버를 선택하고 있어요."}</span></div>}

      {!loading && transcript && selected && <>
        <div className="youtube-shadowing">
          <p className="eyebrow">SELECTED LINE · {formatTime(selected.start)}</p>
          <h3>{selected.text}</h3>
          <p>{isLooping ? `구간 반복 중 · ${completedRepeats} / ${repeatTarget}` : "재생을 누르면 이 자막 구간만 반복합니다."}</p>
          <div className="youtube-shadow-actions">
            <button type="button" className="primary-button" onClick={() => startLoop()}>{isLooping ? <RotateCcw size={17}/> : <Play size={17}/>} {isLooping ? "처음부터 다시" : `${repeatTarget}회 반복 시작`}</button>
            <button type="button" className="icon-toggle" aria-label="반복 재생 중지" disabled={!isLooping} onClick={() => stopLoop(true)}><Pause size={17}/></button>
          </div>
        </div>

        <div className="youtube-transcript-list" aria-label="영상 자막 목록">
          <div className="youtube-transcript-head"><div><p className="eyebrow">FULL TRANSCRIPT</p><strong>연습할 문장을 선택하세요</strong></div><small>누르면 바로 {repeatTarget}회 반복</small></div>
          <ol>
            {transcript.segments.map((segment, index) => <li key={`${segment.start}-${index}`}>{segment.scene && (index === 0 || transcript.segments[index - 1]?.scene !== segment.scene) && <p className="youtube-scene-label">장면 {segment.scene}</p>}<button type="button" className={selectedIndex === index ? "active" : ""} onClick={() => startLoop(index)}><time>{formatTime(segment.start)}</time><span>{segment.text}</span><Play size={14}/></button></li>)}
          </ol>
        </div>
      </>}

      <p className="youtube-copyright">개인 학습용 비공식 연동입니다. 영상은 공식 YouTube 플레이어로 재생하며, 내려받은 임시 오디오는 전사 직후 삭제하고 재처리 방지를 위한 문장 데이터만 서버에 캐시합니다.</p>
    </section>
  );
}
