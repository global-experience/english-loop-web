export type Expression = {
  id: string;
  canonical_text: string;
  korean_meaning: string;
  example_sentence: string;
  category: string;
  level: string;
  current_stage: string;
  next_review_at: string | null;
};

export type Segment = {
  id: string;
  sequence: number;
  start_ms: number | null;
  end_ms: number | null;
  english_text: string;
  korean_meaning: string | null;
  notes: string | null;
};

export type Content = {
  id: string;
  title: string;
  content_type: string;
  source_type: string;
  source_url: string | null;
  media_url: string | null;
  level: string;
  topic: string;
  content_summary_ko: string;
  duration_seconds: number;
  copyright_note: string | null;
  is_active: boolean;
  can_segment_repeat: boolean;
  segments: Segment[];
};

export type Activity = {
  id: string;
  slot: "MORNING_COMMUTE" | "LUNCH" | "EVENING_COMMUTE" | "NIGHT_VOICE";
  activity_type: string;
  planned_minutes: number;
  actual_minutes: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "COMPLETED";
  started_at: string | null;
  completed_at: string | null;
  user_notes: string | null;
  content: Content | null;
  routine_item_id?: string | null;
  routine_snapshot?: RoutineSnapshot | null;
};

export type RoutineActivityType =
  | "listen"
  | "shadowing"
  | "recall"
  | "record"
  | "review"
  | "ai_conversation"
  | "free_study";

export type ContentStrategy =
  | "recommended"
  | "continue_recent"
  | "fixed"
  | "saved"
  | "manual"
  | "none";

export type RoutineItemConfig = {
  repeatOptions: number[];
  speedOptions: number[];
  defaultRepeat: number;
  defaultSpeed: number;
  subtitleMode: "shown" | "hidden" | "user_choice";
  showTranslation: boolean;
  recordingEnabled: boolean;
  sttEnabled: boolean;
  targetCount?: number | null;
  durationMinutes?: number | null;
  completionCondition?: string;
};

export type RoutineNotification = {
  enabled: boolean;
  offsetMinutes: number;
  title?: string | null;
  body?: string | null;
};

export type RoutineSnapshot = {
  routine_id: string;
  routine_item_id: string;
  name: string;
  icon: string;
  start_time: string;
  end_time: string | null;
  days_of_week: number[];
  estimated_minutes: number;
  activity_type: RoutineActivityType;
  content_strategy: ContentStrategy;
  config: RoutineItemConfig;
  notification: RoutineNotification;
};

export type RoutineItem = {
  id: string;
  routine_id: string;
  name: string;
  icon: string;
  start_time: string;
  end_time: string | null;
  days_of_week: number[];
  is_active: boolean;
  sort_order: number;
  estimated_minutes: number;
  activity_type: RoutineActivityType;
  content_strategy: ContentStrategy;
  fixed_content_id: string | null;
  fixed_content?: Content | null;
  config: RoutineItemConfig;
  notification: RoutineNotification;
  deleted_at?: string | null;
};

export type TodayRoutineItem = RoutineItem & {
  state: "done" | "current" | "upcoming" | "skipped" | "today_inactive";
  status: string;
  activity_id: string | null;
  content: Content | null;
  minutes_until: number | null;
  routine_snapshot: RoutineSnapshot;
};

export type RoutinePlan = {
  id: string;
  name: string;
  plan_type: string;
  days_of_week: number[];
  sort_order: number;
  is_active: boolean;
  items: RoutineItem[];
};

export type RoutinePayload = {
  plans: RoutinePlan[];
  today_items?: TodayRoutineItem[];
  focus_item_id?: string | null;
  timezone: string;
  study_date?: string;
};

export type TodayData = {
  study_date: string;
  plan: null | {
    id: string;
    study_date: string;
    status: string;
    primary_topic: string;
    daily_goal_ko: string;
    weakness_categories: string[];
    target_expressions: Expression[];
    activities: Activity[];
  };
  progress_percent: number;
  coach_session: {
    status: "NOT_STARTED" | "STARTED" | "AWAITING_REPORT" | "COMPLETED" | "FAILED";
    session_id: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  review_due_count: number;
  message: string | null;
  routine?: RoutinePayload | null;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  english_level: string;
  goals: string[];
  timezone: string;
  custom_gpt_url: string | null;
  daily_minutes: number;
  recording_retention_days: number;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
};

export type FeedVideo = {
  id: string;
  youtube_video_id: string;
  youtube_url: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  published_at: string | null;
  duration_seconds: number;
  language: string | null;
  caption_available: boolean;
  base_score: number;
  status: string;
  saved_status: "PROCESSING" | "READY" | "FAILED" | null;
  learning_content_id?: string | null;
};

export type Report = {
  session_id: string;
  study_date: string;
  summary_ko: string;
  topics: string[];
  successful_expressions: Array<{ expression: string; usage_type: string; evidence: string }>;
  target_expression_usage: Array<{ expression: string; status: string; evidence: string | null }>;
  corrections: Array<{ original: string; corrected: string; category: string; reason_ko: string }>;
  weaknesses: Array<{ category: string; description_ko: string; severity: number }>;
  scores: Record<string, number>;
  next_focus: string[];
  next_day_plan: Record<string, unknown>;
  created_at: string;
};

export type Analytics = {
  period: { days: number; from: string; to: string };
  total_study_minutes: number;
  routine: Record<string, { completed: number; planned: number; completion_rate: number }>;
  listening: { first_average: number | null; final_average: number | null; average_improvement: number | null; shadowed_sentences: number };
  lunch_speaking_attempts: number;
  voice_sessions_completed: number;
  target_expression_usage: { tracked: number; spontaneous: number; spontaneous_rate: number };
  newly_mastered: number;
  weaknesses: Array<{ category: string; occurrence_count: number; latest_severity: number; average_severity: number; trend: string; description_ko: string }>;
};
