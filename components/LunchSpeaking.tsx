"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Mic, Pause, Play, RotateCcw, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Activity, Expression } from "@/lib/types";

export function LunchSpeaking({ activity, expressions, topic, onComplete }: { activity: Activity; expressions: Expression[]; topic: string; onComplete: () => Promise<void> }) {
  const draftKey = `loopine:lunch:${activity.id}`;
  const [prepared, setPrepared] = useState("");
  const [keywords, setKeywords] = useState("");
  const [hidden, setHidden] = useState(false);
  const [limit, setLimit] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [saveRecording, setSaveRecording] = useState(false);
  const [scores, setScores] = useState({ fluency: 3, confidence: 3 });
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      const draft = JSON.parse(saved);
      setPrepared(draft.prepared || "");
      setKeywords(draft.keywords || "");
    }
  }, [draftKey]);
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ prepared, keywords })); }, [draftKey, prepared, keywords]);
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearInterval(id);
  }, [running, remaining]);
  useEffect(() => { if (remaining <= 0) setRunning(false); }, [remaining]);

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch { setMessage("마이크 권한을 허용해야 녹음할 수 있어요."); }
  }

  async function save() {
    const usedIds = expressions.filter((expression) => prepared.toLowerCase().includes(expression.canonical_text.replace("…", "").toLowerCase())).map((expression) => expression.id);
    const attempt = await apiFetch<{ id: string }>("/api/speaking-attempts", {
      method: "POST",
      body: JSON.stringify({
        daily_activity_id: activity.id,
        prompt_text: `Tell me about ${topic}.`,
        prepared_text: prepared || null,
        keyword_notes: keywords || null,
        target_expression_ids: expressions.map((item) => item.id),
        used_with_help_expression_ids: usedIds,
        self_fluency_score: scores.fluency,
        self_confidence_score: scores.confidence,
        retry_count: blob ? 1 : 0,
      }),
    });
    if (blob && saveRecording) {
      const form = new FormData();
      form.set("recording", blob, "lunch-attempt.webm");
      await apiFetch(`/api/speaking-attempts/${attempt.id}/recording`, { method: "POST", body: form });
    }
    await apiFetch(`/api/activities/${activity.id}/complete`, { method: "POST" });
    localStorage.removeItem(draftKey);
    setMessage(saveRecording ? "말하기 기록과 녹음을 저장했어요." : "말하기 기록을 저장했어요. 녹음 원본은 업로드하지 않았습니다.");
    await onComplete();
  }

  function changeLimit(seconds: number) { setLimit(seconds); setRemaining(seconds); setRunning(false); }

  return (
    <section className="speaking-card">
      <div className="section-heading"><div><p className="eyebrow">LUNCH SPEAKING</p><h2>문장을 준비하고, 숨기고, 말해보세요</h2></div><span>{limit / 60}분</span></div>
      <article className="prompt-card"><p className="eyebrow">QUESTION</p><h3>What are you working on, and what has been the main challenge?</h3><p>2–3문장 · 상황 → 어려움 → 배운 점 순서로 답해보세요.</p></article>

      <div className="target-list"><p className="eyebrow">USE THESE EXPRESSIONS</p>{expressions.map((expression) => <button key={expression.id} onClick={() => setPrepared((value) => `${value}${value ? "\n" : ""}${expression.canonical_text} `)}>{expression.canonical_text}<span>＋</span></button>)}</div>

      <label className="field-block"><span>준비 문장</span><textarea rows={6} value={prepared} onChange={(event) => setPrepared(event.target.value)} className={hidden ? "blurred" : ""} placeholder="영어로 2–3문장을 먼저 적어보세요."/><button type="button" className="field-action" onClick={() => setHidden((value) => !value)}>{hidden ? <Eye size={17}/> : <EyeOff size={17}/>} {hidden ? "문장 다시 보기" : "문장 숨기기"}</button></label>
      <label className="field-block"><span>말할 때 볼 키워드</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="project · challenge · learned"/></label>

      <div className="speaking-timer">
        <div><p className="eyebrow">SPEAK NOW</p><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong></div>
        <div className="timer-presets"><button className={limit === 60 ? "active" : ""} onClick={() => changeLimit(60)}>1분</button><button className={limit === 180 ? "active" : ""} onClick={() => changeLimit(180)}>3분</button></div>
        <button className="round-action" onClick={() => setRunning((value) => !value)} aria-label={running ? "타이머 일시정지" : "타이머 시작"}>{running ? <Pause/> : <Play/>}</button>
        <button className="round-action muted" onClick={() => { setRemaining(limit); setRunning(false); }} aria-label="타이머 초기화"><RotateCcw/></button>
      </div>

      <div className="recording-panel"><button className={recording ? "recording" : ""} onClick={() => void toggleRecord()}><Mic size={20}/>{recording ? "녹음 중지" : blob ? "다시 녹음" : "선택적 녹음"}</button>{blob && <audio controls src={URL.createObjectURL(blob)}/>}<label><input type="checkbox" checked={saveRecording} onChange={(event) => setSaveRecording(event.target.checked)}/> 녹음 원본을 서버에 저장 (선택)</label></div>

      <div className="self-scores"><Score label="유창함" value={scores.fluency} onChange={(value) => setScores((current) => ({ ...current, fluency: value }))}/><Score label="자신감" value={scores.confidence} onChange={(value) => setScores((current) => ({ ...current, confidence: value }))}/></div>
      {message && <p className="save-message" role="status">{message}</p>}
      <button className="primary-button wide" onClick={() => void save()} disabled={!prepared.trim()}><Save size={18}/> 말하기 기록 및 활동 완료</button>
    </section>
  );
}

function Score({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div><strong>{label}</strong><div className="score-picker">{[1,2,3,4,5].map((score) => <button key={score} className={score === value ? "active" : ""} onClick={() => onChange(score)}>{score}</button>)}</div></div>;
}
