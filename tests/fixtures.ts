import type { Activity, TodayData, User } from "@/lib/types";

export const user: User = {
  id: "u1", email: "learner@example.com", display_name: "학습자", english_level: "B1",
  goals: ["네트워킹"], timezone: "Asia/Seoul", custom_gpt_url: "https://chatgpt.com/g/test",
  daily_minutes: 120, recording_retention_days: 30,
};

export const listeningActivity: Activity = {
  id: "a1", slot: "MORNING_COMMUTE", activity_type: "LISTENING", planned_minutes: 30,
  actual_minutes: 0, status: "NOT_STARTED", started_at: null, completed_at: null, user_notes: null,
  content: {
    id: "c1", title: "프로젝트 소개", content_type: "AUDIO", source_type: "DIRECT_URL",
    source_url: "https://example.com/audio.mp3", media_url: "https://example.com/audio.mp3", level: "B1",
    topic: "프로젝트", content_summary_ko: "프로젝트 소개", duration_seconds: 60, copyright_note: null,
    is_active: true, can_segment_repeat: true,
    segments: [{ id: "s1", sequence: 1, start_ms: 0, end_ms: 3000, english_text: "The main challenge was keeping it simple.", korean_meaning: "가장 큰 어려움은 단순함을 유지하는 것이었습니다.", notes: null }],
  },
};

export const today: TodayData = {
  study_date: "2026-08-23", progress_percent: 25, review_due_count: 2, message: null,
  coach_session: { status: "NOT_STARTED", session_id: null, started_at: null, completed_at: null },
  plan: {
    id: "p1", study_date: "2026-08-23", status: "ACTIVE", primary_topic: "프로젝트 설명",
    daily_goal_ko: "목표 표현을 힌트 없이 사용하기", weakness_categories: ["TENSE"],
    target_expressions: [{ id: "e1", canonical_text: "The main challenge was…", korean_meaning: "가장 큰 어려움은", example_sentence: "The main challenge was scope.", category: "WORK", level: "B1", current_stage: "SHADOWED", next_review_at: null }],
    activities: [
      listeningActivity,
      { ...listeningActivity, id: "a2", slot: "LUNCH", activity_type: "SPEAKING", content: null },
      { ...listeningActivity, id: "a3", slot: "EVENING_COMMUTE" },
      { ...listeningActivity, id: "a4", slot: "NIGHT_VOICE", activity_type: "VOICE_COACHING", content: null },
    ],
  },
};

