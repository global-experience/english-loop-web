"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

/**
 * Two-step delete button:
 * - On desktop: Inline two-step confirmation widget.
 * - On mobile: Slides up a bottom sheet popup (translation sheet style) with window scroll lock.
 */
export function ConfirmDeleteButton({
  label,
  confirmLabel = "정말 삭제할까요?",
  busy = false,
  compact = false,
  onDelete,
}: {
  label: string;
  confirmLabel?: string;
  busy?: boolean;
  compact?: boolean;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { mobile } = useMobileUi();
  const portalReady = usePortalReady();

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  // Lock background scroll when mobile bottom sheet popup is open
  useEffect(() => {
    if (!asking || !mobile) return;
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
  }, [asking, mobile]);

  function arm() {
    setAsking(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAsking(false), 8000);
  }

  function cancel() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setAsking(false);
  }

  function handleDelete() {
    cancel();
    onDelete();
  }

  return (
    <>
      <button
        type="button"
        className={`review-delete-button ${compact ? "compact" : ""} ${asking ? "active" : ""}`}
        onClick={asking ? cancel : arm}
        disabled={busy}
        aria-label={label}
      >
        {busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
        {!compact && <span>삭제</span>}
      </button>

      {/* Desktop inline confirm */}
      {asking && !mobile && (
        <span className="review-delete-confirm" role="group" aria-label={confirmLabel}>
          <em>{confirmLabel}</em>
          <button type="button" className="review-delete-cancel" onClick={cancel}>
            <X size={14} /> 취소
          </button>
          <button type="button" className="review-delete-yes" onClick={handleDelete} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} 삭제
          </button>
        </span>
      )}

      {/* Mobile Bottom Sheet Popup */}
      {asking && mobile && portalReady && createPortal(
        <div
          className="delete-sheet-layer mobile"
          onClick={cancel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="delete-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="delete-sheet-handle" aria-hidden="true" />

            <div className="delete-sheet-header">
              <div>
                <p className="eyebrow">DELETE CONFIRMATION</p>
                <h3>{label}</h3>
              </div>
              <button type="button" onClick={cancel} aria-label="팝업 닫기">
                <X size={18} />
              </button>
            </div>

            <div className="delete-sheet-body">
              <p>{confirmLabel}</p>
            </div>

            <div className="delete-sheet-actions">
              <button
                type="button"
                className="delete-sheet-confirm-btn"
                onClick={handleDelete}
                disabled={busy}
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} 삭제
              </button>
              <button type="button" className="delete-sheet-cancel-btn" onClick={cancel}>
                취소
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
