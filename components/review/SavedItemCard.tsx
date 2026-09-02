"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookOpen, Check, Pencil, RotateCcw, StickyNote, X } from "lucide-react";
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
  onEdited,
  onDeleted,
}: {
  item: SavedItem;
  onOpenSource?: () => void;
  onEdited?: (item: SavedItem) => void;
  onDeleted?: (progressId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [meaning, setMeaning] = useState(item.korean_meaning);
  const [note, setNote] = useState(item.user_note || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMeaning(item.korean_meaning);
    setNote(item.user_note || "");
  }, [item.korean_meaning, item.user_note]);

  const originalMeaning = item.original_meaning || item.korean_meaning;
  const edited = Boolean(item.is_edited);

  function startEditing() {
    setError("");
    setMeaning(item.korean_meaning);
    setNote(item.user_note || "");
    setEditing(true);
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

  return (
    <article className={`saved-item-row ${editing ? "editing" : ""}`}>
      <span className="saved-item-mark" aria-hidden="true"><Bookmark size={13} /></span>
      <div>
        <strong>{item.canonical_text}</strong>

        {editing ? (
          <div className="saved-item-editor">
            <label>
              <span>한국어 뜻</span>
              <textarea
                value={meaning}
                onChange={(event) => setMeaning(event.target.value)}
                rows={2}
                maxLength={500}
                aria-label={`${item.canonical_text} 한국어 뜻`}
              />
            </label>
            <label>
              <span>내 메모</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="언제 쓸지, 무엇을 헷갈렸는지 적어두세요"
                aria-label={`${item.canonical_text} 내 메모`}
              />
            </label>
            <div className="saved-item-editor-actions">
              <button className="primary-button" onClick={() => void save(meaning, note)} disabled={saving}>
                <Check size={15} /> {saving ? "저장 중…" : "저장"}
              </button>
              <button className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>
                <X size={15} /> 취소
              </button>
              {edited && (
                <button className="text-button" onClick={() => void save("", note)} disabled={saving}>
                  <RotateCcw size={14} /> 원래 뜻으로
                </button>
              )}
            </div>
            {edited && <small className="saved-item-original">원래 뜻: {originalMeaning}</small>}
          </div>
        ) : (
          <>
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
            <div className="saved-item-actions">
              <button type="button" onClick={startEditing} aria-label={`${item.canonical_text} 수정`}>
                <Pencil size={14} /> 수정
              </button>
              <ConfirmDeleteButton
                label={`${item.canonical_text} 삭제`}
                confirmLabel="이 항목을 삭제할까요?"
                busy={deleting}
                onDelete={() => void remove()}
              />
            </div>
          </>
        )}

        {error && <small className="saved-item-error" role="alert">{error}</small>}
      </div>
      {onOpenSource && !editing && (
        <button className="saved-item-open" onClick={onOpenSource} aria-label={`${item.canonical_text} 원본 자막으로 이동`}>
          <BookOpen size={16} />
        </button>
      )}
    </article>
  );
}
