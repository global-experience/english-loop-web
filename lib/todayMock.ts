/**
 * Sample Today tab payloads.
 *
 * Kept apart from `lib/todayData.ts` on purpose: nothing in the app imports this at
 * runtime. It exists for tests and for local UI work when the backend is not running.
 */

import type { FeedVideo } from "@/lib/types";
import type { CoachHint, RecommendedVideos, TodayReviewSummary } from "@/lib/todayData";

export const mockRecommendedVideos: RecommendedVideos = {
  total: 3,
  items: [
    {
      id: "feed-1",
      youtube_video_id: "abcdefghijk",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "Small talk that actually works at the office",
      channel_title: "Everyday English",
      thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      published_at: "2026-08-30T00:00:00Z",
      duration_seconds: 232,
      language: "en",
      caption_available: true,
      base_score: 8.4,
      status: "APPROVED",
      saved_status: null,
      learning_content_id: null,
    },
    {
      id: "feed-2",
      youtube_video_id: "bcdefghijkl",
      youtube_url: "https://www.youtube.com/watch?v=bcdefghijkl",
      title: "How to explain your project in 60 seconds",
      channel_title: "Work English Daily",
      thumbnail_url: "https://i.ytimg.com/vi/bcdefghijkl/hqdefault.jpg",
      published_at: "2026-08-29T00:00:00Z",
      duration_seconds: 411,
      language: "en",
      caption_available: true,
      base_score: 7.9,
      status: "APPROVED",
      saved_status: "READY",
      learning_content_id: "content-2",
    },
    {
      id: "feed-3",
      youtube_video_id: "cdefghijklm",
      youtube_url: "https://www.youtube.com/watch?v=cdefghijklm",
      title: "Phrases for disagreeing politely",
      channel_title: "Fluent Meetings",
      thumbnail_url: "https://i.ytimg.com/vi/cdefghijklm/hqdefault.jpg",
      published_at: "2026-08-28T00:00:00Z",
      duration_seconds: 178,
      language: "en",
      caption_available: true,
      base_score: 7.1,
      status: "APPROVED",
      saved_status: null,
      learning_content_id: null,
    },
  ] satisfies FeedVideo[],
};

export const mockReviewSummary: TodayReviewSummary = {
  total_count: 12,
  estimated_minutes: 6,
  completed_today: 3,
  progress_percent: 20,
  counts: { SAVED_EXPRESSION: 7, SPEAK_AGAIN: 3, CORRECTION: 2, NOT_USED: 0 },
  speakAgainCount: 3,
};

export const mockCoachHint: CoachHint = {
  personalised: true,
  headline: "다시 말할 문장 3개가 남아 있어요.",
  body: "지난 세션에서 빠뜨린 단어: on, for. 복습 탭에서 그 문장부터 다시 말해보세요.",
  focusTags: ["현재완료진행형", "for와 since 구분"],
};
