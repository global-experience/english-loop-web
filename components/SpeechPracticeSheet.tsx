"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Mic, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  compareSpeech,
  loadRecordingFromDevice,
  saveRecordingOnDevice,
  type LearningSessionEntry,
  type LocalRecording,
  type SpeechComparison,
} from "@/lib/learningSession";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

type AttemptResponse = { id: string; created_at: string };
type SttProvider = "MOCK" | "GROQ" | "WHISPER" | "CLOUDFLARE";
type TranscriptionResponse = { text: string; provider: Exclude<SttProvider, "MOCK">; request_id: string };

export interface NativeRecordingBridge {
  present: (payload: { lineId: string; referenceText: string; spokenText?: string }) => void;
  update?: (payload: { spokenText?: string; message?: string; error?: string; comparison?: SpeechComparison }) => void;
  notify?: (payload: { message: string; kind?: "info" | "error" }) => void;
  close?: () => void;
}

export interface AndroidRecordingHost {
  present: (rawPayload: string) => void;
  update?: (rawPayload: string) => void;
  notify?: (rawPayload: string) => void;
  close?: () => void;
}

declare global {
  interface Window {
    LoopineNativeRecording?: NativeRecordingBridge;
    LoopineNativeRecordingHost?: AndroidRecordingHost;
  }
}

export function getNativeRecordingBridge(): NativeRecordingBridge | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.LoopineNativeRecording?.present) return window.LoopineNativeRecording;
  const host = window.LoopineNativeRecordingHost;
  if (!host?.present) return undefined;
  return {
    present: (payload) => host.present(JSON.stringify(payload)),
    update: (payload) => host.update?.(JSON.stringify(payload)),
    notify: (payload) => host.notify?.(JSON.stringify(payload)),
    close: () => host.close?.(),
  };
}

