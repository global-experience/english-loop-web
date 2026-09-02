"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Mic, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { compareSpeech, saveRecordingOnDevice, type LearningSessionEntry, type LocalRecording, type SpeechComparison } from "@/lib/learningSession";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

type AttemptResponse = { id: string; created_at: string };

export function SpeechPracticeSheet({
  open,
  entry,
  lineId,
  referenceText,
  onClose,
  onListen,
  onSaved,
}: {
  open: boolean;
  entry: LearningSessionEntry;
  lineId: string;
  referenceText: string;
  onClose: () => void;
  onListen: (slow?: boolean) => void;
  onSaved?: (comparison: SpeechComparison) => void;
}) {
  const { mobile } = useMobileUi();
  const portalReady = usePortalReady();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [spokenText, setSpokenText] = useState("");
  const [comparison, setComparison] = useState<SpeechComparison | null>(null);
  const [localRecording, setLocalRecording] = useState<LocalRecording | null>(null);
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!open || !recording) return;
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [open, recording]);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [open]);

  async function startRecording() {
    setMessage("");
    setComparison(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void persistRecording(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.start(250);
    } catch {
      setMessage("마이크 권한을 허용해야 따라 말하기를 녹음할 수 있어요.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  async function persistRecording(blob: Blob) {
    setProcessing(true);
    try {
      const saved = await saveRecordingOnDevice(blob, Math.max(1, seconds));
      setLocalRecording(saved);
      setMessage("녹음은 이 기기에 저장됐어요. STT 연결 전에는 아래 칸에서 인식 문장을 확인·수정할 수 있습니다.");
    } catch {
      setMessage("녹음을 기기에 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    } finally {
      setProcessing(false);
    }
  }

  async function compareAndSave() {
    const normalized = spokenText.trim();
    if (!normalized) {
      setMessage("STT로 인식된 문장 또는 직접 들은 문장을 입력해 주세요.");
      return;
    }
    const result = compareSpeech(referenceText, normalized);
    setComparison(result);
    setProcessing(true);
    setMessage("");
    try {
      await apiFetch<AttemptResponse>("/api/learning/speech-attempts", {
        method: "POST",
        body: JSON.stringify({
          content_id: entry.contentId,
          transcript_line_id: lineId,
          activity_id: entry.activityId || null,
          entry_source: entry.entrySource,
          reference_text: referenceText,
          stt_text: normalized,
          comparison: result,
          match_score: result.accuracy,
          duration_seconds: localRecording?.durationSeconds || seconds,
          local_recording_id: localRecording?.id || null,
          local_recording_storage: localRecording?.storage || null,
          stt_provider: "MOCK",
        }),
      });
      setMessage("비교 결과를 저장했어요. 오디오는 기기에만 남고 복습·리포트에는 텍스트 결과가 연결됩니다.");
      onSaved?.(result);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "비교 결과를 서버에 저장하지 못했습니다.");
    } finally {
      setProcessing(false);
    }
  }

  if (!open || !portalReady) return null;
  return createPortal(
    <div className={`speech-sheet-layer ${mobile ? "mobile" : "desktop"}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="speech-sheet" role="dialog" aria-modal={mobile} aria-labelledby="speech-sheet-title">
        {mobile && <div className="speech-sheet-handle" aria-hidden="true" />}
        <header><div><p className="eyebrow">SPEAK · COMPARE · RETRY</p><h2 id="speech-sheet-title">문장 말해보기</h2></div><button onClick={onClose} aria-label="말하기 연습 닫기"><X size={19} /></button></header>
        <div className="speech-reference"><small>따라 말할 문장</small><strong>{referenceText}</strong><div><button onClick={() => onListen(false)}><Play size={15} /> 원문 듣기</button><button onClick={() => onListen(true)}><RotateCcw size={15} /> 느리게 듣기</button></div></div>
        <div className={`speech-recorder ${recording ? "recording" : ""}`}>
          <button className="speech-record-main" onClick={recording ? stopRecording : () => void startRecording()} disabled={processing}>
            {processing ? <LoaderCircle className="spin" /> : recording ? <Square fill="currentColor" /> : <Mic />}
          </button>
          <div><strong>{recording ? "녹음 중" : localRecording ? "녹음 저장됨" : "준비되면 눌러 녹음"}</strong><span>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")} · 기기 저장</span></div>
          {recording && <Pause size={18} />}
        </div>
        <label className="speech-stt-input"><span>STT 인식 문장 <em>현재 Mock adapter</em></span><textarea value={spokenText} onChange={(event) => setSpokenText(event.target.value)} placeholder="STT 연결 전: 인식 결과를 입력하거나 수정하세요" /></label>
        <button className="primary-button speech-compare-button" onClick={() => void compareAndSave()} disabled={processing || recording}><Check size={17} /> 자막과 비교하기</button>
        {comparison && <div className="speech-comparison"><div><span>일치 단어</span><strong>{comparison.accuracy}%</strong></div><p><b>빠진 단어</b>{comparison.missingWords.length ? comparison.missingWords.map((word, index) => <mark key={`${word}-${index}`}>{word}</mark>) : <em>없음</em>}</p><p><b>다르게 인식된 단어</b>{comparison.differentWords.length ? comparison.differentWords.map((word, index) => <mark className="different" key={`${word}-${index}`}>{word}</mark>) : <em>없음</em>}</p><small>이 값은 자막 단어와 STT 텍스트의 일치도이며, 전문적인 발음·억양 점수가 아닙니다.</small></div>}
        {message && <p className="speech-message" role="status">{message}</p>}
      </section>
    </div>,
    document.body
  );
}

