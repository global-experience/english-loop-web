"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Gauge, LockKeyhole, Pause, Play, Repeat2, Save, Volume2 } from "lucide-react";
import { apiFetch, mediaUrl } from "@/lib/api";
import type { Activity, Expression } from "@/lib/types";

type Props = { activity: Activity; expressions: Expression[]; title: string; onComplete: () => Promise<void> };

export function ListeningPlayer({ activity, expressions, title, onComplete }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [repeatSentence, setRepeatSentence] = useState(false);
  const [autoRepeat, setAutoRepeat] = useState(3);
  const [repeatDone, setRepeatDone] = useState(0);
  const [shadowing, setShadowing] = useState(0);
  const [firstScore, setFirstScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [message, setMessage] = useState("");
  const content = activity.content;
  const segment = content?.segments[index];
  const source = mediaUrl(content?.media_url || null);

  const highlighted = useMemo(() => {
    const text = segment?.english_text || "";
    const target = expressions.find((item) => text.toLowerCase().includes(item.canonical_text.replace("…", "").toLowerCase()));
    if (!target) return <>{text}</>;
    const clean = target.canonical_text.replace("…", "");
    const start = text.toLowerCase().indexOf(clean.toLowerCase());
    return <>{text.slice(0, start)}<mark>{text.slice(start, start + clean.length)}</mark>{text.slice(start + clean.length)}</>;
  }, [segment, expressions]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !source) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (activity.status === "NOT_STARTED") await apiFetch(`/api/activities/${activity.id}/start`, { method: "POST" });
      await audio.play();
      setPlaying(true);
    }
  }

  function move(next: number) {
    const bounded = Math.max(0, Math.min((content?.segments.length || 1) - 1, next));
    setIndex(bounded);
    setRepeatDone(0);
    const target = content?.segments[bounded];
    if (audioRef.current && target?.start_ms != null) audioRef.current.currentTime = target.start_ms / 1000;
  }

  function timeUpdate() {
    const audio = audioRef.current;
    if (!audio || !segment || segment.end_ms == null || audio.currentTime * 1000 < segment.end_ms) return;
    if (repeatSentence || repeatDone + 1 < autoRepeat) {
      setRepeatDone((value) => value + 1);
      audio.currentTime = (segment.start_ms || 0) / 1000;
      void audio.play();
    } else if (index < (content?.segments.length || 1) - 1) {
      move(index + 1);
    }
  }

  async function saveProgress(extra: Record<string, unknown> = {}) {
    await apiFetch(`/api/activities/${activity.id}/progress`, {
      method: "POST",
      body: JSON.stringify({
        actual_minutes: Math.max(activity.actual_minutes, Math.ceil(seconds / 60)),
        first_listen_comprehension: firstScore,
        final_comprehension: finalScore,
        transcript_revealed: showTranscript,
        replay_count: repeatDone,
        shadowing_count: shadowing,
        ...extra,
      }),
    });
    setMessage("진행 상황을 저장했어요.");
  }

  async function revealTranscript() {
    const next = !showTranscript;
    setShowTranscript(next);
    if (next) await saveProgress({ transcript_revealed: true });
  }

  async function addShadowing() {
    const next = shadowing + 1;
    setShadowing(next);
    await saveProgress({ shadowing_count: next });
  }

  async function toggleWakeLock() {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      return;
    }
    try {
      const lock = await navigator.wakeLock.request("screen");
      setWakeLock(lock);
    } catch { setMessage("이 브라우저에서는 화면 잠금 방지를 사용할 수 없어요."); }
  }

  async function finish() {
    await saveProgress();
    await apiFetch(`/api/activities/${activity.id}/complete`, { method: "POST" });
    setPlaying(false);
    await onComplete();
  }

  if (!content) return <section className="empty-state"><h2>{title}</h2><p>이 활동에 연결된 콘텐츠가 없습니다. 콘텐츠 라이브러리에서 오디오를 등록하고 오늘 계획에 연결해주세요.</p></section>;

  return (
    <section className="player-card">
      <div className="player-head"><div><p className="eyebrow">{title}</p><h2>{content.title}</h2><p>{content.topic} · {content.duration_seconds || "—"}초</p></div><button className={`icon-toggle ${wakeLock ? "active" : ""}`} onClick={() => void toggleWakeLock()} aria-pressed={Boolean(wakeLock)} aria-label="화면 잠금 방지"><LockKeyhole size={18}/></button></div>
      {source ? <audio ref={audioRef} src={source} onTimeUpdate={timeUpdate} onEnded={() => setPlaying(false)} preload="metadata"/> : <div className="media-notice">재생할 오디오가 없습니다. 대본 학습은 계속할 수 있어요.</div>}

      <div className="sentence-stage">
        <p className="sentence-count">SENTENCE {String(index + 1).padStart(2, "0")} / {String(content.segments.length).padStart(2, "0")}</p>
        {showTranscript ? <h3>{highlighted || "문장 대본을 등록해주세요."}</h3> : <div className="transcript-locked"><EyeOff size={22}/><span>대본을 숨겼어요. 먼저 소리에 집중하세요.</span></div>}
        {showMeaning && <p className="meaning">{segment?.korean_meaning || "한국어 의미가 등록되지 않았습니다."}</p>}
        <div className="segment-progress"><span style={{ width: `${content.segments.length ? ((index + 1) / content.segments.length) * 100 : 0}%` }}/></div>
      </div>

      <div className="main-controls">
        <button onClick={() => move(index - 1)} disabled={index === 0} aria-label="이전 문장"><ChevronLeft size={28}/></button>
        <button className="play-button" onClick={() => void togglePlay()} disabled={!source} aria-label={playing ? "일시정지" : "재생"}>{playing ? <Pause size={34} fill="currentColor"/> : <Play size={34} fill="currentColor"/>}</button>
        <button onClick={() => move(index + 1)} disabled={index >= content.segments.length - 1} aria-label="다음 문장"><ChevronRight size={28}/></button>
      </div>

      <div className="player-options">
        <button className={repeatSentence ? "active" : ""} onClick={() => setRepeatSentence((value) => !value)} aria-pressed={repeatSentence}><Repeat2 size={18}/> 한 문장</button>
        <label><Volume2 size={18}/><span className="sr-only">자동 반복 횟수</span><select value={autoRepeat} onChange={(event) => setAutoRepeat(Number(event.target.value))}><option value={3}>3회 반복</option><option value={5}>5회 반복</option></select></label>
        <label><Gauge size={18}/><span className="sr-only">재생 속도</span><select aria-label="재생 속도" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option></select></label>
      </div>

      <div className="reveal-controls">
        <button onClick={() => void revealTranscript()}>{showTranscript ? <EyeOff size={18}/> : <Eye size={18}/>} 영어 대본</button>
        <button onClick={() => setShowMeaning((value) => !value)}><Captions size={18}/> 한국어 의미</button>
      </div>

      <div className="comprehension-card">
        <div><strong>첫 이해도</strong><span>대본을 보기 전에 기록</span></div><ScorePicker value={firstScore} setValue={(score) => { setFirstScore(score); void saveProgress({ first_listen_comprehension: score }); }}/>
        <div><strong>최종 이해도</strong><span>반복 후 다시 기록</span></div><ScorePicker value={finalScore} setValue={(score) => { setFinalScore(score); void saveProgress({ final_comprehension: score }); }}/>
      </div>

      <button className={`shadow-button ${shadowing >= 3 ? "ready" : ""}`} onClick={() => void addShadowing()}><span><strong>입 모양 쉐도잉</strong><small>소리 내지 않고 따라 했어요</small></span><b>{shadowing} / 3</b></button>
      <div className="timer-line"><span>세션 {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span><span>반복 {repeatDone}/{autoRepeat}</span></div>
      {message && <p className="save-message" role="status">{message}</p>}
      <div className="button-grid two"><button className="secondary-button" onClick={() => void saveProgress()}><Save size={17}/> 중간 저장</button><button className="primary-button" onClick={() => void finish()}><Check size={17}/> 학습 완료</button></div>
    </section>
  );
}

function ScorePicker({ value, setValue }: { value: number | null; setValue: (score: number) => void }) {
  return <div className="score-picker" aria-label="이해도 선택">{[1, 2, 3, 4, 5].map((score) => <button key={score} className={value === score ? "active" : ""} onClick={() => setValue(score)} aria-pressed={value === score}>{score}</button>)}</div>;
}

