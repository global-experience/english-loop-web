"use client";

import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Languages, LoaderCircle, Mic, Pause, Play, RotateCcw, Save, Volume2 } from "lucide-react";
import { apiFetch, mediaUrl } from "@/lib/api";
import { isMobileDeviceRuntime } from "@/lib/nativeRuntime";
import type { LearningPresetOptions, LearningSessionEntry } from "@/lib/learningSession";
import { LearningSessionHeader } from "./LearningSessionHeader";
import { SpeechPracticeSheet } from "./SpeechPracticeSheet";

function formatTime(ms: number | null) {
  const seconds = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DirectContentPractice({ entry, presets, onChangeContent, onEndSession, onRefresh, onOpenReview, onNextRoutine }: {
  entry: LearningSessionEntry;
  presets: LearningPresetOptions;
  onChangeContent: () => void;
  onEndSession: () => void;
  onRefresh: () => Promise<void>;
  onOpenReview: () => void;
  onNextRoutine: () => void;
}) {
  const content = entry.content!;
  const initialIndex = Math.max(0, content.segments.findIndex((line) => line.id === entry.transcriptLineId));
  const [index, setIndex] = useState(initialIndex);
  const [repeatTarget, setRepeatTarget] = useState(presets.repeats[0]);
  const [rate, setRate] = useState(presets.speeds[1]);
  const [playing, setPlaying] = useState(false);
  const [repeats, setRepeats] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [speechOpen, setSpeechOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [practiced, setPracticed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retry, setRetry] = useState<Set<string>>(new Set());
  const [missingWords, setMissingWords] = useState<Set<string>>(new Set());
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      setIsMobileDevice(isMobileDeviceRuntime(navigator.userAgent, navigator.maxTouchPoints || 0, capacitor));
    }
  }, []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentSentenceRef = useRef<HTMLDivElement>(null);
  const transcriptListRef = useRef<HTMLOListElement>(null);
  const touchStart = useRef(0);

  const selected = content.segments[index];
  const source = mediaUrl(content.media_url);
  const progress = content.segments.length ? (practiced.size / content.segments.length) * 100 : 0;
  const remaining = Math.max(1, Math.ceil(((content.duration_seconds || content.segments.length * 5) * (1 - progress / 100)) / 60));

  const savedMeaning = useMemo(() => selected?.korean_meaning || "", [selected]);

  function selectLine(next: number, play = true, revealWorkspace = true) {
    const bounded = Math.max(0, Math.min(content.segments.length - 1, next));
    setIndex(bounded);
    setRepeats(0);
    const line = content.segments[bounded];
    if (audioRef.current && line?.start_ms != null) audioRef.current.currentTime = line.start_ms / 1000;
    window.requestAnimationFrame(() => {
      const container = transcriptListRef.current;
      const selectedButton = container?.querySelector<HTMLElement>(`[data-line-index="${bounded}"]`);
      const selectedItem = selectedButton?.closest("li") || selectedButton;
      if (selectedItem && container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();
        const targetScrollTop = container.scrollTop + (itemRect.top - containerRect.top);
        container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
      }
      if (revealWorkspace) window.setTimeout(() => currentSentenceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    });
    if (play) void startLoop(bounded);
  }

  async function startLoop(targetIndex = index, slow = false) {
    const line = content.segments[targetIndex];
    const audio = audioRef.current;
    if (!audio || !line || line.start_ms == null) return;
    setIndex(targetIndex);
    setRepeats(0);
    setPlaying(true);
    audio.playbackRate = slow ? Math.min(rate, 0.75) : rate;
    audio.currentTime = line.start_ms / 1000;
    await audio.play();
  }

  function timeUpdate() {
    const audio = audioRef.current;
    if (!audio || !selected?.end_ms || audio.currentTime * 1000 < selected.end_ms) return;
    const next = repeats + 1;
    setPracticed((current) => new Set(current).add(selected.id));
    if (next < repeatTarget) {
      setRepeats(next);
      audio.currentTime = (selected.start_ms || 0) / 1000;
      void audio.play();
      return;
    }
    audio.pause();
    setPlaying(false);
    setRepeats(next);
  }

  function pauseResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { void audio.play(); setPlaying(true); }
  }

  function swipeEnd(event: TouchEvent) {
    const distance = event.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(distance) < 45) return;
    selectLine(index + (distance < 0 ? 1 : -1), true, true);
  }

  async function saveExpression() {
    if (!selected || savingId === selected.id) return;
    setSavingId(selected.id);
    try {
      if (saved.has(selected.id)) {
        try {
          await apiFetch(`/api/review/saved-items/${selected.id}`, { method: "DELETE" });
        } catch {
          // Unsaving locally still updates UI if API fails
        }
        setSaved((current) => {
          const next = new Set(current);
          next.delete(selected.id);
          return next;
        });
        setMessage("복습 목록에서 문장 저장을 취소했어요.");
        return;
      }
      await apiFetch("/api/expressions", { method: "POST", body: JSON.stringify({ canonical_text: selected.english_text, korean_meaning: savedMeaning || "복습할 문장", example_sentence: selected.english_text, category: "YOUTUBE_VOCAB", level: content.level || "B1", tags: ["content", `content:${content.id}`, `transcript:${selected.id}`], source_content_id: content.id, source_transcript_line_id: selected.id }) });
      setSaved((current) => new Set(current).add(selected.id));
      setMessage("이 문장을 복습 목록에 저장했어요.");
    } finally {
      setSavingId(null);
    }
  }

  async function completeWorkspace(next: "review" | "routine") {
    await apiFetch("/api/learning/sessions/complete", { method: "POST", body: JSON.stringify({ content_id: content.id, activity_id: entry.activityId || null, routine_item_id: entry.routineItemId || null, routine_snapshot: entry.routineSnapshot || null, entry_source: entry.entrySource, practiced_line_count: practiced.size, saved_expression_count: saved.size, retry_line_count: retry.size, missing_words: Array.from(missingWords) }) });
    await onRefresh();
    if (next === "review") onOpenReview(); else onNextRoutine();
  }

  if (!selected) return null;
  return (
    <section className="youtube-practice direct-content-practice">
      <LearningSessionHeader
        entry={entry}
        progress={progress}
        remainingMinutes={remaining}
        onChangeContent={onChangeContent}
        onEndSession={onEndSession}
        summary={{ practiced: practiced.size, saved: saved.size, retry: retry.size }}
        missingWords={missingWords}
        onGoToReview={() => void completeWorkspace("review")}
        onNextRoutine={() => void completeWorkspace("routine")}
      />
      {source ? <audio ref={audioRef} src={source} onTimeUpdate={timeUpdate} onEnded={() => setPlaying(false)} preload="metadata" /> : <div className="media-notice">재생 가능한 오디오가 없어도 자막 학습과 말하기 기록은 사용할 수 있습니다.</div>}
      <div className="youtube-loop-settings"><div><span>반복</span>{presets.repeats.map((count) => <button key={count} className={repeatTarget === count ? "active" : ""} onClick={() => setRepeatTarget(count)}>{count}회</button>)}</div><div><span>속도</span>{presets.speeds.map((speed) => <button key={speed} className={rate === speed ? "active" : ""} onClick={() => { setRate(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}>{speed}×</button>)}</div></div>
      <div className="youtube-shadowing sentence-swipe-stage learning-workspace-scroll-anchor" ref={currentSentenceRef} onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={swipeEnd}>
        <div className="selected-line-meta"><p className="eyebrow">LINE {index + 1} / {content.segments.length} · {formatTime(selected.start_ms)}</p><button className="record-inline-button" onClick={() => setSpeechOpen(true)}><Mic size={16} /> 녹음</button></div>
        <h3 className="selectable-text">{selected.english_text}</h3>
        {showMeaning && <p className="selected-meaning">{savedMeaning || "등록된 번역이 없습니다."}</p>}
        <div className="current-sentence-tools"><button onClick={() => setShowMeaning((value) => !value)}><Languages size={15} /> 번역 보기</button><button type="button" className={saved.has(selected.id) ? "saved" : ""} onClick={() => void saveExpression()} disabled={savingId === selected.id}>{savingId === selected.id ? <LoaderCircle className="spin" size={15} /> : <Bookmark size={15} fill={saved.has(selected.id) ? "currentColor" : "none"} />} {savingId === selected.id ? (saved.has(selected.id) ? "저장 취소 중…" : "저장 중…") : (saved.has(selected.id) ? "문장 저장됨" : "문장 저장")}</button><button onClick={() => void startLoop(index, true)}><Volume2 size={15} /> 느리게 듣기</button></div>
        {!isMobileDevice && <div className="sentence-swipe-nav"><button onClick={() => selectLine(index - 1, true, true)} disabled={index === 0}><ChevronLeft /></button><span>옆으로 넘겨 다음 문장</span><button onClick={() => selectLine(index + 1, true, true)} disabled={index === content.segments.length - 1}><ChevronRight /></button></div>}
        <div className="youtube-shadow-actions"><button className="primary-button" onClick={() => void startLoop()}><RotateCcw size={17} /> {repeatTarget}회 구간 반복</button><button className="icon-toggle" onClick={pauseResume} disabled={!source} aria-label={playing ? "일시정지" : "이어서 재생"}>{playing ? <Pause /> : <Play />}</button></div>
      </div>
      {message && <p className="save-message">{message}</p>}
      <div className="youtube-transcript-list"><div className="youtube-transcript-head"><div><p className="eyebrow">FULL TRANSCRIPT</p><strong>원하는 문장을 선택하세요</strong></div><small>{content.segments.length}개 문장</small></div><ol className="transcript-list" ref={transcriptListRef}>{content.segments.map((line, lineIndex) => <li key={line.id}><button data-line-index={lineIndex} className={lineIndex === index ? "active" : ""} onClick={() => selectLine(lineIndex, true, true)}><time>{formatTime(line.start_ms)}</time><span>{line.english_text}</span><Play size={14} /></button></li>)}</ol></div>
      <SpeechPracticeSheet open={speechOpen} entry={entry} lineId={selected.id} referenceText={selected.english_text} onClose={() => setSpeechOpen(false)} onListen={(slow) => void startLoop(index, slow)} onSaved={(comparison) => { setPracticed((current) => new Set(current).add(selected.id)); if (comparison.missingWords.length || comparison.differentWords.length) setRetry((current) => new Set(current).add(selected.id)); setMissingWords((current) => new Set([...current, ...comparison.missingWords])); }} />
    </section>
  );
}
