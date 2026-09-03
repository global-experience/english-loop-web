import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewView } from "@/components/ReviewView";
import { apiFetch } from "@/lib/api";
import {
  contentCard,
  contentDetail,
  queueResponse,
  recordingWithLocalAudio,
  savedWord,
} from "./review-fixtures";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const deleteRecordingFromDevice = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/learningSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learningSession")>()),
  deleteRecordingFromDevice,
  loadRecordingFromDevice: vi.fn().mockResolvedValue({ status: "missing" }),
}));

const savedVideo = {
  id: "saved-1",
  content_id: "content-1",
  feed_video_id: "feed-1",
  youtube_video_id: "abcdefghijk",
  youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
  title: "Daily English Conversation",
  channel_title: "English Channel",
  thumbnail_url: "https://example.com/t.jpg",
  duration_seconds: 320,
  status: "READY",
  learning_content_id: "content-1",
  error_message: null,
  created_at: null,
};

type Call = { path: string; method: string; body: unknown };

function mockApi(extra: (path: string, init?: RequestInit) => unknown = () => undefined) {
  const calls: Call[] = [];
  vi.mocked(apiFetch).mockImplementation((path, init) => {
    const value = String(path);
    calls.push({
      path: value,
      method: (init?.method || "GET").toUpperCase(),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const handled = extra(value, init);
    if (handled !== undefined) return Promise.resolve(handled) as never;
    if (value.startsWith("/api/review/queue")) return Promise.resolve(queueResponse) as never;
    if (value.startsWith("/api/review/contents/")) return Promise.resolve(contentDetail) as never;
    if (value.startsWith("/api/review/contents")) {
      return Promise.resolve({ items: [contentCard], total: 1, view: "recent", as_of: "" }) as never;
    }
    if (value.startsWith("/api/review/library?kind=videos")) {
      return Promise.resolve({ kind: "videos", items: [savedVideo], counts: { words: 1, sentences: 0 }, sources: [], levels: [] }) as never;
    }
    if (value.startsWith("/api/review/library?kind=recordings")) {
      return Promise.resolve({ kind: "recordings", items: [recordingWithLocalAudio], counts: { words: 1, sentences: 0 }, sources: [], levels: [] }) as never;
    }
    if (value.startsWith("/api/review/library")) {
      return Promise.resolve({
        kind: "words",
        items: [savedWord],
        counts: { words: 1, sentences: 0 },
        sources: [{ content_id: "content-1", title: "Daily English Conversation" }],
        levels: ["B1"],
      }) as never;
    }
    return Promise.resolve({}) as never;
  });
  return calls;
}

async function openLibrary() {
  await screen.findByRole("button", { name: /복습 시작/ });
  fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
  return (await screen.findByText("keeping it simple")).closest(".saved-item-row") as HTMLElement;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  deleteRecordingFromDevice.mockClear();
});

describe("Editing a saved item", () => {
  it("saves an edited meaning and note as a per-user override", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-items/") && init?.method === "PATCH") {
        return {
          expression_progress_id: "progress-1",
          korean_meaning: "일을 단순하게 가져가기",
          original_meaning: "단순하게 유지하기",
          custom_meaning: "일을 단순하게 가져가기",
          user_note: "회의에서 써보기",
          is_edited: true,
        };
      }
      return undefined;
    });

    render(<ReviewView />);
    const row = await openLibrary();

    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 수정" }));
    fireEvent.change(within(row).getByLabelText("keeping it simple 한국어 뜻"), { target: { value: "일을 단순하게 가져가기" } });
    fireEvent.change(within(row).getByLabelText("keeping it simple 내 메모"), { target: { value: "회의에서 써보기" } });
    fireEvent.click(within(row).getByRole("button", { name: /저장/ }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH");
      expect(patch).toBeDefined();
      expect(patch!.path).toBe("/api/review/saved-items/progress-1");
      expect(patch!.body).toEqual({ custom_meaning: "일을 단순하게 가져가기", user_note: "회의에서 써보기" });
    });

    // The row shows the edit without a refetch, and marks it as the learner's own.
    expect(await screen.findByText("일을 단순하게 가져가기")).toBeInTheDocument();
    expect(screen.getByText("회의에서 써보기")).toBeInTheDocument();
    expect(screen.getByText(/내가 수정/)).toBeInTheDocument();
    expect(calls.filter((call) => call.path.startsWith("/api/review/library")).length).toBe(1);
  });

  it("restores the shared meaning with 원래 뜻으로", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-items/") && init?.method === "PATCH") {
        return {
          expression_progress_id: "progress-1",
          korean_meaning: "단순하게 유지하기",
          original_meaning: "단순하게 유지하기",
          custom_meaning: null,
          user_note: "메모 유지",
          is_edited: true,
        };
      }
      if (path.startsWith("/api/review/library") && !path.includes("kind=")) return undefined;
      if (path.startsWith("/api/review/library")) {
        return {
          kind: "words",
          items: [{ ...savedWord, korean_meaning: "내가 고친 뜻", custom_meaning: "내가 고친 뜻", user_note: "메모 유지", is_edited: true }],
          counts: { words: 1, sentences: 0 },
          sources: [],
          levels: [],
        };
      }
      return undefined;
    });

    render(<ReviewView />);
    const row = await openLibrary();
    expect(within(row).getByText("내가 고친 뜻")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 수정" }));
    expect(within(row).getByText("원래 뜻: 단순하게 유지하기")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /원래 뜻으로/ }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH");
      expect(patch!.body).toEqual({ custom_meaning: "", user_note: "메모 유지" });
    });
    expect(await screen.findByText("단순하게 유지하기")).toBeInTheDocument();
  });

  it("keeps the editor open and reports the error when saving fails", async () => {
    mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-items/") && init?.method === "PATCH") {
        throw new Error("수정한 내용을 저장하지 못했습니다.");
      }
      return undefined;
    });

    render(<ReviewView />);
    const row = await openLibrary();
    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 수정" }));
    fireEvent.click(within(row).getByRole("button", { name: /저장/ }));

    expect(await within(row).findByRole("alert")).toHaveTextContent("수정한 내용을 저장하지 못했습니다.");
    expect(within(row).getByLabelText("keeping it simple 한국어 뜻")).toBeInTheDocument();
  });
});

