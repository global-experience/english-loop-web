"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Bookmark, Check, Mic, MessageSquareQuote, Quote, Volume2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  durationLabel,
  relativeDayLabel,
  type ContentDetailResponse,
  type ContentProgressCard,
  type SavedItem,
  type SpeechAttemptRecord,
  type TranscriptLineRecord,
} from "@/lib/reviewTypes";
import { RecordingCard } from "./RecordingCard";
import { SavedItemCard } from "./SavedItemCard";
import { PanelEmpty, PanelError, PanelLoading } from "./ReviewStates";

type DetailTab = "expressions" | "sentences" | "recordings" | "corrections";

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "expressions", label: "표현" },
  { key: "sentences", label: "문장" },
  { key: "recordings", label: "녹음" },
  { key: "corrections", label: "오답·교정" },
];

export function ContentDetailPanel({
  card,
  onBack,
  openLearning,
}: {
  card: ContentProgressCard;
  onBack: () => void;
  openLearning?: (target: { contentId: string; transcriptLineId?: string | null; card: ContentProgressCard }) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("expressions");
  const [detail, setDetail] = useState<ContentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await apiFetch<ContentDetailResponse>(`/api/review/contents/${encodeURIComponent(card.content_id)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이 영상의 학습 기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [card.content_id]);

  useEffect(() => { void load(); }, [load]);

  type SavedBucket = "expressions" | "sentences";

  const replaceSavedItem = useCallback((bucket: SavedBucket, next: SavedItem) => {
    setDetail((current) => current && ({
      ...current,
      [bucket]: current[bucket].map((row) =>
        row.expression_progress_id === next.expression_progress_id ? next : row
      ),
    }));
  }, []);

  const removeSavedItem = useCallback((bucket: SavedBucket, progressId: string) => {
    setDetail((current) => current && ({
      ...current,
      [bucket]: current[bucket].filter((row) => row.expression_progress_id !== progressId),
      content: {
        ...current.content,
        saved_item_count: Math.max(0, current.content.saved_item_count - 1),
      },
    }));
  }, []);

  const removeRecording = useCallback((recordingId: string) => {
    setDetail((current) => current && ({
      ...current,
      recordings: current.recordings.filter((row) => row.id !== recordingId),
      content: {
        ...current.content,
        speech_attempt_count: Math.max(0, current.content.speech_attempt_count - 1),
      },
    }));
  }, []);

  const lineIndex = useMemo(() => {
    const map = new Map<string, TranscriptLineRecord>();
    for (const line of detail?.transcript_lines || []) map.set(line.id, line);
    return map;
  }, [detail?.transcript_lines]);

  /**
   * Recordings are never a standalone audio list: every attempt is grouped under the
   * transcript line it belongs to, in transcript order.
   */
  const recordingGroups = useMemo(() => {
    const groups = new Map<string, { line: TranscriptLineRecord | null; attempts: SpeechAttemptRecord[] }>();
    for (const recording of detail?.recordings || []) {
      const key = recording.transcript_line_id;
      const group = groups.get(key) || { line: lineIndex.get(key) || null, attempts: [] };
      group.attempts.push(recording);
      groups.set(key, group);
    }
    return Array.from(groups.entries())
      .map(([lineId, group]) => ({ lineId, ...group }))
      .sort((left, right) => (left.line?.sequence ?? 9999) - (right.line?.sequence ?? 9999));
  }, [detail?.recordings, lineIndex]);

  const header = detail?.content || card;
  const counts = {
    expressions: detail?.expressions.length || 0,
    sentences: detail?.sentences.length || 0,
    recordings: detail?.recordings.length || 0,
    corrections: detail?.corrections.length || 0,
  };

  function jump(transcriptLineId?: string | null) {
    openLearning?.({ contentId: card.content_id, transcriptLineId: transcriptLineId || null, card });
  }

  return (
    <div className="review-panel content-detail review-panel-scene">
      <button className="text-button content-detail-back" onClick={onBack}>
        <ArrowLeft size={16} /> 영상별 기록으로
      </button>

      <header className="content-detail-header">
        <span className="content-detail-thumb">
          {header.thumbnail_url ? <img src={header.thumbnail_url} alt="" /> : <BookOpen size={22} aria-hidden="true" />}
        </span>
        <div>
          <em>{header.source_label}</em>
          <h2>{header.title}</h2>
          <small>
            {relativeDayLabel(header.last_studied_at)} · {durationLabel(header.duration_seconds)} ·
            {" "}자막 {header.practiced_line_count}/{header.total_line_count || "—"}
          </small>
          <div className="content-record-progress" aria-label={`진행률 ${header.progress_percent}퍼센트`}>
            <i style={{ width: `${Math.max(2, header.progress_percent)}%` }} />
            <span>{header.progress_percent}%</span>
          </div>
        </div>
      </header>

      <div className="segmented content-detail-tabs" role="tablist" aria-label="학습 기록 분류">
        {DETAIL_TABS.map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={tab === option.key}
            className={tab === option.key ? "active" : ""}
            onClick={() => setTab(option.key)}
          >
            {option.label}<b>{counts[option.key]}</b>
          </button>
        ))}
      </div>

      {loading && <PanelLoading label="학습 기록을 불러오고 있어요." />}
      {error && <PanelError message={error} onRetry={() => void load()} />}

      {!loading && !error && detail && (
        <>
          {tab === "expressions" && (
            counts.expressions ? (
              <div className="saved-item-list">
                {detail.expressions.map((item) => (
                  <SavedItemCard
                    key={item.expression_progress_id}
                    item={item}
                    onOpenSource={openLearning ? () => jump(item.transcript_line_id) : undefined}
                    onEdited={(next) => replaceSavedItem("expressions", next)}
                    onDeleted={(progressId) => removeSavedItem("expressions", progressId)}
                  />
                ))}
              </div>
            ) : (
              <PanelEmpty
                icon={<Bookmark size={24} />}
                title="저장한 표현이 없어요."
                description="학습 탭에서 자막의 단어나 구절을 선택해 저장하면 여기에 모입니다."
              />
            )
          )}

          {tab === "sentences" && (
            counts.sentences ? (
              <div className="saved-item-list">
                {detail.sentences.map((item) => (
                  <SavedItemCard
                    key={item.expression_progress_id}
                    item={item}
                    onOpenSource={openLearning ? () => jump(item.transcript_line_id) : undefined}
                    onEdited={(next) => replaceSavedItem("sentences", next)}
                    onDeleted={(progressId) => removeSavedItem("sentences", progressId)}
                  />
                ))}
              </div>
            ) : (
              <PanelEmpty
                icon={<Quote size={24} />}
                title="저장한 문장이 없어요."
                description="자막 문장을 저장하면 원본 영상과 자막 위치에 연결되어 남습니다."
              />
            )
          )}

          {tab === "recordings" && (
            counts.recordings ? (
              <div className="recording-line-groups">
                {recordingGroups.map((group) => (
                  <section className="recording-line-group" key={group.lineId}>
                    <header>
                      <span>{group.line ? `LINE ${group.line.sequence}` : "자막 위치 미확인"}</span>
                      <strong>{group.line?.english_text || group.attempts[0]?.reference_text}</strong>
                      {group.line?.korean_meaning && <p>{group.line.korean_meaning}</p>}
                      <button className="text-button" onClick={() => jump(group.lineId)}>
                        <Volume2 size={14} /> 이 문장으로 이동
                      </button>
                    </header>
                    <div className="recording-list">
                      {group.attempts.map((recording) => (
                        <RecordingCard
                          key={recording.id}
                          recording={{
                            ...recording,
                            transcript_line_text: group.line?.english_text || recording.transcript_line_text,
                          }}
                          onPlayOriginal={() => jump(recording.transcript_line_id)}
                          onRetry={() => jump(recording.transcript_line_id)}
                          onDeleted={removeRecording}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <PanelEmpty
                icon={<Mic size={24} />}
                title="녹음 기록이 없어요."
                description="학습 탭에서 문장을 따라 말하면 해당 자막 문장 아래에 녹음과 STT 비교가 남습니다."
              />
            )
          )}

          {tab === "corrections" && (
            counts.corrections ? (
              <div className="correction-list">
                {detail.corrections.map((correction) => (
                  <article key={correction.id}>
                    <p><s>{correction.original}</s></p>
                    <strong><Check size={16} />{correction.corrected}</strong>
                    <small>{correction.reason_ko}{correction.study_date ? ` · ${correction.study_date}` : ""}</small>
                  </article>
                ))}
              </div>
            ) : (
              <PanelEmpty
                icon={<MessageSquareQuote size={24} />}
                title="교정 기록이 없어요."
                description="ChatGPT 음성 수업 결과가 저장되면 교정 문장이 이곳에 함께 모입니다."
              />
            )
          )}
        </>
      )}
    </div>
  );
}
