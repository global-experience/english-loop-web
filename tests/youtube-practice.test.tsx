import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveSegmentEnd, YouTubePractice } from "@/components/YouTubePractice";
import { apiFetch } from "@/lib/api";

import { youtubeStore } from "@/lib/youtubeStore";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { },
  apiFetch: vi.fn(),
}));

const player = {
  cueVideoById: vi.fn(),
  destroy: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  pauseVideo: vi.fn(),
  playVideo: vi.fn(),
  seekTo: vi.fn(),
  setPlaybackRate: vi.fn(),
};

describe("YouTubePractice", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    youtubeStore.resetForTesting();
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      id: "job-1",
      video_id: "rGQkLXIey4Y",
      status: "COMPLETED",
      provider: "LOCAL_GPU",
      progress: 100,
      error_message: null,
      result: {
        video_id: "rGQkLXIey4Y",
        language: "English",
        language_code: "en",
        is_generated: true,
        segments: [
          { id: "a".repeat(64), text: "Welcome to Office English.", start: 4.2, duration: 2.5, end: 6.7 },
          { id: "b".repeat(64), text: "Let's begin the meeting.", start: 7, duration: 2, end: 9 },
        ],
      },
    });
    window.YT = {
      Player: vi.fn((_element, options) => {
        options.events?.onReady?.();
        return player;
      }) as unknown as NonNullable<typeof window.YT>["Player"],
    };
  });

  it("loads automatic captions and starts a segment loop", async () => {
    render(<YouTubePractice />);

    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/youtube/jobs", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("YouTube 자동 생성 자막")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /YouTube 열기/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=rGQkLXIey4Y");

    await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Let's begin the meeting/ }));
    expect(player.seekTo).toHaveBeenCalledWith(7, true);
    expect(player.playVideo).toHaveBeenCalled();
    expect(screen.getByText(/구간 반복 중/)).toHaveTextContent("0 / 3");
  });

  it("changes the repeat count used by the selected line", async () => {
    render(<YouTubePractice />);
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5회" }));
    expect(screen.getByRole("button", { name: "5회 반복 시작" })).toBeInTheDocument();
    expect(screen.getByText("누르면 바로 5회 반복")).toBeInTheDocument();
  });

  it("extends an implausibly short caption until the next cue", () => {
    const segments = [
      {
        id: "a".repeat(64),
        text: "Was first broadcast on the BBC Learning English website in October 2014.",
        start: 2.6,
        end: 3.9,
        duration: 1.3,
      },
      { id: "b".repeat(64), text: "For more English language learning programmes.", start: 7.96, end: 9.26, duration: 1.3 },
    ];

    expect(effectiveSegmentEnd(segments, 0)).toBeGreaterThan(6.9);
    expect(effectiveSegmentEnd(segments, 0)).toBeLessThan(7.96);
  });

  it("opens a mobile translation bottom sheet and prevents rapid duplicate requests", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(<YouTubePractice />);
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Welcome to Office English.",
      translation: "오피스 영어에 오신 것을 환영합니다.",
      model: "llama-3.3-70b-versatile",
      cached: false,
    });

    const translateButton = screen.getByRole("button", { name: /번역 보기/ });
    fireEvent.click(translateButton);
    fireEvent.click(translateButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("오피스 영어에 오신 것을 환영합니다.")).toBeInTheDocument();
    const translationCalls = vi.mocked(apiFetch).mock.calls.filter(([path]) =>
      String(path).includes("/translate"),
    );
    expect(translationCalls).toHaveLength(1);
  });
});