describe("Deleting review content", () => {
  it("asks before deleting a saved word and removes it from the list", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-items/") && init?.method === "DELETE") return {};
      return undefined;
    });

    render(<ReviewView />);
    const row = await openLibrary();

    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 삭제" }));
    // Nothing is deleted until the second, explicit press.
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(screen.getByText("이 항목을 삭제할까요?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^삭제$/ }));
    await waitFor(() => {
      const remove = calls.find((call) => call.method === "DELETE");
      expect(remove!.path).toBe("/api/review/saved-items/progress-1");
    });
    await waitFor(() => expect(screen.queryByText("keeping it simple")).not.toBeInTheDocument());
    expect(await screen.findByText("아직 보관된 항목이 없어요.")).toBeInTheDocument();
  });

  it("cancels a delete without calling the API", async () => {
    const calls = mockApi();
    render(<ReviewView />);
    const row = await openLibrary();

    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: /취소/ }));

    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(within(row).getByRole("button", { name: "keeping it simple 삭제" })).toBeInTheDocument();
    expect(screen.getByText("keeping it simple")).toBeInTheDocument();
  });

  it("deletes a representative recording and clears the device copy", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/recordings/") && init?.method === "DELETE") return {};
      return undefined;
    });

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    fireEvent.click(screen.getByRole("tab", { name: /대표 녹음/ }));

    const card = (await waitFor(() => {
      const node = document.querySelector(".recording-card");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    }));
    fireEvent.click(within(card).getByRole("button", { name: /녹음 삭제/ }));
    fireEvent.click(screen.getByRole("button", { name: /^삭제$/ }));

    await waitFor(() => {
      const remove = calls.find((call) => call.method === "DELETE");
      expect(remove!.path).toBe("/api/review/recordings/attempt-1");
    });
    expect(deleteRecordingFromDevice).toHaveBeenCalledWith("local-1", "indexeddb");
    await waitFor(() => expect(document.querySelectorAll(".recording-card")).toHaveLength(0));
  });

  it("un-saves a video while keeping its study records", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-videos/") && init?.method === "DELETE") return {};
      return undefined;
    });

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    fireEvent.click(screen.getByRole("tab", { name: /찜한 영상/ }));

    const card = (await waitFor(() => {
      const node = document.querySelector(".library-video-card");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    }));
    fireEvent.click(within(card).getByRole("button", { name: /찜 해제/ }));
    expect(screen.getByText("찜을 해제할까요? 학습 기록은 남습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^삭제$/ }));

    await waitFor(() => {
      const remove = calls.find((call) => call.method === "DELETE");
      expect(remove!.path).toBe("/api/review/saved-videos/saved-1");
    });
    await waitFor(() => expect(document.querySelectorAll(".library-video-card")).toHaveLength(0));
  });

  it("edits and deletes from a video's detail view too", async () => {
    const calls = mockApi((path, init) => {
      if (path.startsWith("/api/review/saved-items/") && init?.method === "DELETE") return {};
      return undefined;
    });

    render(<ReviewView />);
    await screen.findByRole("button", { name: /복습 시작/ });
    fireEvent.click(screen.getByRole("tab", { name: /영상별 기록/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Daily English Conversation 학습 기록 열기/ }));

    const row = (await screen.findByText("keeping it simple")).closest(".saved-item-row") as HTMLElement;
    expect(within(row).getByRole("button", { name: "keeping it simple 수정" })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "keeping it simple 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: /^삭제$/ }));

    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
    // The 표현 tab count drops with the row.
    await waitFor(() => expect(screen.getByRole("tab", { name: /^표현/ })).toHaveTextContent("표현0"));
  });
});
