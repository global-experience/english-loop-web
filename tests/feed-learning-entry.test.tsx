import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedView } from "@/components/FeedView";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

describe("Feed learning entry", () => {
  it("passes the selected feed video and learning content id to the workspace", async () => {
    class IntersectionObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    const video = {
      id: "feed-1",
      learning_content_id: "content-1",
      youtube_video_id: "abcdefghijk",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "Daily English",
      channel_title: "English Channel",
      thumbnail_url: "https://example.com/thumb.jpg",
      duration_seconds: 45,
      caption_available: true,
      saved_status: "READY",
    };
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (String(path).startsWith("/api/feed?")) return Promise.resolve({ items: [video], seed: "seed", next_cursor: null, total: 1 });
      return Promise.resolve({});
    });
    const openLearning = vi.fn();
    render(<FeedView openLearning={openLearning} />);
    fireEvent.click(await screen.findByRole("button", { name: /바로 학습/ }));
    expect(openLearning).toHaveBeenCalledWith(expect.objectContaining({ id: "feed-1", learning_content_id: "content-1" }));
  });
});
