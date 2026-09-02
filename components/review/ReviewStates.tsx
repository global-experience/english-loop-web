"use client";

import type { ReactNode } from "react";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="review-panel-state" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={22} />
      <p>{label}</p>
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="review-panel-state error" role="alert">
      <TriangleAlert size={22} />
      <p>{message}</p>
      <button className="secondary-button" onClick={onRetry}>
        <RefreshCw size={16} /> 다시 시도
      </button>
    </div>
  );
}

export function PanelEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="review-panel-state empty">
      <span className="review-empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
