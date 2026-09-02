import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewView } from "@/components/ReviewView";
import { apiFetch } from "@/lib/api";
import {
  contentCard,
  contentDetail,
  emptyQueueResponse,
  queueResponse,
  recordingWithLocalAudio,
  savedWord,
  uploadCard,
} from "./review-fixtures";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/learningSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learningSession")>()),
  loadRecordingFromDevice: vi.fn().mockResolvedValue({ status: "missing", reason: "not-on-this-device" }),
}));

type Handler = (path: string, init?: RequestInit) => unknown;

function mockApi(handler: Handler) {
  vi.mocked(apiFetch).mockImplementation((path, init) => Promise.resolve(handler(String(path), init) ?? {}) as never);
}

function defaultHandler(path: string) {
  if (path.startsWith("/api/review/queue")) return queueResponse;
  if (path.startsWith("/api/review/contents/")) return contentDetail;
  if (path.startsWith("/api/review/contents")) return { items: [contentCard, uploadCard], total: 2, view: "recent", as_of: "" };
  if (path.startsWith("/api/review/library")) {
    return { kind: "words", items: [savedWord], counts: { words: 1, sentences: 1 }, sources: [{ content_id: "content-1", title: "Daily English Conversation" }], levels: ["B1"] };
  }
  return {};
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("Review tab shell", () => {
  it("shows today's totals, estimated time and completion progress", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);

    expect(await screen.findByText("3개")).toBeInTheDocument();
    expect(screen.getByText(/예상 2분 · 완료 1개 · 남은 3개/)).toBeInTheDocument();
    expect(screen.getByLabelText("오늘 복습 진행률 25퍼센트")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /복습 시작/ })).toBeInTheDocument();
  });

  it("separates the three areas with a segmented control", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });

    const tabs = screen.getAllByRole("tab").filter((tab) => tab.id.startsWith("review-subtab-"));
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["오늘의 복습", "영상별 기록", "내 보관함"]);
    expect(document.getElementById("review-subpanel-contents")).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    expect(document.getElementById("review-subpanel-today")).toHaveAttribute("hidden");
    expect(document.getElementById("review-subpanel-contents")).not.toHaveAttribute("hidden");
    expect(await screen.findByText("Daily English Conversation")).toBeInTheDocument();
  });

  it("keeps an empty queue readable instead of a long list", async () => {
    mockApi((path) => (path.startsWith("/api/review/queue") ? emptyQueueResponse : defaultHandler(path)));
    render(<ReviewView />);

    expect(await screen.findByText("예정된 복습을 마쳤어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /복습 시작/ })).not.toBeInTheDocument();
  });

  it("shows a retryable error state when the queue request fails", async () => {
    let calls = 0;
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (String(path).startsWith("/api/review/queue")) {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error("복습 목록을 불러오지 못했습니다."));
        return Promise.resolve(queueResponse) as never;
      }
      return Promise.resolve(defaultHandler(String(path))) as never;
    });
    render(<ReviewView />);

    expect(await screen.findByRole("alert")).toHaveTextContent("복습 목록을 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    expect(await screen.findByRole("button", { name: /복습 시작/ })).toBeInTheDocument();
  });
});

