import type {
  ContentDetailResponse,
  ContentProgressCard,
  ReviewItem,
  ReviewQueueResponse,
  SavedItem,
  SpeechAttemptRecord,
} from "@/lib/reviewTypes";

export const savedQueueItem: ReviewItem = {
  id: "saved:progress-1",
  kind: "SAVED_EXPRESSION",
  kind_label: "저장 표현",
  prompt_ko: "가장 큰 어려움은 단순함을 유지하는 것이었습니다.",
  answer_text: "The main challenge was keeping it simple.",
  example_sentence: "The main challenge was keeping it simple.",
  note: null,
  current_stage: "SHADOWED",
  next_review_at: "2026-09-02T00:00:00+00:00",
  expression_progress_id: "progress-1",
  content_id: "content-1",
  transcript_line_id: "line-3",
  content_title: "Daily English",
  match_score: null,
  missing_words: [],
  estimated_seconds: 20,
};

export const speakAgainQueueItem: ReviewItem = {
  id: "speech:attempt-1",
  kind: "SPEAK_AGAIN",
  kind_label: "다시 말할 문장",
  prompt_ko: "이 문장을 다시 말해보세요.",
  answer_text: "I've been working on this for a year.",
  example_sentence: "I have been working this for a year",
  note: "빠진 단어: on",
  current_stage: "SHADOWED",
  next_review_at: null,
  expression_progress_id: null,
  content_id: "content-1",
  transcript_line_id: "line-7",
  content_title: "Daily English",
  match_score: 72,
  missing_words: ["on"],
  estimated_seconds: 35,
};

export const correctionQueueItem: ReviewItem = {
  id: "correction:report-1:0",
  kind: "CORRECTION",
  kind_label: "ChatGPT 교정 문장",
  prompt_ko: "현재완료진행형과 for를 사용합니다.",
  answer_text: "I've been working on this for a year.",
  example_sentence: "I work this since one year.",
  note: "TENSE",
  current_stage: "USED_WITH_HELP",
  next_review_at: null,
  expression_progress_id: null,
  content_id: null,
  transcript_line_id: null,
  content_title: "ChatGPT 수업 · 2026-09-01",
  match_score: null,
  missing_words: [],
  estimated_seconds: 30,
};

export const queueResponse: ReviewQueueResponse = {
  as_of: "2026-09-02T01:00:00+00:00",
  summary: {
    total_count: 3,
    estimated_minutes: 2,
    completed_today: 1,
    progress_percent: 25,
    counts: { SAVED_EXPRESSION: 1, SPEAK_AGAIN: 1, CORRECTION: 1, NOT_USED: 0 },
  },
  items: [savedQueueItem, speakAgainQueueItem, correctionQueueItem],
};

export const emptyQueueResponse: ReviewQueueResponse = {
  as_of: "2026-09-02T01:00:00+00:00",
  summary: {
    total_count: 0,
    estimated_minutes: 0,
    completed_today: 0,
    progress_percent: 0,
    counts: { SAVED_EXPRESSION: 0, SPEAK_AGAIN: 0, CORRECTION: 0, NOT_USED: 0 },
  },
  items: [],
};

export const contentCard: ContentProgressCard = {
  content_id: "content-1",
  title: "Daily English Conversation",
  thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  youtube_video_id: "abcdefghijk",
  source_type: "YOUTUBE",
  source_label: "피드 · English Channel",
  source_url: "https://www.youtube.com/watch?v=abcdefghijk",
  level: "B1",
  topic: "English Channel",
  duration_seconds: 320,
  is_saved_video: true,
  saved_status: "READY",
  last_studied_at: new Date().toISOString(),
  progress_percent: 45,
  practiced_line_count: 9,
  total_line_count: 20,
  saved_item_count: 4,
  speech_attempt_count: 3,
  retry_count: 2,
  due_count: 1,
  has_transcript: true,
};

export const uploadCard: ContentProgressCard = {
  ...contentCard,
  content_id: "content-2",
  title: "업로드한 회의 오디오",
  thumbnail_url: null,
  youtube_video_id: null,
  source_type: "UPLOAD",
  source_label: "업로드",
  source_url: null,
  is_saved_video: false,
  saved_status: null,
  due_count: 0,
  retry_count: 0,
  saved_item_count: 1,
  speech_attempt_count: 0,
  progress_percent: 10,
};

export const savedWord: SavedItem = {
  expression_progress_id: "progress-1",
  expression_id: "expression-1",
  canonical_text: "keeping it simple",
  korean_meaning: "단순하게 유지하기",
  original_meaning: "단순하게 유지하기",
  custom_meaning: null,
  user_note: null,
  is_edited: false,
  example_sentence: "The main challenge was keeping it simple.",
  category: "YOUTUBE_VOCAB",
  level: "B1",
  tags: ["selected-text"],
  item_type: "WORD",
  current_stage: "NEW",
  next_review_at: null,
  last_reviewed_at: null,
  created_at: "2026-09-01T00:00:00+00:00",
  content_id: "content-1",
  transcript_line_id: "line-3",
  content_title: "Daily English Conversation",
  source_links: [{ content_id: "content-1", transcript_line_id: "line-3", content_title: "Daily English Conversation" }],
};

export const savedSentence: SavedItem = {
  ...savedWord,
  expression_progress_id: "progress-2",
  expression_id: "expression-2",
  canonical_text: "The main challenge was keeping it simple.",
  korean_meaning: "가장 큰 어려움은 단순함을 유지하는 것이었습니다.",
  item_type: "SENTENCE",
};

export const recordingWithLocalAudio: SpeechAttemptRecord = {
  id: "attempt-1",
  content_id: "content-1",
  transcript_line_id: "line-7",
  reference_text: "I've been working on this for a year.",
  transcript_line_text: "I've been working on this for a year.",
  stt_text: "I have been working this for a year",
  comparison: { missingWords: ["on"], differentWords: ["have"] },
  missing_words: ["on"],
  different_words: ["have"],
  match_score: 72,
  duration_seconds: 6,
  local_recording_id: "local-1",
  local_recording_storage: "indexeddb",
  server_audio_url: null,
  pinned_for_review: false,
  stt_provider: "GROQ",
  entry_source: "feed",
  created_at: "2026-09-01T09:30:00+00:00",
  content_title: "Daily English Conversation",
};

export const recordingWithoutLocalAudio: SpeechAttemptRecord = {
  ...recordingWithLocalAudio,
  id: "attempt-2",
  transcript_line_id: "line-9",
  local_recording_id: null,
  local_recording_storage: null,
  pinned_for_review: true,
};

export const contentDetail: ContentDetailResponse = {
  content: contentCard,
  transcript_lines: [
    { id: "line-3", sequence: 3, start_ms: 12000, end_ms: 15000, english_text: "The main challenge was keeping it simple.", korean_meaning: "가장 큰 어려움은 단순함을 유지하는 것이었습니다." },
    { id: "line-7", sequence: 7, start_ms: 30000, end_ms: 34000, english_text: "I've been working on this for a year.", korean_meaning: "1년 동안 이걸 해왔어요." },
  ],
  expressions: [savedWord],
  sentences: [savedSentence],
  recordings: [recordingWithLocalAudio, recordingWithoutLocalAudio],
  corrections: [
    {
      id: "correction:report-1:0",
      original: "I work this since one year.",
      corrected: "I've been working on this for a year.",
      category: "TENSE",
      reason_ko: "현재완료진행형과 for를 사용합니다.",
      study_date: "2026-09-01",
    },
  ],
};
