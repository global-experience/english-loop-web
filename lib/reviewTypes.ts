/**
 * Review tab data contracts.
 *
 * These mirror `backend/app/review_service.py`, which derives everything from the
 * models that already store learning work — no parallel store:
 *   content         -> LearningContent (+ FeedVideo for feed-only rows)
 *   transcriptLine  -> ContentSegment / YouTubeTranscriptSegment
 *   savedItem       -> Expression + ExpressionSourceLink
 *   speechAttempt   -> LearningSpeechAttempt
 *   reviewItem      -> ExpressionProgress + ReviewEvent (forgetting curve)
 *   correction      -> SessionReport.corrections / ReportExpressionUsage
 *   contentProgress -> derived per content
 */

export type ReviewItemKind = "SAVED_EXPRESSION" | "SPEAK_AGAIN" | "CORRECTION" | "NOT_USED";

export type ReviewGrade = "FAILED" | "HARD" | "GOOD" | "EASY";

export type ReviewItem = {
  id: string;
  kind: ReviewItemKind;
  kind_label: string;
  prompt_ko: string;
  answer_text: string;
  example_sentence: string;
  note: string | null;
  current_stage: string;
  next_review_at: string | null;
  expression_progress_id: string | null;
  content_id: string | null;
  transcript_line_id: string | null;
  content_title: string | null;
  match_score: number | null;
  missing_words: string[];
  estimated_seconds: number;
};

export type ReviewQueueSummary = {
  total_count: number;
  estimated_minutes: number;
  completed_today: number;
  progress_percent: number;
  counts: Record<ReviewItemKind, number>;
};

export type ReviewQueueResponse = {
  as_of: string;
  summary: ReviewQueueSummary;
  items: ReviewItem[];
};

export type ReviewGradeResponse = {
  item_id: string;
  expression_progress_id: string;
  next_review_at: string | null;
  current_stage: string;
  completed_today: number;
};

/** contentProgress — one card per studied video, feed item or upload. */
export type ContentProgressCard = {
  content_id: string;
  title: string;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  source_type: string;
  source_label: string;
  source_url: string | null;
  level: string | null;
  topic: string | null;
  duration_seconds: number;
  is_saved_video: boolean;
  saved_status: string | null;
  last_studied_at: string | null;
  progress_percent: number;
  practiced_line_count: number;
  total_line_count: number;
  saved_item_count: number;
  speech_attempt_count: number;
  retry_count: number;
  due_count: number;
  has_transcript: boolean;
};

export type ContentListView = "recent" | "needs_review" | "most_saved";

export type ContentListResponse = {
  items: ContentProgressCard[];
  total: number;
  view: ContentListView;
  as_of: string;
};

export type SavedItem = {
  expression_progress_id: string;
  expression_id: string;
  canonical_text: string;
  /** The meaning shown to this learner: their edit when present, else the shared one. */
  korean_meaning: string;
  original_meaning?: string;
  custom_meaning?: string | null;
  user_note?: string | null;
  is_edited?: boolean;
  example_sentence: string;
  category: string;
  level: string | null;
  tags: string[];
  item_type: "WORD" | "SENTENCE";
  current_stage: string;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  created_at: string | null;
  content_id: string | null;
  transcript_line_id: string | null;
  content_title: string | null;
  source_links: Array<{ content_id: string; transcript_line_id: string; content_title: string }>;
};

export type SpeechAttemptRecord = {
  id: string;
  content_id: string | null;
  transcript_line_id: string;
  reference_text: string;
  transcript_line_text: string;
  stt_text: string;
  comparison: Record<string, unknown>;
  missing_words: string[];
  different_words: string[];
  match_score: number;
  duration_seconds: number;
  local_recording_id: string | null;
  local_recording_storage: string | null;
  server_audio_url: string | null;
  pinned_for_review: boolean;
  stt_provider: string;
  entry_source: string;
  created_at: string | null;
  content_title?: string;
  is_representative?: boolean;
};

export type TranscriptLineRecord = {
  id: string;
  sequence: number;
  start_ms: number | null;
  end_ms: number | null;
  english_text: string;
  korean_meaning: string | null;
};

export type CorrectionRecord = {
  id: string;
  original: string;
  corrected: string;
  category: string;
  reason_ko: string;
  study_date: string | null;
};

export type ContentDetailResponse = {
  content: ContentProgressCard;
  transcript_lines: TranscriptLineRecord[];
  expressions: SavedItem[];
  sentences: SavedItem[];
  recordings: SpeechAttemptRecord[];
  corrections: CorrectionRecord[];
};

export type SavedVideoRecord = {
  id: string;
  content_id: string;
  feed_video_id: string;
  youtube_video_id: string;
  youtube_url: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  duration_seconds: number;
  status: string;
  learning_content_id: string | null;
  error_message: string | null;
  created_at: string | null;
};

export type SavedItemPatchResponse = {
  expression_progress_id: string;
  korean_meaning: string;
  original_meaning: string;
  custom_meaning: string | null;
  user_note: string | null;
  is_edited: boolean;
};

export type LibraryKind = "words" | "sentences" | "videos" | "recordings";

export type LibraryResponse = {
  kind: LibraryKind;
  items: SavedItem[] | SavedVideoRecord[] | SpeechAttemptRecord[];
  counts: { words: number; sentences: number };
  sources: Array<{ content_id: string; title: string }>;
  levels: string[];
};

export const REVIEW_GRADES: Array<{ value: ReviewGrade; label: string; hint: string }> = [
  { value: "FAILED", label: "기억 안 남", hint: "내일 다시" },
  { value: "HARD", label: "어려움", hint: "간격 줄이기" },
  { value: "GOOD", label: "좋음", hint: "간격 유지" },
  { value: "EASY", label: "쉬움", hint: "간격 늘리기" },
];

export const REVIEW_TAB_KEYS = ["today", "contents", "library"] as const;
export type ReviewTabKey = (typeof REVIEW_TAB_KEYS)[number];

export const REVIEW_TABS: Array<{ key: ReviewTabKey; label: string }> = [
  { key: "today", label: "오늘의 복습" },
  { key: "contents", label: "영상별 기록" },
  { key: "library", label: "내 보관함" },
];

export function stageLabel(stage: string) {
  return stage.replaceAll("_", " ");
}

export function relativeDayLabel(value: string | null) {
  if (!value) return "학습 기록 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "학습 기록 없음";
  const days = Math.floor((Date.now() - parsed.getTime()) / 86_400_000);
  if (days <= 0) return "오늘 학습";
  if (days === 1) return "어제 학습";
  if (days < 7) return `${days}일 전 학습`;
  if (days < 30) return `${Math.floor(days / 7)}주 전 학습`;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(parsed);
}

export function durationLabel(seconds: number) {
  if (!seconds) return "길이 미정";
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}분` : `${seconds}초`;
}
