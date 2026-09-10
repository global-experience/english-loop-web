"use client";

import React from "react";
import type { LibraryKind } from "@/lib/reviewTypes";

/**
 * 1. 오늘의 복습 스켈레톤 (ReviewQueueSkeleton)
 * 요약 카드(오르빗 원형 진행률, 4개 칩) + 시작 바 + 포커스 복습 카드 레이아웃
 */
export function ReviewQueueSkeleton() {
  return (
    <div className="review-panel review-queue-skeleton" role="status" aria-busy="true" aria-label="오늘의 복습 항목을 불러오는 중입니다">
      <p className="sr-only">오늘 복습할 항목을 모으고 있어요.</p>

      {/* 요약 카드 스켈레톤 (var(--ink) 다크 테마 일치) */}
      <section className="review-summary skeleton-shimmer skeleton-dark" aria-hidden="true">
        <div className="review-summary-copy">
          <div className="skeleton-dark-line" style={{ width: 105, height: 10, marginBottom: 12 }} />
          <div className="skeleton-summary-title">
            <div className="skeleton-dark-line" style={{ width: "min(210px, 75%)", height: 32, marginBottom: 6, borderRadius: 8 }} />
            <div className="skeleton-dark-line skeleton-dark-acid" style={{ width: 78, height: 32, marginBottom: 12, borderRadius: 8 }} />
          </div>
          <div className="skeleton-dark-line" style={{ width: "min(220px, 80%)", height: 13 }} />
        </div>

        {/* 원형 오르빗 진행률 뼈대 (54px 원형 + 0% 라벨 위치 동일) */}
        <div className="review-summary-orbit skeleton-orbit" />

        {/* 복습 종류 칩 4개 뼈대 (실제 칩과 동일한 알약 규격 및 다크 색상) */}
        <div className="review-kind-chips">
          <span className="skeleton-chip">
            <span className="skeleton-dark-line" style={{ width: 46, height: 10 }} />
            <span className="skeleton-chip-badge" style={{ width: 18 }} />
          </span>
          <span className="skeleton-chip">
            <span className="skeleton-dark-line" style={{ width: 68, height: 10 }} />
            <span className="skeleton-chip-badge" style={{ width: 18 }} />
          </span>
          <span className="skeleton-chip">
            <span className="skeleton-dark-line" style={{ width: 96, height: 10 }} />
            <span className="skeleton-chip-badge" style={{ width: 14 }} />
          </span>
          <span className="skeleton-chip">
            <span className="skeleton-dark-line" style={{ width: 90, height: 10 }} />
            <span className="skeleton-chip-badge" style={{ width: 14 }} />
          </span>
        </div>
      </section>

      {/* 복습 시작 바 뼈대 (개별 컴포넌트 규격/색상 분리: 검정 시작 버튼 + 텍스트 버튼) */}
      <div className="review-start-bar review-start-bar-skeleton" aria-hidden="true">
        <div className="skeleton-btn review-start-btn-skeleton skeleton-shimmer">
          <span className="skeleton-start-icon" />
          <span className="skeleton-start-text" />
        </div>
        <div className="skeleton-btn review-overview-btn-skeleton skeleton-shimmer">
          <span className="skeleton-overview-text" />
        </div>
      </div>
    </div>
  );
}

/**
 * 2. 영상별 기록 스켈레톤 (ContentRecordsSkeleton)
 * 최근 학습, 복습 필요, 저장 많음 탭 전환 및 초기 데이터 로딩 시 노출
 */
