import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { YouTubeStore } from "@/lib/youtubeStore";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

const STORAGE_KEY = "loopine_youtube_practice_v3";

const completedJob = {
  id: "job-1",
  video_id: "BCiNjLq0S60",
  status: "COMPLETED",
  provider: "LOCAL_GPU",
  execution_target: "LOCAL_GPU",
  progress: 100,
  error_message: null,
  result: {
    video_id: "BCiNjLq0S60",
    language: "English",
    language_code: "en",
    is_generated: true,
    segments: [{ id: "s1", text: "Hello", start: 0, duration: 1, end: 1 }],
  },
};

function seedStorage(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

describe("YouTube store resumes an interrupted job after reload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("restarts polling for the saved activeJobId on first subscribe", async () => {
    seedStorage({ videoId: "BCiNjLq0S60", loading: true, jobProgress: 42, activeJobId: "job-1" });
    vi.mocked(apiFetch).mockResolvedValue(completedJob);

    const store = new YouTubeStore();
    expect(store.getState().loading).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();

    const unsubscribe = store.subscribe(() => {});

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/youtube/jobs/job-1");
      expect(store.getState().loading).toBe(false);
    });
    expect(store.getState().transcript?.segments).toHaveLength(1);
    expect(store.getState().activeJobId).toBeNull();
    unsubscribe();
  });

  it("clears a stale loading flag when there is no job to resume", () => {
    seedStorage({ videoId: "BCiNjLq0S60", loading: true, jobProgress: 42, activeJobId: null });

    const store = new YouTubeStore();
    store.subscribe(() => {})();

    expect(store.getState().loading).toBe(false);
    expect(store.getState().jobProgress).toBe(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("surfaces an error instead of spinning forever when the saved job is gone", async () => {
    seedStorage({ videoId: "BCiNjLq0S60", loading: true, jobProgress: 42, activeJobId: "job-gone" });
    vi.mocked(apiFetch).mockRejectedValue(new Error("자막 작업을 찾을 수 없습니다"));

    const store = new YouTubeStore();
    store.subscribe(() => {});

    await vi.waitFor(() => {
      expect(store.getState().loading).toBe(false);
    });
    expect(store.getState().error).toContain("찾을 수 없습니다");
    expect(store.getState().activeJobId).toBeNull();
  });

  it("only resumes once even with several subscribers", async () => {
    seedStorage({ videoId: "BCiNjLq0S60", loading: true, jobProgress: 42, activeJobId: "job-1" });
    vi.mocked(apiFetch).mockResolvedValue(completedJob);

    const store = new YouTubeStore();
    store.subscribe(() => {});
    store.subscribe(() => {});

    await vi.waitFor(() => expect(store.getState().loading).toBe(false));
    expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path === "/api/youtube/jobs/job-1")).toHaveLength(1);
  });
});
