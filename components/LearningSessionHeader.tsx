"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Clock3, FolderOpen, LogOut, Route, Save, X } from "lucide-react";
import { routineLabel, type LearningSessionEntry } from "@/lib/learningSession";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

export function SessionResultModal({
  open,
  onClose,
  summary,
  missingWords,
  onGoToReview,
  onNextRoutine,
  onEndSession,
}: {
  open: boolean;
  onClose: () => void;
  summary: { practiced: number; saved: number; retry: number };
  missingWords?: Set<string>;
  onGoToReview?: () => void;
  onNextRoutine?: () => void;
  onEndSession: () => void;
}) {
  const { mobile } = useMobileUi();
  const portalReady = usePortalReady();

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    const previousRootStyle = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
      scrollBehavior: root.style.scrollBehavior,
    };

    root.classList.add("translation-sheet-open");
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    root.style.scrollBehavior = "auto";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      root.classList.remove("translation-sheet-open");
      Object.assign(body.style, previousBodyStyle);
      root.style.overflow = previousRootStyle.overflow;
      root.style.overscrollBehavior = previousRootStyle.overscrollBehavior;
      if (window.scrollY !== scrollY) {
        window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      }
      root.style.scrollBehavior = previousRootStyle.scrollBehavior;
    };
  }, [open]);

  if (!open || !portalReady) return null;

  return createPortal(
    <div
      className={`session-result-modal-layer ${mobile ? "mobile" : "desktop"}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="학습 세션 결과"
    >
      <div className="session-result-modal" onClick={(e) => e.stopPropagation()}>
        {mobile && <div className="session-result-modal-handle" aria-hidden="true" />}
        <div className="session-result-modal-header">
          <div>
            <p className="eyebrow">SESSION RESULT</p>
            <h3>지금까지의 학습 성과</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="팝업 닫기">
            <X size={18} />
          </button>
        </div>

        <div className="session-result-grid">
          <span>
            <strong>{summary.practiced}</strong>연습한 문장
          </span>
          <span>
            <strong>{summary.saved}</strong>저장한 표현
          </span>
          <span>
            <strong>{summary.retry}</strong>다시 말할 문장
          </span>
        </div>

        <p className="session-result-hint">
          {summary.retry > 0
            ? "STT 비교에서 빠진 단어가 있는 문장은 복습 대상으로 표시됩니다."
            : "문장 말해보기까지 완료하면 다시 말할 문장과 빠진 단어가 여기에 모입니다."}
        </p>

        {missingWords && missingWords.size > 0 && (
          <div className="session-missing-words">
            <strong>자주 빠진 단어</strong>
            {Array.from(missingWords).map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
        )}

        <div className="session-result-modal-actions">
          {onNextRoutine && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onNextRoutine();
                onClose();
              }}
            >
              <Save size={16} /> 다음 루틴으로
            </button>
          )}
          {onGoToReview && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                onGoToReview();
                onClose();
              }}
            >
              복습에 추가하고 보기
            </button>
          )}
          <button
            type="button"
            className="end-session-modal-button"
            onClick={onEndSession}
          >
            <LogOut size={16} /> 세션 종료하기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function LearningSessionHeader({
  entry,
  progress,
  remainingMinutes,
  onChangeContent,
  onEndSession,
  summary,
  missingWords,
  onGoToReview,
  onNextRoutine,
}: {
  entry: LearningSessionEntry;
  progress: number;
  remainingMinutes: number;
  onChangeContent: () => void;
  onEndSession: () => void;
  summary?: { practiced: number; saved: number; retry: number };
  missingWords?: Set<string>;
  onGoToReview?: () => void;
  onNextRoutine?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const sourceLabel =
    entry.sourceLabel ||
    (entry.entrySource === "today"
      ? "오늘 루틴"
      : entry.entrySource === "feed"
      ? "피드"
      : entry.entrySource === "library"
      ? "내 콘텐츠"
      : "직접 추가");

  return (
    <>
      <header className="learning-session-header">
        <div className="learning-session-topline">
          <span>{sourceLabel}</span>
          <span>
            <Route size={13} /> {entry.routineItemName || routineLabel(entry.routineStep)}
          </span>
          {summary && (
            <span className="compact-session-summary">
              연습 <strong>{summary.practiced}</strong> · 저장{" "}
              <strong>{summary.saved}</strong> · 복습{" "}
              <strong>{summary.retry}</strong>
            </span>
          )}
        </div>
        <div className="learning-session-title">
          <div>
            <p className="eyebrow">ACTIVE SESSION</p>
            <h2>{entry.title || "영어 학습 세션"}</h2>
          </div>
          <div className="learning-session-actions">
            <button onClick={onChangeContent}>
              <FolderOpen size={15} /> 콘텐츠 변경
            </button>
            <button onClick={() => setModalOpen(true)}>
              <LogOut size={15} /> 세션 종료
            </button>
          </div>
        </div>
        <div className="learning-session-progress">
          <div>
            <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <p>
            <CheckCircle2 size={14} /> {Math.round(progress)}% 진행
          </p>
          <p>
            <Clock3 size={14} /> 약 {Math.max(1, remainingMinutes)}분 남음
          </p>
        </div>
      </header>

      <SessionResultModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        summary={summary || { practiced: 0, saved: 0, retry: 0 }}
        missingWords={missingWords}
        onGoToReview={onGoToReview}
        onNextRoutine={onNextRoutine}
        onEndSession={onEndSession}
      />
    </>
  );
}
