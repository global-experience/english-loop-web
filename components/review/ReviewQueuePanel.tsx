"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Layers, LoaderCircle, Play, Rows3, Sparkles, Square } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  REVIEW_GRADES,
  stageLabel,
  type ReviewGrade,
  type ReviewGradeResponse,
  type ReviewItem,
  type ReviewItemKind,
  type ReviewQueueSummary,
} from "@/lib/reviewTypes";
import { PanelEmpty, PanelError, PanelLoading } from "./ReviewStates";

const KIND_ORDER: ReviewItemKind[] = ["SAVED_EXPRESSION", "SPEAK_AGAIN", "CORRECTION", "NOT_USED"];
const KIND_LABELS: Record<ReviewItemKind, string> = {
  SAVED_EXPRESSION: "저장 표현",
  SPEAK_AGAIN: "다시 말할 문장",
  CORRECTION: "ChatGPT 교정 문장",
  NOT_USED: "사용하지 못한 표현",
};

function nextReviewLabel(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const days = Math.max(0, Math.round((parsed.getTime() - Date.now()) / 86_400_000));
  if (days === 0) return "다음 복습: 오늘 안에";
  if (days === 1) return "다음 복습: 내일";
  return `다음 복습: ${days}일 후`;
}

export function ReviewQueuePanel({
  summary,
  items,
  loading,
  error,
  onRetry,
  onGraded,
  openLearning,
}: {
  summary: ReviewQueueSummary | null;
  items: ReviewItem[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onGraded: (itemId: string, response: ReviewGradeResponse) => void;
  openLearning?: (item: ReviewItem) => void;
}) {
  const [mode, setMode] = useState<"focus" | "list">("focus");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [grading, setGrading] = useState("");
  const [message, setMessage] = useState("");
  const [gradeError, setGradeError] = useState("");

  const counts = summary?.counts;
  const total = items.length;
  const current = items[Math.min(index, Math.max(0, total - 1))];
  const done = summary?.completed_today || 0;
  const progressPercent = summary?.progress_percent || 0;

  const kindChips = useMemo(
    () => KIND_ORDER.map((kind) => ({ kind, label: KIND_LABELS[kind], count: counts?.[kind] || 0 })),
    [counts]
  );

  function reveal(itemId: string) {
    setRevealed((current) => new Set(current).add(itemId));
  }

  async function grade(item: ReviewItem, result: ReviewGrade) {
    setGrading(item.id);
    setGradeError("");
    try {
      const response = await apiFetch<ReviewGradeResponse>("/api/review/grade", {
        method: "POST",
        body: JSON.stringify({ item_id: item.id, result }),
      });
      setMessage(`${item.kind_label} 복습을 저장했어요. ${nextReviewLabel(response.next_review_at)}`);
      setRevealed((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setIndex((value) => Math.max(0, Math.min(value, total - 2)));
      onGraded(item.id, response);
    } catch (caught) {
      setGradeError(caught instanceof Error ? caught.message : "복습 결과를 저장하지 못했습니다.");
    } finally {
      setGrading("");
    }
  }

  if (loading) return <PanelLoading label="오늘 복습할 항목을 모으고 있어요." />;
  if (error) return <PanelError message={error} onRetry={onRetry} />;

  const summaryCard = (
    <section className="review-summary" aria-label="오늘의 복습 요약">
      <div className="review-summary-copy">
        <p className="eyebrow">TODAY&apos;S REVIEW</p>
        <h2>
          {total ? <>오늘 복습할 항목<br /><em>{total}개</em></> : <>오늘 복습을<br /><em>모두 마쳤어요</em></>}
        </h2>
        <p>
          예상 {summary?.estimated_minutes || 0}분 · 완료 {done}개
          {total ? ` · 남은 ${total}개` : ""}
        </p>
      </div>
      <div
        className="progress-orbit review-summary-orbit"
        style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
        aria-label={`오늘 복습 진행률 ${progressPercent}퍼센트`}
      >
        <strong>{progressPercent}</strong>
        <span>%</span>
      </div>
      <div className="review-kind-chips">
        {kindChips.map((chip) => (
          <span key={chip.kind} className={chip.count ? "active" : ""}>
            {chip.label}<b>{chip.count}</b>
          </span>
        ))}
      </div>
    </section>
  );

  if (!total) {
    return (
      <div className="review-panel">
        {summaryCard}
        <PanelEmpty
          icon={<Sparkles size={26} />}
          title="예정된 복습을 마쳤어요."
          description="학습 탭에서 표현을 저장하거나 문장을 녹음하면, ChatGPT 수업 결과가 저장될 때 새 복습 항목이 자동으로 추가됩니다."
        />
        {message && <p className="save-message" role="status">{message}</p>}
      </div>
    );
  }

  return (
    <div className="review-panel">
      {summaryCard}

      {!started ? (
        <div className="review-start-bar review-panel-scene">
          <button className="primary-button review-start-button" onClick={() => { setStarted(true); setIndex(0); }}>
            <Play size={18} fill="currentColor" /> 복습 시작
          </button>
          <button className="text-button" onClick={() => { setStarted(true); setMode("list"); }}>
            목록으로 훑어보기
          </button>
        </div>
      ) : (
        <div className="review-mode-row review-panel-scene">
          <div className="segmented review-mode-switch" role="tablist" aria-label="복습 카드 표시 방식">
            <button role="tab" aria-selected={mode === "focus"} className={mode === "focus" ? "active" : ""} onClick={() => setMode("focus")}>
              <Layers size={15} /> 집중 모드
            </button>
            <button role="tab" aria-selected={mode === "list"} className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>
              <Rows3 size={15} /> 목록 모드
            </button>
          </div>
          <button className="text-button" onClick={() => setStarted(false)}>
            <Square size={14} /> 세션 종료
          </button>
        </div>
      )}

      {gradeError && <p className="review-inline-error" role="alert">{gradeError}</p>}
      {message && <p className="save-message" role="status">{message}</p>}

      {started && mode === "focus" && current && (
        <article key={current.id} className="review-focus-card review-panel-scene">
          <div className="review-focus-top">
            <span>{current.kind_label}</span>
            <small>{index + 1} / {total}</small>
          </div>
          <p className="review-focus-prompt">{current.prompt_ko}</p>
          <h3 className="review-focus-question">
            {current.kind === "SPEAK_AGAIN" || current.kind === "CORRECTION" ? current.answer_text : current.prompt_ko}
          </h3>
          {current.kind === "CORRECTION" && current.example_sentence && (
            <p className="review-focus-original"><s>{current.example_sentence}</s></p>
          )}
          {current.note && <p className="review-focus-note">{current.note}</p>}

          {revealed.has(current.id) ? (
            <div className="review-focus-answer">
              <strong>{current.answer_text}</strong>
              {current.example_sentence && current.example_sentence !== current.answer_text && (
                <p>{current.example_sentence}</p>
              )}
              <small>{stageLabel(current.current_stage)}{current.match_score !== null ? ` · ${current.match_score}% 단어 일치` : ""}</small>
            </div>
          ) : (
            <button className="secondary-button wide" onClick={() => reveal(current.id)}>
              정답 확인 <ArrowRight size={17} />
            </button>
          )}

          <div className="review-focus-foot">
            {current.content_id && openLearning && (
              <button className="text-button review-jump-button" onClick={() => openLearning(current)}>
                <BookOpen size={15} /> {current.content_title || "원본 영상"}에서 이어 학습
              </button>
            )}
            <div className="review-grades" role="group" aria-label="복습 결과 평가">
              {REVIEW_GRADES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => void grade(current, option.value)}
                  disabled={!revealed.has(current.id) || grading === current.id}
                >
                  {grading === current.id ? <LoaderCircle className="spin" size={15} /> : option.label}
                  <i>{option.hint}</i>
                </button>
              ))}
            </div>
          </div>
        </article>
      )}

      {started && mode === "list" && (
        <ul key={mode} className="review-list-mode review-panel-scene">
          {items.map((item) => (
            <li key={item.id}>
              <article>
                <header>
                  <span>{item.kind_label}</span>
                  {item.content_title && <em>{item.content_title}</em>}
                </header>
                <p className="review-list-prompt">{item.prompt_ko}</p>
                {revealed.has(item.id) ? (
                  <div className="review-list-answer">
                    <strong>{item.answer_text}</strong>
                    {item.example_sentence && item.example_sentence !== item.answer_text && <p>{item.example_sentence}</p>}
                  </div>
                ) : (
                  <button className="text-button" onClick={() => reveal(item.id)}>정답 확인</button>
                )}
                <div className="review-grades compact" role="group" aria-label={`${item.kind_label} 평가`}>
                  {REVIEW_GRADES.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => void grade(item, option.value)}
                      disabled={!revealed.has(item.id) || grading === item.id}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {item.content_id && openLearning && (
                  <button className="text-button review-jump-button" onClick={() => openLearning(item)}>
                    <BookOpen size={14} /> 원본 자막으로 이동
                  </button>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