describe("Today's review session", () => {
  it("grades a card through the forgetting curve and moves on", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    vi.mocked(apiFetch).mockImplementation((path, init) => {
      const value = String(path);
      if (value === "/api/review/grade") {
        calls.push({ path: value, body: JSON.parse(String(init?.body)) });
        return Promise.resolve({
          item_id: "saved:progress-1",
          expression_progress_id: "progress-1",
          next_review_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          current_stage: "SHADOWED",
          completed_today: 2,
        }) as never;
      }
      return Promise.resolve(defaultHandler(value)) as never;
    });

    render(<ReviewView />);
    fireEvent.click(await screen.findByRole("button", { name: /복습 시작/ }));

    const card = document.querySelector(".review-focus-card") as HTMLElement;
    expect(within(card).getByText("1 / 3")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "기억 안 남 내일 다시" })).toBeDisabled();

    fireEvent.click(within(card).getByRole("button", { name: /정답 확인/ }));
    expect(within(card).getByText("The main challenge was keeping it simple.")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: /좋음/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ item_id: "saved:progress-1", result: "GOOD" });
    expect(await screen.findByRole("status")).toHaveTextContent("저장 표현 복습을 저장했어요.");
    await waitFor(() => expect(document.querySelector(".review-focus-card")).toHaveTextContent("1 / 2"));
  });

  it("offers all four forgetting-curve grades for every item kind", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);
    fireEvent.click(await screen.findByRole("button", { name: /복습 시작/ }));
    fireEvent.click(screen.getByRole("tab", { name: /목록 모드/ }));

    const rows = document.querySelectorAll(".review-list-mode li");
    expect(rows).toHaveLength(3);
    expect(Array.from(rows).map((row) => row.querySelector("header span")?.textContent)).toEqual([
      "저장 표현",
      "다시 말할 문장",
      "ChatGPT 교정 문장",
    ]);
    for (const row of Array.from(rows)) {
      expect(within(row as HTMLElement).getAllByRole("button", { name: /기억 안 남|어려움|좋음|쉬움/ })).toHaveLength(4);
    }
  });

  it("hands a queue card back to the learning tab with its transcript line", async () => {
    mockApi(defaultHandler);
    const openLearning = vi.fn();
    render(<ReviewView openLearning={openLearning} />);
    fireEvent.click(await screen.findByRole("button", { name: /복습 시작/ }));

    fireEvent.click(screen.getByRole("button", { name: /Daily English에서 이어 학습/ }));
    expect(openLearning).toHaveBeenCalledWith({
      contentId: "content-1",
      transcriptLineId: "line-3",
      title: "Daily English",
      sourceLabel: "복습 · 저장 표현",
    });
  });
});

describe("Per-content study records", () => {
  it("shows one card model for feed, YouTube and uploaded content", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    await screen.findByText("Daily English Conversation");

    const cards = document.querySelectorAll(".content-record-card");
    expect(cards).toHaveLength(2);
    const first = cards[0] as HTMLElement;
    expect(within(first).getByText("피드 · English Channel")).toBeInTheDocument();
    expect(within(first).getByText(/오늘 학습/)).toBeInTheDocument();
    expect(within(first).getByLabelText("진행률 45퍼센트")).toBeInTheDocument();
    expect(within(first).getByText("복습 1")).toBeInTheDocument();
    expect(first.querySelector(".content-record-stats")).toHaveTextContent("4 저장 표현");
    expect(first.querySelector(".content-record-stats")).toHaveTextContent("2 다시 말할 문장");
    expect(first.querySelector(".content-record-stats")).toHaveTextContent("3 녹음");
    expect(within(cards[1] as HTMLElement).getByText("업로드")).toBeInTheDocument();
  });

  it("filters the records by search and by the review-needed view", async () => {
    const requests: string[] = [];
    mockApi((path) => {
      if (path.startsWith("/api/review/contents?")) {
        requests.push(path);
        return { items: [contentCard], total: 1, view: "recent", as_of: "" };
      }
      return defaultHandler(path);
    });
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    await screen.findByText("Daily English Conversation");

    fireEvent.click(screen.getByRole("tab", { name: "복습 필요" }));
    await waitFor(() => expect(requests.some((path) => path.includes("view=needs_review"))).toBe(true));

    fireEvent.change(screen.getByPlaceholderText("영상 제목·채널 검색"), { target: { value: "daily" } });
    await waitFor(() => expect(requests.some((path) => path.includes("search=daily"))).toBe(true));
  });

  it("groups a video's records into expressions, sentences, recordings and corrections", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));

    expect(await screen.findByRole("tab", { name: /^표현/ })).toBeInTheDocument();
    expect(screen.getByText("keeping it simple")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^문장/ }));
    expect(screen.getByText("The main challenge was keeping it simple.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^녹음/ }));
    // Recordings sit under the transcript line they belong to, in transcript order.
    const groups = document.querySelectorAll(".recording-line-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector("header span")).toHaveTextContent("LINE 7");
    expect(groups[0].querySelector("header strong")).toHaveTextContent("I've been working on this for a year.");
    expect(groups[0].querySelector("header p")).toHaveTextContent("1년 동안 이걸 해왔어요.");
    const recordings = document.querySelectorAll(".recording-card");
    expect(recordings).toHaveLength(2);
    const firstRecording = recordings[0] as HTMLElement;
    expect(within(firstRecording).getByText("I have been working this for a year")).toBeInTheDocument();
    expect(within(firstRecording).getByText("on")).toBeInTheDocument();
    expect(within(firstRecording).getByText("72%")).toBeInTheDocument();
    expect(within(firstRecording).getByRole("button", { name: /원본 듣기/ })).toBeInTheDocument();
    expect(within(firstRecording).getByRole("button", { name: /내 녹음 듣기/ })).toBeInTheDocument();
    expect(within(firstRecording).getByRole("button", { name: /다시 녹음/ })).toBeInTheDocument();
    expect(within(firstRecording).getByRole("button", { name: /복습에 고정/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /오답·교정/ }));
    expect(screen.getByText("I work this since one year.")).toBeInTheDocument();
    expect(screen.getByText("현재완료진행형과 for를 사용합니다. · 2026-09-01")).toBeInTheDocument();
  });

  it("says up front when an attempt never had device audio, and keeps the STT comparison", async () => {
    mockApi(defaultHandler);
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /^녹음/ }));

    // The second fixture has no local_recording_id, which is knowable without a lookup.
    const missingCard = document.querySelectorAll(".recording-card")[1] as HTMLElement;
    expect(within(missingCard).getByText(/이 녹음은 기기에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(within(missingCard).getByRole("button", { name: /내 녹음 듣기/ })).toBeDisabled();
    expect(within(missingCard).getByText("I have been working this for a year")).toBeInTheDocument();
    expect(within(missingCard).getByText("72%")).toBeInTheDocument();
  });

  it("returns to the same video and transcript line in the learning tab", async () => {
    mockApi(defaultHandler);
    const openLearning = vi.fn();
    render(<ReviewView openLearning={openLearning} />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));
    fireEvent.click(await screen.findByRole("button", { name: /keeping it simple 원본 자막으로 이동/ }));

    expect(openLearning).toHaveBeenCalledWith(expect.objectContaining({
      contentId: "content-1",
      transcriptLineId: "line-3",
      youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    }));
  });
});

