"use client";

import React from "react";

export function ReportSkeleton() {
  return (
    <div className="report-skeleton-group" role="status" aria-busy="true" aria-live="polite" data-testid="report-skeleton">
      <span className="sr-only">리포트 데이터를 불러오는 중입니다...</span>

      {/* 1. Metric Grid Skeleton (5 cards with lateral shimmer wave) */}
      <section className="metric-grid" aria-hidden="true">
        <article className="metric-card skeleton-shimmer skeleton-card-acid">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-60 h-lg" />
          <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-50 h-lg" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-40 h-lg" />
          <div className="report-skeleton-line w-35 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer skeleton-card-ink">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-50 h-lg" />
          <div className="report-skeleton-line w-60 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-45 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-40 h-lg" />
          <div className="report-skeleton-line w-55 h-xs" style={{ marginTop: "auto" }} />
        </article>
      </section>

      {/* 2. AI Personalization Skeleton */}
      <section className="latest-report skeleton-shimmer skeleton-dark" aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-50 h-md" />
          </div>
          <div className="report-skeleton-badge" />
        </div>
        <div className="report-skeleton-line w-75 h-xs" style={{ margin: "14px 0 16px" }} />
        <div className="compact-list" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <article style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="status-dot skeleton-dot dark" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-40 h-sm" />
              <div className="report-skeleton-line w-60 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
          <article style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="status-dot skeleton-dot dark" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-45 h-sm" />
              <div className="report-skeleton-line w-65 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
        </div>
      </section>

      {/* 3. Routine Consistency Skeleton */}
      <section className="routine-chart skeleton-shimmer skeleton-routine" aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-40 h-md" />
          </div>
        </div>
        {[65, 80, 45, 70].map((width, idx) => (
          <div className="bar-row" key={idx}>
            <div className="report-skeleton-line w-80 h-xs" />
            <div className="skeleton-bar-track">
              <div className="skeleton-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="report-skeleton-line w-70 h-xs" style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </section>

      {/* 4. Weakness Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-35 h-md" />
          </div>
        </div>
        <div className="weakness-list">
          <article className="skeleton-shimmer">
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-35 h-sm" />
              <div className="report-skeleton-line w-65 h-xs" style={{ marginTop: "7px" }} />
            </div>
            <div className="report-skeleton-line w-20 h-xs" />
          </article>
        </div>
      </section>

      {/* 5. Missing Words Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-40 h-md" />
          </div>
        </div>
        <div className="compact-list">
          <article className="skeleton-shimmer">
            <span className="status-dot skeleton-dot" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-25 h-sm" />
              <div className="report-skeleton-line w-45 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
          <article className="skeleton-shimmer">
            <span className="status-dot skeleton-dot" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-30 h-sm" />
              <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
        </div>
      </section>

      {/* 6. Voice Report Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-35 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-45 h-md" />
          </div>
        </div>
        <article className="latest-report skeleton-shimmer skeleton-dark">
          <div className="report-skeleton-line w-90 h-sm" />
          <div className="report-skeleton-line w-65 h-sm" style={{ marginTop: "8px" }} />
          <div className="report-scores">
            {[1, 2, 3, 4].map((i) => (
              <span className="skeleton-score-box" key={i}>
                <div className="report-skeleton-line w-50 h-xs" />
                <div className="report-skeleton-line w-70 h-sm" style={{ marginTop: "5px" }} />
              </span>
            ))}
          </div>
          <div className="report-skeleton-line w-35 h-xs" style={{ marginTop: "20px", marginBottom: "10px" }} />
          <div className="report-correction">
            <div className="report-skeleton-line w-55 h-xs" />
            <div className="report-skeleton-line w-70 h-sm" style={{ marginTop: "6px" }} />
          </div>
        </article>
      </section>
    </div>
  );
}

export function ReportViewSkeleton() {
  return (
    <div className="view-stack" role="status" aria-busy="true" aria-live="polite">
      <header className="view-title report-title">
        <div>
          <p className="eyebrow">PROGRESS, NOT POINTS</p>
          <h2>점수보다 중요한<br />실제 사용의 변화.</h2>
        </div>
        <div className="segmented" aria-hidden="true">
          <button className="active" tabIndex={-1}>7일</button>
          <button tabIndex={-1}>14일</button>
        </div>
      </header>
      <ReportSkeleton />
    </div>
  );
}