export function ContentRecordsSkeleton() {
  return (
    <div className="content-record-list review-skeleton-list" role="status" aria-busy="true" aria-label="영상별 학습 기록을 불러오는 중입니다">
      <p className="sr-only">영상별 학습 기록을 불러오고 있어요.</p>
      {[1, 2, 3, 4].map((id) => (
        <article key={id} className="skeleton-content-card skeleton-shimmer" aria-hidden="true">
          <div className="content-record-main">
            {/* 16:9 썸네일 박스 */}
            <span className="content-record-thumb skeleton-thumb" />

            {/* 본문 컬럼 */}
            <div className="content-record-copy">
              <div className="report-skeleton-line h-xs w-25" />
              <div className="report-skeleton-line h-sm w-85" style={{ margin: "3px 0 2px" }} />
              <div className="report-skeleton-line h-sm w-60" style={{ marginBottom: "4px" }} />
              <div className="report-skeleton-line h-xs w-35" style={{ marginBottom: "6px" }} />

              {/* 진행률 바 뼈대 */}
              <div className="skeleton-bar-track" style={{ height: 4, width: "100%", marginBottom: 6 }}>
                <div className="skeleton-bar-fill" style={{ width: `${35 + (id * 15)}%` }} />
              </div>

              {/* 하단 3개 통계 뱃지 */}
              <ul className="content-record-stats">
                <li><div className="report-skeleton-line h-xs" style={{ width: 42 }} /></li>
                <li><div className="report-skeleton-line h-xs" style={{ width: 50 }} /></li>
                <li><div className="report-skeleton-line h-xs" style={{ width: 34 }} /></li>
              </ul>
            </div>
          </div>

          {/* 우측 재생 버튼 뼈대 */}
          <div className="content-record-actions">
            <div className="skeleton-btn skeleton-circle-btn" />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * 3. 내 보관함 스켈레톤 (LibrarySkeleton)
 * 전체 단어, 전체 문장, 찜한 영상, 대표 녹음 서브탭 전환 시 알맞은 카드 형태 스켈레톤 제공
 */
export function LibrarySkeleton({ kind = "words" }: { kind?: LibraryKind }) {
  if (kind === "videos") {
    return (
      <div className="library-video-list review-skeleton-list" role="status" aria-busy="true" aria-label="찜한 영상을 불러오는 중입니다">
        <p className="sr-only">보관함을 불러오고 있어요.</p>
        {[1, 2, 3].map((id) => (
          <article key={id} className="skeleton-video-card skeleton-shimmer" aria-hidden="true">
            <span className="content-record-thumb skeleton-thumb" />
            <div>
              <div className="report-skeleton-line h-xs w-20" style={{ marginBottom: 4 }} />
              <div className="report-skeleton-line h-sm w-80" style={{ marginBottom: 3 }} />
              <div className="report-skeleton-line h-sm w-50" style={{ marginBottom: 4 }} />
              <div className="report-skeleton-line h-xs w-35" />
            </div>
            <div className="content-record-actions">
              <div className="skeleton-btn skeleton-circle-btn" />
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (kind === "recordings") {
    return (
      <div className="recording-list review-skeleton-list" role="status" aria-busy="true" aria-label="대표 녹음을 불러오는 중입니다">
        <p className="sr-only">보관함을 불러오고 있어요.</p>
        {[1, 2, 3].map((id) => (
          <article key={id} className="skeleton-recording-card skeleton-shimmer" aria-hidden="true">
            <header>
              <span className="recording-mark skeleton-mark" />
              <div>
                <div className="report-skeleton-line h-xs w-25" style={{ marginBottom: 3 }} />
                <div className="report-skeleton-line h-sm w-75" style={{ marginBottom: 3 }} />
                <div className="report-skeleton-line h-xs w-45" />
              </div>
            </header>
            <div className="skeleton-audio-track" />
            <div className="report-skeleton-line h-sm w-85" style={{ marginTop: 2 }} />
          </article>
        ))}
      </div>
    );
  }

  // 기본: words 및 sentences (단어 및 문장)
  const label = kind === "sentences" ? "전체 문장을 불러오는 중입니다" : "전체 단어를 불러오는 중입니다";
  return (
    <div className="saved-item-list review-skeleton-list" role="status" aria-busy="true" aria-label={label}>
      <p className="sr-only">보관함을 불러오고 있어요.</p>
      {[1, 2, 3, 4, 5].map((id) => (
        <article key={id} className="skeleton-saved-item skeleton-shimmer" aria-hidden="true">
          <span className="saved-item-mark skeleton-mark" />
          <div style={{ flex: 1 }}>
            <div className="report-skeleton-line h-md" style={{ width: `${40 + ((id % 3) * 15)}%`, marginBottom: 6 }} />
            <div className="report-skeleton-line h-sm" style={{ width: `${60 + ((id % 4) * 10)}%`, marginBottom: 4 }} />
            <div className="report-skeleton-line h-xs w-20" />
          </div>
          <div className="saved-item-skeleton-actions">
            <div className="skeleton-btn skeleton-icon-btn" />
            <div className="skeleton-btn skeleton-icon-btn" />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * 4. 전체 복습 화면 스켈레톤 (ReviewViewSkeleton)
 * ReviewView 동적 임포트(Next.js dynamic loading) 및 초기 진입 시 최상위 셸 제공
 */
export function ReviewViewSkeleton() {
  return (
    <div className="view-stack review-view review-skeleton-root" role="status" aria-busy="true" aria-label="복습 탭을 불러오는 중입니다">
      {/* 상단 뷰 타이틀 뼈대: 실제 텍스트 clamp 규격과 1:1 일치시켜 높이 점프 방지 */}
      <header className="view-title" aria-hidden="true">
        <div className="skeleton-title-line" style={{ width: 52, height: 11, marginBottom: 8, borderRadius: 4 }} />
        <div className="view-title-heading-skeleton">
          <div className="skeleton-title-line" style={{ width: "min(340px, 85%)", height: "clamp(32px, 9vw, 52px)", marginBottom: 8, borderRadius: 10 }} />
          <div className="skeleton-title-line" style={{ width: "min(260px, 65%)", height: "clamp(32px, 9vw, 52px)", marginBottom: 8, borderRadius: 10 }} />
        </div>
        <div className="skeleton-title-line" style={{ width: 180, height: 14, marginTop: 4, borderRadius: 6 }} />
      </header>

      {/* 3개 서브탭 세그먼트 버튼 뼈대 */}
      <nav className="segmented review-tab-switch" aria-hidden="true">
        <button type="button" className="active">오늘의 복습</button>
        <button type="button">영상별 기록</button>
        <button type="button">내 보관함</button>
      </nav>

      {/* 오늘의 복습 기본 스켈레톤 */}
      <ReviewQueueSkeleton />
    </div>
  );
}