describe("My library", () => {
  it("splits words, sentences, saved videos and representative recordings", async () => {
    const requests: string[] = [];
    mockApi((path) => {
      if (path.startsWith("/api/review/library")) {
        requests.push(path);
        if (path.includes("kind=videos")) {
          return {
            kind: "videos",
            items: [{
              id: "saved-1", content_id: "content-1", feed_video_id: "feed-1", youtube_video_id: "abcdefghijk",
              youtube_url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Daily English Conversation",
              channel_title: "English Channel", thumbnail_url: "https://example.com/t.jpg", duration_seconds: 320,
              status: "READY", learning_content_id: "content-1", error_message: null, created_at: null,
            }],
            counts: { words: 1, sentences: 1 }, sources: [], levels: [],
          };
        }
        return defaultHandler(path);
      }
      return defaultHandler(path);
    });

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));

    expect(await screen.findByText("keeping it simple")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /전체 단어/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /찜한 영상/ }));
    await waitFor(() => expect(requests.some((path) => path.includes("kind=videos"))).toBe(true));
    expect(await screen.findByText(/학습 준비됨/)).toBeInTheDocument();
  });

  it("switches kinds without rendering the previous kind's rows", async () => {
    // Regression: the recordings branch used to cast the still-loaded word rows,
    // which have no missing_words/id, and crashed the whole review tab.
    let resolveRecordings: ((value: unknown) => void) | null = null;
    vi.mocked(apiFetch).mockImplementation((path) => {
      const value = String(path);
      if (value.includes("kind=recordings")) {
        return new Promise((resolve) => { resolveRecordings = resolve; }) as never;
      }
      return Promise.resolve(defaultHandler(value)) as never;
    });

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    expect(await screen.findByText("keeping it simple")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /대표 녹음/ }));
    // While the recordings request is in flight, no stale word row is shown as a card.
    expect(await screen.findByText("보관함을 불러오고 있어요.")).toBeInTheDocument();
    expect(screen.queryByText("keeping it simple")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".recording-card")).toHaveLength(0);

    resolveRecordings!({
      kind: "recordings",
      items: [recordingWithLocalAudio],
      counts: { words: 1, sentences: 1 },
      sources: [],
      levels: [],
    });

    expect(await screen.findByText("I have been working this for a year")).toBeInTheDocument();
    expect(document.querySelectorAll(".recording-card")).toHaveLength(1);
  });

  it("renders a recording row that is missing its comparison fields", async () => {
    mockApi((path) => {
      if (path.includes("kind=recordings")) {
        return {
          kind: "recordings",
          items: [{
            id: "attempt-legacy",
            content_id: "content-1",
            transcript_line_id: "line-7",
            reference_text: "I've been working on this for a year.",
            transcript_line_text: "I've been working on this for a year.",
            stt_text: "",
            comparison: {},
            match_score: null,
            duration_seconds: null,
            local_recording_id: null,
            local_recording_storage: null,
            server_audio_url: null,
            pinned_for_review: false,
            stt_provider: "",
            entry_source: "feed",
            created_at: null,
            content_title: "Daily English Conversation",
          }],
          counts: { words: 0, sentences: 0 },
          sources: [],
          levels: [],
        };
      }
      return defaultHandler(path);
    });
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    fireEvent.click(screen.getByRole("tab", { name: /대표 녹음/ }));

    const card = (await waitFor(() => {
      const node = document.querySelector(".recording-card");
      expect(node).not.toBeNull();
      return node;
    })) as HTMLElement;
    expect(within(card).getByText("0%")).toBeInTheDocument();
    expect(within(card).getAllByText("없음")).toHaveLength(2);
    expect(within(card).getByText("날짜 미기록 · 0초 · STT 미기록")).toBeInTheDocument();
  });

  it("filters the library by search, source, level and saved date", async () => {
    const requests: string[] = [];
    mockApi((path) => {
      if (path.startsWith("/api/review/library")) requests.push(path);
      return defaultHandler(path);
    });
    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    await screen.findByText("keeping it simple");

    fireEvent.change(screen.getByPlaceholderText("단어·문장·영상 검색"), { target: { value: "keep" } });
    await waitFor(() => expect(requests.some((path) => path.includes("search=keep"))).toBe(true));

    fireEvent.change(screen.getByLabelText("출처"), { target: { value: "content-1" } });
    await waitFor(() => expect(requests.some((path) => path.includes("source=content-1"))).toBe(true));

    fireEvent.change(screen.getByLabelText("난이도"), { target: { value: "B1" } });
    await waitFor(() => expect(requests.some((path) => path.includes("level=B1"))).toBe(true));

    fireEvent.change(screen.getByLabelText("저장일 정렬"), { target: { value: "oldest" } });
    await waitFor(() => expect(requests.some((path) => path.includes("sort=oldest"))).toBe(true));
  });

  it("opens the original video and transcript line from a saved word", async () => {
    mockApi(defaultHandler);
    const openLearning = vi.fn();
    render(<ReviewView openLearning={openLearning} />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    fireEvent.click(await screen.findByRole("button", { name: /keeping it simple 원본 자막으로 이동/ }));

    expect(openLearning).toHaveBeenCalledWith({
      contentId: "content-1",
      transcriptLineId: "line-3",
      title: "Daily English Conversation",
      sourceLabel: "보관함",
    });
  });
});

