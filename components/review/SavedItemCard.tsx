"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookOpen, Check, Pencil, RotateCcw, StickyNote, Volume2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { stageLabel, type SavedItem, type SavedItemPatchResponse } from "@/lib/reviewTypes";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

/**
 * One saved word or sentence. The English text comes from the shared `expressions`
 * row and is not editable here; the Korean meaning and the learner's note are
 * per-user overrides, so editing them never changes what other learners see.
 */
export function SavedItemCard({
  item,
  onOpenSource,
  onOpenAudio,
  onEdited,
  onDeleted,
}: {
  item: SavedItem;
  onOpenSource?: () => void;
  onOpenAudio?: () => void;
  onEdited?: (item: SavedItem) => void;
  onDeleted?: (progressId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [meaning, setMeaning] = useState(item.korean_meaning);
  const [note, setNote] = useState(item.user_note || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const dialogTitleId = useId();
  const meaningInputRef = useRef<HTMLTextAreaElement>(null);
  const savingRef = useRef(saving);

  useEffect(() => {
    setMeaning(item.korean_meaning);
    setNote(item.user_note || "");
  }, [item.korean_meaning, item.user_note]);

  const originalMeaning = item.original_meaning || item.korean_meaning;
  const edited = Boolean(item.is_edited);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!editing) return;

    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    html.classList.add("modal-open");
    body.classList.add("modal-open");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    const focusFrame = window.requestAnimationFrame(() => {
      // 모바일에서는 시트가 열리자마자 키보드가 화면을 덮지 않도록 사용자가 입력란을 누를 때 연다.
      const desktopQuery = typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 768px)")
        : null;
      if (desktopQuery?.matches) {
        meaningInputRef.current?.focus({ preventScroll: true });
      }
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) setEditing(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      html.classList.remove("modal-open");
      body.classList.remove("modal-open");
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      if (!navigator.userAgent.toLowerCase().includes("jsdom")) {
        // 전역 `scroll-behavior: smooth`와 무관하게 모달을 열기 전 위치를 즉시 복원한다.
        const previousScrollBehavior = html.style.getPropertyValue("scroll-behavior");
        const previousScrollPriority = html.style.getPropertyPriority("scroll-behavior");
        html.style.setProperty("scroll-behavior", "auto", "important");
        window.scrollTo(0, scrollY);
        window.requestAnimationFrame(() => {
          if (previousScrollBehavior) {
            html.style.setProperty("scroll-behavior", previousScrollBehavior, previousScrollPriority);
          } else {
            html.style.removeProperty("scroll-behavior");
          }
        });
      }
    };
  }, [editing]);

  function startEditing() {
    setError("");
    setMeaning(item.korean_meaning);
    setNote(item.user_note || "");
    setEditing(true);
  }

  function closeEditor() {
    if (saving) return;
    setError("");
    setEditing(false);
  }

  async function save(nextMeaning: string, nextNote: string) {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch<SavedItemPatchResponse>(
        `/api/review/saved-items/${item.expression_progress_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ custom_meaning: nextMeaning.trim(), user_note: nextNote.trim() }),
        }
      );
      onEdited?.({
        ...item,
        korean_meaning: response.korean_meaning,
        original_meaning: response.original_meaning,
        custom_meaning: response.custom_meaning,
        user_note: response.user_note,
        is_edited: response.is_edited,
      });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "수정한 내용을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/api/review/saved-items/${item.expression_progress_id}`, { method: "DELETE" });
      onDeleted?.(item.expression_progress_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  const editorModal = editing && typeof document !== "undefined"
    ? createPortal(
      <div
        className="smart-place-modal-layer saved-item-edit-modal-layer"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeEditor()}
      >
        <section
          className="smart-place-modal-card saved-item-edit-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
        >
          <header className="smart-place-modal-header">
            <div>
              <p>SAVED EXPRESSION</p>
              <h2 id={dialogTitleId}>저장한 {item.item_type === "WORD" ? "단어" : "문장"} 수정</h2>
            </div>
            <button
              type="button"
              className="smart-place-modal-close"
              onClick={closeEditor}
              disabled={saving}
              aria-label="수정 창 닫기"
            >
              <X size={18} />
            </button>
          </header>

          <div className="smart-place-modal-body">
            <div className="saved-item-edit-source">
              <span>원문</span>
              <strong>{item.canonical_text}</strong>
              {item.content_title && <small>{item.content_title}</small>}
            </div>

            <div className="saved-item-editor">
              <label>
                <span>한국어 뜻</span>
                <textarea
                  ref={meaningInputRef}
                  value={meaning}
                  onChange={(event) => setMeaning(event.target.value)}
                  rows={3}
                  maxLength={500}
                  aria-label={`${item.canonical_text} 한국어 뜻`}
                />
              </label>
              <label>
                <span>내 메모</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="언제 쓸지, 무엇을 헷갈렸는지 적어두세요"
                  aria-label={`${item.canonical_text} 내 메모`}
                />
              </label>
              {edited && <small className="saved-item-original">원래 뜻: {originalMeaning}</small>}
              {error && <small className="saved-item-error" role="alert">{error}</small>}
            </div>
          </div>

          <footer className="smart-place-modal-footer saved-item-edit-modal-footer">
            <div>
              {edited && (
                <button
                  type="button"
                  className="saved-item-reset-button"
                  onClick={() => void save("", note)}
                  disabled={saving}
                >
                  <RotateCcw size={14} /> 원래 뜻으로
                </button>
              )}
            </div>
            <div className="smart-place-modal-btn-group">
              <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>
                취소
              </button>
              <button type="button" className="primary-button" onClick={() => void save(meaning, note)} disabled={saving}>
                <Check size={15} /> {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </footer>
        </section>
      </div>,
      document.body
    )
    : null;

  return (
    <>
    <article className="saved-item-row">
      <span className="saved-item-mark" aria-hidden="true"><Bookmark size={13} /></span>
      <div>
        <strong>{item.canonical_text}</strong>
        <p>{item.korean_meaning}</p>
        {item.user_note && (
          <small className="saved-item-note">
            <StickyNote size={12} /> {item.user_note}
          </small>
        )}
        {item.example_sentence && item.example_sentence !== item.canonical_text && (
          <small className="saved-item-example">{item.example_sentence}</small>
        )}
        <em>
          {stageLabel(item.current_stage)}
          {item.level ? ` · ${item.level}` : ""}
          {item.content_title ? ` · ${item.content_title}` : ""}
          {edited ? " · 내가 수정" : ""}
        </em>
        {!editing && error && <small className="saved-item-error" role="alert">{error}</small>}
      </div>

      <div className="content-record-actions">
          {(onOpenAudio || onOpenSource) && (
            <button
              type="button"
              className="saved-item-open"
              onClick={onOpenAudio || onOpenSource}
              aria-label={`${item.canonical_text} 자막 듣기`}
              title="자막 듣기"
            >
              <Volume2 size={16} />
            </button>
          )}
          <button
            type="button"
            className="content-record-continue"
            onClick={startEditing}
            aria-label={`${item.canonical_text} 수정`}
            title="수정"
          >
            <Pencil size={16} />
          </button>
          <ConfirmDeleteButton
            label={`${item.canonical_text} 삭제`}
            confirmLabel="이 항목을 삭제할까요?"
            busy={deleting}
            compact
            onDelete={() => void remove()}
          />
      </div>
    </article>
    {editorModal}
    </>
  );
}
