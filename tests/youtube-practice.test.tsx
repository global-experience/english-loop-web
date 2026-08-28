import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubePractice } from "@/components/YouTubePractice";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
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
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      id: "job-1",
      video_id: "m2UD0-IC7iY",
      status: "COMPLETED",
      provider: "LOCAL_GPU",
      progress: 100,
      error_message: null,
      result: {
        video_id: "m2UD0-IC7iY",
        language: "English",
        language_code: "en",
        is_generated: true,
        segments: [
          { text: "Welcome to Office English.", start: 4.2, duration: 2.5, end: 6.7 },
          { text: "Let's begin the meeting.", start: 7, duration: 2, end: 9 },
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
    render(<YouTubePractice/>);

    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/youtube/jobs", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("YouTube 자동 생성 자막")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /YouTube 열기/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=m2UD0-IC7iY");

    await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Let's begin the meeting/ }));
    expect(player.seekTo).toHaveBeenCalledWith(7, true);
    expect(player.playVideo).toHaveBeenCalled();
    expect(screen.getByText(/구간 반복 중/)).toHaveTextContent("0 / 3");
  });

  it("changes the repeat count used by the selected line", async () => {
    render(<YouTubePractice/>);
    await screen.findByRole("heading", { name: "Welcome to Office English." });

    fireEvent.click(screen.getByRole("button", { name: "5회" }));
    expect(screen.getByRole("button", { name: "5회 반복 시작" })).toBeInTheDocument();
    expect(screen.getByText("누르면 바로 5회 반복")).toBeInTheDocument();
  });
});