function base64RecordingToBlob(value: string, mimeType: string): Blob {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Decide what to record as this attempt's device audio.
 *
 * Prefers the file the native sheet wrote, but only after reading it back. Falls back
 * to storing the bytes the bridge handed over, and finally to "no device audio" so the
 * review tab never claims audio it cannot play.
 */
async function resolveNativeRecording(
  nativeId: string | null,
  blob: Blob,
  mimeType: string,
  durationSeconds: number
): Promise<LocalRecording> {
  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const onNativePlatform = Boolean(capacitor?.isNativePlatform?.());

  if (nativeId) {
    // Off a native platform there is no way to check the file, and the native shell is
    // the authority for what it stored, so keep its id.
    if (!onNativePlatform) {
      return { id: nativeId, uri: null, storage: "capacitor-filesystem", mimeType, durationSeconds };
    }
    const lookup = await loadRecordingFromDevice(nativeId, "capacitor-filesystem");
    if (lookup.status === "found") {
      if (lookup.revoke) URL.revokeObjectURL(lookup.url);
      return { id: nativeId, uri: null, storage: "capacitor-filesystem", mimeType, durationSeconds };
    }
  }
  try {
    return await saveRecordingOnDevice(blob, durationSeconds);
  } catch {
    return { id: "", uri: null, storage: "memory", mimeType, durationSeconds };
  }
}

function storageLabel(storage: LocalRecording["storage"]) {
  if (storage === "capacitor-filesystem") return "앱 저장소";
  if (storage === "opfs") return "브라우저 파일 저장소";
  if (storage === "indexeddb") return "브라우저 DB";
  return "임시 메모리";
}

function chunkedSize(chunks: BlobPart[]) {
  return chunks.reduce((total, part) => total + ((part as Blob).size || 0), 0);
}

/**
 * Build the recorded blob once MediaRecorder has finished handing over its chunks.
 * Chrome delivers the final `dataavailable` before `stop`, but WebKit may deliver it
 * after, so poll until the collected size settles (or the wait budget runs out).
 */
async function collectRecordedBlob(chunksRef: { current: BlobPart[] }, mimeType: string): Promise<Blob> {
  const deadline = Date.now() + 1200;
  let previous = -1;
  while (Date.now() < deadline) {
    const total = chunkedSize(chunksRef.current);
    if (total > 0 && total === previous) break;
    previous = total;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return new Blob(chunksRef.current, { type: mimeType });
}

async function transcribeRecording(blob: Blob): Promise<TranscriptionResponse> {
  const extension = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("mpeg") ? "mp3" : "m4a";
  const form = new FormData();
  form.append("audio", blob, `practice.${extension}`);
  return apiFetch<TranscriptionResponse>("/api/learning/speech/transcribe", { method: "POST", body: form });
}

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
  const [sttProvider, setSttProvider] = useState<SttProvider>("MOCK");
  const [comparison, setComparison] = useState<SpeechComparison | null>(null);
  const [localRecording, setLocalRecording] = useState<LocalRecording | null>(null);
  const [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const nativeRecordingRef = useRef<LocalRecording | null>(null);
  const sttProviderRef = useRef<SttProvider>("MOCK");

  const onListenRef = useRef(onListen);
  const onCloseRef = useRef(onClose);
  const onSavedRef = useRef(onSaved);
  const entryRef = useRef(entry);

  useEffect(() => {
    onListenRef.current = onListen;
    onCloseRef.current = onClose;
    onSavedRef.current = onSaved;
    entryRef.current = entry;
  });

  useEffect(() => {
    if (!open) return;
    setRecording(false);
    setProcessing(false);
    setSeconds(0);
    setSpokenText("");
    setSttProvider("MOCK");
    setComparison(null);
    setLocalRecording(null);
    setMessage("");
    setStorageWarning("");
    nativeRecordingRef.current = null;
    sttProviderRef.current = "MOCK";
  }, [open, lineId]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("modal-open");
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Auto close popup when switching tabs
  useEffect(() => {
    if (!open) return;
    const handleTabVisibility = (event: CustomEvent<{ tab: string; active: boolean }>) => {
      if (!event.detail.active) {
        onCloseRef.current();
      }
    };
    window.addEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    return () => {
      window.removeEventListener("loopine:tab-visibility" as any, handleTabVisibility);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const nativeBridge = getNativeRecordingBridge();
    if (!nativeBridge) return;

    nativeBridge.present({ lineId, referenceText, spokenText: "" });

    async function handleNativeAction(event: Event) {
      const customEvent = event as CustomEvent<{
        action: string;
        slow?: boolean;
        spokenText?: string;
        lineId?: string;
        audioBase64?: string;
        mimeType?: string;
        durationSeconds?: number;
        localRecordingId?: string;
        localRecordingStorage?: string;
      }>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.action === "listen") {
        onListenRef.current(Boolean(detail.slow));
      } else if (detail.action === "close") {
        onCloseRef.current();
      } else if (detail.action === "recorded" && detail.audioBase64) {
        const activeBridge = getNativeRecordingBridge();
        activeBridge?.update?.({ message: "녹음을 저장했어요. 음성을 텍스트로 변환하는 중입니다…" });
        try {
          const mimeType = detail.mimeType || "audio/mp4";
          const recordingBlob = base64RecordingToBlob(detail.audioBase64, mimeType);
          const durationSeconds = Math.max(1, Math.round(detail.durationSeconds || 1));
          // Trust the native id only if the file it names is actually readable from
          // here. The native shell and the web layer must agree on the directory, and
          // an older shell build writes somewhere the web layer cannot reach. When it
          // is unreadable, store the bytes we already have instead of recording an id
          // that resolves to nothing.
          nativeRecordingRef.current = await resolveNativeRecording(
            detail.localRecordingId || null,
            recordingBlob,
            mimeType,
            durationSeconds
          );
          const transcript = await transcribeRecording(recordingBlob);
          sttProviderRef.current = transcript.provider;
          setSttProvider(transcript.provider);
          setSpokenText(transcript.text);
          activeBridge?.update?.({
            spokenText: transcript.text,
            message: `음성 인식이 완료됐어요 (${transcript.provider}). 문장을 확인하고 자막과 비교해 보세요.`,
          });
        } catch (caught) {
          sttProviderRef.current = "MOCK";
          activeBridge?.update?.({
            error: `${caught instanceof Error ? caught.message : "음성을 인식하지 못했습니다."} 녹음은 기기에 남아 있으며, 아래 문장을 직접 수정할 수 있어요.`,
          });
        }
      } else if (detail.action === "compare" && detail.spokenText) {
        const normalized = detail.spokenText.trim();
        if (!normalized) return;
        const result = compareSpeech(referenceText, normalized);
        try {
          await apiFetch<AttemptResponse>("/api/learning/speech-attempts", {
            method: "POST",
            body: JSON.stringify({
              content_id: entryRef.current.contentId,
              transcript_line_id: lineId,
              activity_id: entryRef.current.activityId || null,
              routine_item_id: entryRef.current.routineItemId || null,
              routine_snapshot: entryRef.current.routineSnapshot || null,
              entry_source: entryRef.current.entrySource,
              reference_text: referenceText,
              stt_text: normalized,
              comparison: result,
              match_score: result.accuracy,
              duration_seconds: nativeRecordingRef.current?.durationSeconds || 1,
              local_recording_id: nativeRecordingRef.current?.id || null,
              local_recording_storage: nativeRecordingRef.current?.id
                ? nativeRecordingRef.current.storage
                : null,
              stt_provider: sttProviderRef.current,
            }),
          });
          const activeBridge = getNativeRecordingBridge();
          onSavedRef.current?.(result);
          activeBridge?.update?.({
            comparison: result,
            message: "비교 결과를 저장했어요. 오디오는 기기에만 남고 복습·리포트에 연결됩니다.",
          });
        } catch (caught) {
          const activeBridge = getNativeRecordingBridge();
          activeBridge?.update?.({
            error: caught instanceof Error ? caught.message : "비교 결과를 저장하지 못했습니다.",
          });
        }
      }
    }

    window.addEventListener("loopine:native-recording-action", handleNativeAction);
    return () => {
      window.removeEventListener("loopine:native-recording-action", handleNativeAction);
      const activeBridge = getNativeRecordingBridge();
      activeBridge?.close?.();
    };
  }, [open, lineId, referenceText]);

  useEffect(() => {
    if (!open || !recording) return;
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [open, recording]);

  useEffect(() => {
    if (!open || getNativeRecordingBridge()) return;
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
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        void (async () => {
          // WebKit can deliver the final `dataavailable` after `onstop`, so snapshotting
          // the chunk list here would save a truncated or empty recording. Wait for the
          // collected size to stop growing first.
          const blob = await collectRecordedBlob(chunksRef, recorder.mimeType || "audio/webm");
          await persistRecording(blob, durationSeconds);
        })();
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
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      // Flush whatever is buffered before stopping, so the last words are not lost.
      try {
        recorder.requestData();
      } catch {
        // requestData is optional; the stop below still flushes on every engine.
      }
      recorder.stop();
    }
    setRecording(false);
  }

  async function persistRecording(blob: Blob, durationSeconds: number) {
    setProcessing(true);
    setStorageWarning("");
    if (!blob.size) {
      setProcessing(false);
      setLocalRecording(null);
      setStorageWarning("녹음된 소리가 없어요. 마이크를 확인하고 다시 녹음해 주세요.");
      return;
    }

    let saved: LocalRecording | null = null;
    try {
      const result = await saveRecordingOnDevice(blob, durationSeconds);
      // An empty id means no store on this device could keep the audio. Say so now,
      // in a line the transcription progress messages below cannot overwrite.
      saved = result.id ? result : null;
      setLocalRecording(saved);
      if (!saved) {
        setStorageWarning("이 브라우저가 녹음 파일을 저장하지 못했어요. STT 비교 기록만 남고 ‘내 녹음 듣기’는 쓸 수 없습니다.");
      }
    } catch {
      setStorageWarning("녹음을 기기에 저장하지 못했지만 음성 인식은 계속 시도합니다.");
    }
    try {
      setMessage("녹음을 저장했어요. 음성을 텍스트로 변환하는 중입니다…");
      const transcript = await transcribeRecording(blob);
      setSpokenText(transcript.text);
      setSttProvider(transcript.provider);
      sttProviderRef.current = transcript.provider;
      setMessage(`음성 인식이 완료됐어요 (${transcript.provider}). 인식 문장을 확인·수정한 뒤 비교해 보세요.`);
    } catch (caught) {
      setSttProvider("MOCK");
      sttProviderRef.current = "MOCK";
      setMessage(`${caught instanceof Error ? caught.message : "음성을 인식하지 못했습니다."}${saved ? " 녹음은 이 기기에 저장됐어요." : ""} 아래 문장을 직접 입력해도 됩니다.`);
    }
    setProcessing(false);
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
          routine_item_id: entry.routineItemId || null,
          routine_snapshot: entry.routineSnapshot || null,
          entry_source: entry.entrySource,
          reference_text: referenceText,
          stt_text: normalized,
          comparison: result,
          match_score: result.accuracy,
          duration_seconds: localRecording?.durationSeconds || seconds,
          local_recording_id: localRecording?.id || null,
          local_recording_storage: localRecording?.storage || null,
          stt_provider: sttProvider,
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

  const isNative = Boolean(open && typeof window !== "undefined" && getNativeRecordingBridge());
  if (!open || !portalReady || isNative) return null;

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
          <div><strong>{recording ? "녹음 중" : localRecording ? "녹음 저장됨" : "준비되면 눌러 녹음"}</strong><span>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")} · {localRecording ? `${storageLabel(localRecording.storage)}에 저장됨` : "기기 저장"}</span></div>
          {recording && <Pause size={18} />}
        </div>
        <label className="speech-stt-input"><span>STT 인식 문장 <em>{sttProvider === "MOCK" ? "녹음 후 자동 인식" : sttProvider}</em></span><textarea value={spokenText} onChange={(event) => setSpokenText(event.target.value)} placeholder="녹음이 끝나면 인식된 문장이 자동으로 표시됩니다" /></label>
        <button className="primary-button speech-compare-button" onClick={() => void compareAndSave()} disabled={processing || recording}><Check size={17} /> 자막과 비교하기</button>
        {comparison && <div className="speech-comparison"><div><span>일치 단어</span><strong>{comparison.accuracy}%</strong></div><p><b>빠진 단어</b>{comparison.missingWords.length ? comparison.missingWords.map((word, index) => <mark key={`${word}-${index}`}>{word}</mark>) : <em>없음</em>}</p><p><b>다르게 인식된 단어</b>{comparison.differentWords.length ? comparison.differentWords.map((word, index) => <mark className="different" key={`${word}-${index}`}>{word}</mark>) : <em>없음</em>}</p><small>이 값은 자막 단어와 STT 텍스트의 일치도이며, 전문적인 발음·억양 점수가 아닙니다.</small></div>}
        {storageWarning && <p className="speech-storage-warning" role="alert">{storageWarning}</p>}
        {message && <p className="speech-message" role="status">{message}</p>}
      </section>
    </div>,
    document.body
  );
}
