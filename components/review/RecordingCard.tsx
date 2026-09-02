"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Mic, Pause, Pin, PinOff, Play, RotateCcw, Volume2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  deleteRecordingFromDevice,
  loadRecordingFromDevice,
  type LocalRecordingMissingReason,
} from "@/lib/learningSession";
import type { SpeechAttemptRecord } from "@/lib/reviewTypes";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

type AudioState = "idle" | "loading" | "ready" | "missing";

const MISSING_COPY: Record<LocalRecordingMissingReason, string> = {
  "never-saved": "이 녹음은 기기에 저장되지 않았습니다 · STT 비교 기록은 그대로 남아 있어요.",
  "not-on-this-device":
    "이 기기에서 녹음 파일을 찾을 수 없음 · 다른 기기·브라우저에서 녹음했거나 저장 공간이 정리됐어요. STT 비교 기록은 그대로 남아 있어요.",
};

function dateLabel(value: string | null) {
  if (!value) return "날짜 미기록";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "날짜 미기록";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

function matchLabel(score: number) {
  if (score >= 95) return "거의 일치";
  if (score >= 80) return "대부분 일치";
  if (score >= 60) return "일부 일치";
  return "많이 다름";
}

/**
 * A recording is never shown as a standalone audio file: it always sits under the
 * transcript line it belongs to, together with the STT comparison that survives even
 * when the local audio is gone.
 */
export function RecordingCard({
  recording,
  showContentTitle = false,
  onPlayOriginal,
  onRetry,
  onPinChanged,
  onDeleted,
}: {
  recording: SpeechAttemptRecord;
  showContentTitle?: boolean;
  onPlayOriginal?: () => void;
  onRetry?: () => void;
  onPinChanged?: (pinned: boolean) => void;
  onDeleted?: (recordingId: string) => void;
}) {
  // The card renders comparison data straight from the API, so tolerate a row that
  // predates the comparison fields instead of blanking the whole review tab.
  // Whether device audio exists at all is known from the record itself, so the card
  // can say so before the learner taps play.
  const hasLocalAudio = Boolean(recording.local_recording_id) || Boolean(recording.server_audio_url);
  const missingWords = recording.missing_words ?? [];
  const differentWords = recording.different_words ?? [];
  const matchScore = recording.match_score ?? 0;

  const [audioState, setAudioState] = useState<AudioState>(hasLocalAudio ? "idle" : "missing");
  const [missingReason, setMissingReason] = useState<LocalRecordingMissingReason>(
    hasLocalAudio ? "not-on-this-device" : "never-saved"
  );
  const [playing, setPlaying] = useState(false);
  const [pinned, setPinned] = useState(recording.pinned_for_review);
  const [pinBusy, setPinBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revokeRef = useRef<string | null>(null);

  useEffect(() => setPinned(recording.pinned_for_review), [recording.pinned_for_review]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
  }, []);

  async function playMyRecording() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (audioRef.current) {
      void audioRef.current.play();
      setPlaying(true);
      return;
    }
    setAudioState("loading");
    const serverUrl = recording.server_audio_url;
    const lookup = serverUrl
      ? ({ status: "found", url: serverUrl, revoke: false, mimeType: "" } as const)
      : await loadRecordingFromDevice(recording.local_recording_id, recording.local_recording_storage);
    if (lookup.status !== "found") {
      setMissingReason(lookup.status === "missing" ? lookup.reason : "not-on-this-device");
      setAudioState("missing");
      return;
    }
    const audio = new Audio(lookup.url);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      // The blob exists but this browser cannot decode the container.
      setMissingReason("not-on-this-device");
      setAudioState("missing");
      setPlaying(false);
    };
    if (lookup.revoke) revokeRef.current = lookup.url;
    audioRef.current = audio;
    setAudioState("ready");
    setPlaying(true);
    void audio.play().catch(() => {
      setMissingReason("not-on-this-device");
      setAudioState("missing");
      setPlaying(false);
    });
  }

  async function togglePin() {
    setPinBusy(true);
    setMessage("");
    const next = !pinned;
    try {
      await apiFetch(`/api/review/recordings/${recording.id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: next }),
      });
      setPinned(next);
      onPinChanged?.(next);
      setMessage(next ? "복습 큐의 대표 녹음으로 고정했어요." : "복습 고정을 해제했어요.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "복습 고정을 저장하지 못했습니다.");
    } finally {
      setPinBusy(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setMessage("");
    try {
      await apiFetch(`/api/review/recordings/${recording.id}`, { method: "DELETE" });
      audioRef.current?.pause();
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
      // The audio only exists on this device, so clear it once the record is gone.
      await deleteRecordingFromDevice(recording.local_recording_id, recording.local_recording_storage);
      onDeleted?.(recording.id);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "녹음을 삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  const missing = audioState === "missing";

  return (
    <article className={`recording-card ${pinned ? "pinned" : ""}`}>
      <header>
        <span className="recording-mark" aria-hidden="true"><Mic size={14} /></span>
        <div>
          {showContentTitle && recording.content_title && <em>{recording.content_title}</em>}
          <strong>{recording.transcript_line_text || recording.reference_text}</strong>
          <small>
            {dateLabel(recording.created_at)} · {recording.duration_seconds ?? 0}초 · {recording.stt_provider || "STT 미기록"}
          </small>
        </div>
        <span className={`recording-score ${matchScore >= 80 ? "good" : matchScore >= 60 ? "warn" : "bad"}`}>
          <b>{matchScore}%</b>
          <i>{matchLabel(matchScore)}</i>
        </span>
      </header>

      <dl className="recording-compare">
        <div>
          <dt>원문</dt>
          <dd>{recording.reference_text}</dd>
        </div>
        <div>
          <dt>STT 인식</dt>
          <dd className="stt">{recording.stt_text || "인식 결과 없음"}</dd>
        </div>
        <div>
          <dt>빠진 단어</dt>
          <dd>
            {missingWords.length
              ? missingWords.map((word, index) => <mark key={`${word}-${index}`}>{word}</mark>)
              : <em>없음</em>}
          </dd>
        </div>
        <div>
          <dt>다르게 인식</dt>
          <dd>
            {differentWords.length
              ? differentWords.map((word, index) => <mark className="different" key={`${word}-${index}`}>{word}</mark>)
              : <em>없음</em>}
          </dd>
        </div>
      </dl>

      {missing && (
        <p className="recording-missing" role="status">
          <Ban size={14} /> {MISSING_COPY[missingReason]}
        </p>
      )}

      <div className="recording-actions">
        {onPlayOriginal && (
          <button onClick={onPlayOriginal}>
            <Volume2 size={15} /> 원본 듣기
          </button>
        )}
        <button onClick={() => void playMyRecording()} disabled={audioState === "loading" || missing} aria-live="polite">
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {audioState === "loading" ? "녹음 찾는 중…" : playing ? "일시정지" : "내 녹음 듣기"}
        </button>
        {onRetry && (
          <button onClick={onRetry}>
            <RotateCcw size={15} /> 다시 녹음
          </button>
        )}
        <button className={pinned ? "pin-active" : ""} onClick={() => void togglePin()} disabled={pinBusy}>
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          {pinned ? "고정 해제" : "복습에 고정"}
        </button>
        {onDeleted && (
          <ConfirmDeleteButton
            label={`${recording.reference_text} 녹음 삭제`}
            confirmLabel="이 녹음을 삭제할까요?"
            busy={deleting}
            onDelete={() => void remove()}
          />
        )}
      </div>
      {message && <p className="recording-message" role="status">{message}</p>}
    </article>
  );
}
