import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractYouTubeVideoId, validateYouTubeVideo } from "@/lib/youtubeCheck";
import { LearningView } from "@/components/LearningView";
import { apiFetch } from "@/lib/api";
import { youtubeStore } from "@/lib/youtubeStore";
import { today } from "./fixtures";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

describe("YouTube video validation upfront", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    youtubeStore.resetForTesting();
  });

  it("extracts YouTube video IDs across different formats", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=BCiNjLq0S60")).toBe("BCiNjLq0S60");
    expect(extractYouTubeVideoId("https://youtu.be/BCiNjLq0S60?t=10")).toBe("BCiNjLq0S60");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/BCiNjLq0S60")).toBe("BCiNjLq0S60");
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/BCiNjLq0S60")).toBe("BCiNjLq0S60");
    expect(extractYouTubeVideoId("BCiNjLq0S60")).toBe("BCiNjLq0S60");
    expect(extractYouTubeVideoId("invalid-url-with-no-id")).toBeNull();
  });

  it("rejects an invalid link before calling API", async () => {
    const result = await validateYouTubeVideo("not-a-valid-link");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("올바른 YouTube 영상 링크를 입력해 주세요.");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("rejects video when backend reports embed restriction", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new Error("이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다.")
    );

    const result = await validateYouTubeVideo("https://www.youtube.com/watch?v=BCiNjLq0S60");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("소유자의 설정으로 인해");
  });

  it("accepts an embeddable video", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      video_id: "rGQkLXIey4Y",
      title: "Playable English",
      embeddable: true,
    });

    const result = await validateYouTubeVideo("https://www.youtube.com/watch?v=rGQkLXIey4Y");
    expect(result.ok).toBe(true);
    expect(result.videoId).toBe("rGQkLXIey4Y");
    expect(result.title).toBe("Playable English");
  });
});

describe("ContentPicker video submission upfront check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    youtubeStore.resetForTesting();
  });

  it("shows alert popup and stays on landing page when un-embeddable video is submitted", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
    const setEntry = vi.fn();
    const loadTranscriptSpy = vi.spyOn(youtubeStore, "loadTranscript");

    vi.mocked(apiFetch).mockImplementation((path) => {
      const url = String(path);
      if (url.startsWith("/api/contents")) {
        return Promise.resolve({ items: [] }) as never;
      }
      if (url.startsWith("/api/youtube/validate")) {
        return Promise.reject(new Error("이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다.")) as never;
      }
      return Promise.resolve({}) as never;
    });

    render(
      <LearningView
        today={today}
        entry={null}
        setEntry={setEntry}
        refresh={vi.fn().mockResolvedValue(undefined)}
        openReview={vi.fn()}
        openNextRoutine={vi.fn()}
      />
    );

    // Initial landing view (Image 2) is visible
    expect(screen.getByRole("heading", { name: "무엇을 연습할까요?" })).toBeInTheDocument();

    // Click "콘텐츠 선택"
    fireEvent.click(screen.getByRole("button", { name: /콘텐츠 선택/ }));
    expect(await screen.findByRole("heading", { name: "학습 콘텐츠 선택" })).toBeInTheDocument();

    // Enter un-embeddable YouTube URL
    const urlInput = screen.getByPlaceholderText("YouTube URL을 붙여넣으세요");
    fireEvent.change(urlInput, { target: { value: "https://www.youtube.com/watch?v=BCiNjLq0S60" } });

    // Click "추가"
    fireEvent.click(screen.getByRole("button", { name: /추가/ }));

    // Alert popup should be triggered
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다"));
    });

    // Subtitles MUST NOT be fetched
    expect(loadTranscriptSpy).not.toHaveBeenCalled();

    // MUST NOT transition to learning session screen (setEntry must not be called)
    expect(setEntry).not.toHaveBeenCalled();

    // Landing view remains in place (stays on image 2)
    expect(screen.getByRole("heading", { name: "무엇을 연습할까요?" })).toBeInTheDocument();

    alertMock.mockRestore();
    loadTranscriptSpy.mockRestore();
  });
});
