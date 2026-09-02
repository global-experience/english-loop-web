/**
 * Today tab data layer.
 *
 * Each section of the Today tab loads independently so a single failing request never
 * blocks the screen: the tab must always be able to answer "what do I do next?" from
 * the plan it already has. Mock payloads live in `lib/todayMock.ts` and are never
 * imported here.
 */

import { apiFetch } from "@/lib/api";
import type { FeedVideo, Report } from "@/lib/types";
import type { ReviewQueueResponse, ReviewQueueSummary } from "@/lib/reviewTypes";

export type AsyncSection<T> = {
  data: T | null;
  loading: boolean;
  /** Empty string when the section loaded (even if it loaded nothing). */
  error: string;
};

export const idleSection = <T,>(): AsyncSection<T> => ({ data: null, loading: true, error: "" });

function message(caught: unknown, fallback: string) {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

export type RecommendedVideos = { items: FeedVideo[]; total: number };

export async function fetchRecommendedVideos(limit = 8): Promise<RecommendedVideos> {
  const data = await apiFetch<{ items: FeedVideo[]; total: number }>(`/api/feed?limit=${limit}`);
  return { items: data.items || [], total: data.total || 0 };
}

export type TodayReviewSummary = ReviewQueueSummary & { speakAgainCount: number };

export async function fetchReviewSummary(): Promise<TodayReviewSummary> {
  const data = await apiFetch<ReviewQueueResponse>("/api/review/queue?limit=40");
  const summary = data?.summary;
  if (!summary) throw new Error("복습 큐 응답에 요약이 없습니다.");
  return { ...summary, speakAgainCount: summary.counts?.SPEAK_AGAIN || 0 };
}

export type CoachHint = {
  /** True when the hint comes from the learner's own records. */
  personalised: boolean;
  headline: string;
  body: string;
  focusTags: string[];
};

type SessionResult = {
  id: string;
  content_id: string | null;
  practiced_line_count: number;
  saved_expression_count: number;
  retry_line_count: number;
  missing_words: string[];
  completed_at: string | null;
};

const GENERIC_HINT: CoachHint = {
  personalised: false,
  headline: "먼저 한 세션을 끝내볼까요?",
  body: "오늘 루틴 한 단계를 마치면 표현·문장·녹음 기록이 쌓이고, 다음 행동을 여기에서 제안해 드려요.",
  focusTags: [],
};

/**
 * Build a next-action suggestion from the learner's own records.
 *
 * Both requests are optional: the analysis report adds focus tags, and the learning
 * results add what actually happened in the last session. When neither is available
 * the generic hint is returned rather than an error, because a missing suggestion is
 * not a broken Today tab.
 */
export async function fetchCoachHint(): Promise<CoachHint> {
  const [results, reports] = await Promise.all([
    apiFetch<{ items: SessionResult[] }>("/api/learning/sessions/results?limit=5").catch(() => null),
    apiFetch<{ items: Report[] }>("/api/reports?page_size=1").catch(() => null),
  ]);

  const latest = results?.items?.[0] || null;
  const report = reports?.items?.[0] || null;
  const focusTags = (report?.next_focus || []).slice(0, 3);

  if (!latest && !report) return GENERIC_HINT;

  if (latest && latest.retry_line_count > 0) {
    return {
      personalised: true,
      headline: `다시 말할 문장 ${latest.retry_line_count}개가 남아 있어요.`,
      body: (latest.missing_words?.length || 0) > 0
        ? `지난 세션에서 빠뜨린 단어: ${(latest.missing_words || []).slice(0, 4).join(", ")}. 복습 탭에서 그 문장부터 다시 말해보세요.`
        : "복습 탭의 ‘다시 말할 문장’부터 처리하면 오늘 루틴이 가벼워져요.",
      focusTags,
    };
  }

  if (latest && latest.saved_expression_count > 0) {
    return {
      personalised: true,
      headline: `저장한 표현 ${latest.saved_expression_count}개를 아직 안 써봤어요.`,
      body: "밤 음성 대화에서 그 표현을 먼저 꺼내 쓰면 자발적 사용으로 올라갑니다.",
      focusTags,
    };
  }

  if (report) {
    const weakness = report.weaknesses?.[0];
    return {
      personalised: true,
      headline: focusTags.length ? `다음 초점: ${focusTags[0]}` : "지난 수업 분석이 준비됐어요.",
      body: weakness?.description_ko || "리포트 탭에서 지난 대화 분석을 확인하고 오늘 표현에 반영해 보세요.",
      focusTags,
    };
  }

  return {
    personalised: true,
    headline: "지난 세션을 잘 마쳤어요.",
    body: `연습한 문장 ${latest?.practiced_line_count ?? 0}개. 이어서 오늘 루틴의 다음 단계를 진행해 보세요.`,
    focusTags,
  };
}

export const coachHintFallback = GENERIC_HINT;
export const sectionError = message;
