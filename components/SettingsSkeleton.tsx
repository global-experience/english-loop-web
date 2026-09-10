"use client";

import React from "react";

export function SettingsSkeleton() {
  return (
    <div
      className="view-stack settings-skeleton"
      role="status"
      aria-live="polite"
      aria-label="설정을 불러오는 중입니다"
      aria-busy="true"
    >
      <span className="sr-only">설정을 불러오는 중입니다…</span>
      <header className="view-title">
        <p className="eyebrow">SETTINGS</p>
        <h2>계정과 데이터를<br />가볍게 정리하기.</h2>
      </header>

      <div className="settings-form settings-form-skeleton" aria-hidden="true">
        {/* Section 01: 프로필과 목표 */}
        <section className="skeleton-shimmer">
          <div className="settings-heading">
            <div className="settings-heading-num-skeleton" />
            <div>
              <div className="report-skeleton-line w-35 h-md" />
              <div className="report-skeleton-line w-75 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </div>
          <div>
            <div className="report-skeleton-line w-20 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton" />
          </div>
          <div>
            <div className="report-skeleton-line w-25 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton" />
          </div>
          <div>
            <div className="report-skeleton-line w-40 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton textarea" />
          </div>
        </section>

        {/* Section 02: ChatGPT 영어 코치 */}
        <section className="skeleton-shimmer">
          <div className="settings-heading">
            <div className="settings-heading-num-skeleton" />
            <div>
              <div className="report-skeleton-line w-40 h-md" />
              <div className="report-skeleton-line w-70 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </div>
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton" />
          </div>
          <div className="settings-btn-skeleton" />
          <div className="settings-btn-skeleton" />
          <div className="settings-note-skeleton" />
        </section>

        {/* Section 03: 학습 재생 프리셋 */}
        <section className="skeleton-shimmer">
          <div className="settings-heading">
            <div className="settings-heading-num-skeleton" />
            <div>
              <div className="report-skeleton-line w-35 h-md" />
              <div className="report-skeleton-line w-65 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </div>
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="learning-preset-inputs">
              <div className="settings-input-skeleton" />
              <div className="settings-input-skeleton" />
              <div className="settings-input-skeleton" />
            </div>
          </div>
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="learning-preset-inputs">
              <div className="settings-input-skeleton" />
              <div className="settings-input-skeleton" />
              <div className="settings-input-skeleton" />
            </div>
          </div>
        </section>

        {/* Section 04: 시간과 녹음 정책 */}
        <section className="skeleton-shimmer">
          <div className="settings-heading">
            <div className="settings-heading-num-skeleton" />
            <div>
              <div className="report-skeleton-line w-35 h-md" />
              <div className="report-skeleton-line w-80 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </div>
          <div>
            <div className="report-skeleton-line w-35 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton" />
          </div>
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="settings-input-skeleton" />
          </div>
        </section>

        <div className="settings-btn-skeleton primary skeleton-shimmer" />
      </div>

      <section className="settings-tools" aria-hidden="true">
        <div className="settings-tools-skeleton skeleton-shimmer">
          <div className="settings-tools-skeleton-icon" />
          <div className="settings-tools-skeleton-copy">
            <div className="report-skeleton-line w-30 h-sm" />
            <div className="report-skeleton-line w-55 h-xs" />
          </div>
        </div>
      </section>
    </div>
  );
}