describe("Recording playback states", () => {
  it("reports a recording that exists in the record but not in this browser", async () => {
    const loadRecordingFromDevice = vi.mocked(
      (await import("@/lib/learningSession")).loadRecordingFromDevice
    );
    loadRecordingFromDevice.mockResolvedValue({ status: "missing", reason: "not-on-this-device" });
    mockApi(defaultHandler);

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /^녹음/ }));

    // The first fixture does carry a local id, so the card only finds out on play.
    const card = document.querySelectorAll(".recording-card")[0] as HTMLElement;
    expect(within(card).queryByText(/찾을 수 없음/)).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /내 녹음 듣기/ }));

    expect(await within(card).findByText(/다른 기기·브라우저에서 녹음했거나 저장 공간이 정리됐어요/)).toBeInTheDocument();
    expect(loadRecordingFromDevice).toHaveBeenCalledWith("local-1", "indexeddb");
  });

  it("plays the recording when this device still has the audio", async () => {
    const loadRecordingFromDevice = vi.mocked(
      (await import("@/lib/learningSession")).loadRecordingFromDevice
    );
    loadRecordingFromDevice.mockResolvedValue({
      status: "found",
      url: "blob:loopine/attempt-1",
      revoke: true,
      mimeType: "audio/mp4",
    });
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Audio", class {
      src: string;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = play;
      pause = vi.fn();
      constructor(src: string) { this.src = src; }
    });
    mockApi(defaultHandler);

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /^녹음/ }));

    const card = document.querySelectorAll(".recording-card")[0] as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /내 녹음 듣기/ }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(await within(card).findByRole("button", { name: /일시정지/ })).toBeInTheDocument();
    expect(within(card).queryByText(/찾을 수 없음/)).not.toBeInTheDocument();
  });
});
