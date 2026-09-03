"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Trash2, TriangleAlert } from "lucide-react";
import { usePortalReady } from "@/lib/useMobileUi";

/**
 * Confirm delete button using the shared confirm-modal-layer popup.
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
  const portalReady = usePortalReady();

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function arm() {
    setAsking(true);
  }

  function cancel() {
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
        className={`review-delete-button ${compact ? "compact" : ""}`}
        onClick={arm}
        disabled={busy}
        aria-label={label}
      >
        {busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
        {!compact && <span>삭제</span>}
      </button>

      {asking && portalReady && createPortal(
        <div
          className="confirm-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && !busy && cancel()}
        >
          <section className="confirm-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-delete-title">
            <TriangleAlert size={24} />
            <h3 id="confirm-modal-delete-title">{label}</h3>
            <p>{confirmLabel}</p>
            <div>
              <button
                type="button"
                className="secondary-button"
                style={{ border: "1px solid #ffffffb3" }}
                onClick={cancel}
                disabled={busy}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-button danger-action"
                onClick={handleDelete}
                disabled={busy}
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} 삭제
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
