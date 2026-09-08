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

const RECOMMENDED_CACHE_KEY = "loopine:today-videos:v1";

/**
 * 「오늘의 추천」이 하루 동안 같은 목록이 되도록 날짜를 seed 로 쓴다.
 *
 * seed 를 비우면 서버가 매번 새로 뽑기 때문에, 탭에 들어올 때마다 추천이
 * 통째로 바뀐다. 이름과 다르기도 하고, 아래 캐시를 갱신할 때마다 목록이
 * 눈앞에서 교체되는 문제도 생긴다.
 */
function dailySeed(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `today-${year}${month}${day}`;
}

type CachedRecommendation = RecommendedVideos & { seed: string };

/**
 * 직전에 본 추천 목록. 오늘 탭의 다른 구간은 앱 셸 스냅샷 덕분에 즉시 그려지는데
 * 이 구간만 캐시가 없어, 화면 한가운데서 혼자 스켈레톤이 깜빡였다.
 */
export function readCachedRecommendedVideos(now = new Date()): RecommendedVideos | null {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RECOMMENDED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecommendation;
    // 날짜가 바뀌면 어제의 추천이다. 버리고 새로 받는다.
    if (parsed?.seed !== dailySeed(now) || !Array.isArray(parsed.items)) return null;
    return { items: parsed.items, total: parsed.total || 0 };
  } catch {
    return null;
  }
}

function cacheRecommendedVideos(value: RecommendedVideos, now = new Date()) {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
  try {
    const payload: CachedRecommendation = { ...value, seed: dailySeed(now) };
    window.sessionStorage.setItem(RECOMMENDED_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 저장 용량 초과나 사생활 보호 모드. 캐시는 없어도 동작에 지장이 없다.
  }
}

export async function fetchRecommendedVideos(limit = 8): Promise<RecommendedVideos> {
  const params = new URLSearchParams({ limit: String(limit), seed: dailySeed() });
  const data = await apiFetch<{ items: FeedVideo[]; total: number }>(`/api/feed?${params}`);
  const value = { items: data.items || [], total: data.total || 0 };
  cacheRecommendedVideos(value);
  return value;
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
