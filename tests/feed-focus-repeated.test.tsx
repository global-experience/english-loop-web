import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecommendedCarousel } from "@/components/today/RecommendedCarousel";
import { FeedView } from "@/components/FeedView";
import { mockRecommendedVideos } from "@/lib/todayMock";
import { apiFetch } from "@/lib/api";
import type { FeedVideo } from "@/lib/types";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

function pointer(type: string, { clientX = 0, pointerType = "mouse", pointerId = 1 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

describe("Carousel desktop click & FeedView repeated focus", () => {
  it("allows mouse click on desktop without pointer capture swallowing the click", () => {
    const onOpenVideo = vi.fn();
    render(
      <RecommendedCarousel
        items={mockRecommendedVideos.items}
        loading={false}
        error=""
        onRetry={vi.fn()}
        onOpenVideo={onOpenVideo}
      />
    );

    const cardButton = screen.getByRole("button", { name: /Small talk .* 피드에서 보기/ });
    const track = document.querySelector(".today-carousel") as HTMLElement;

    // Desktop mouse interaction: pointerdown -> pointerup -> click
    fireEvent(track, pointer("pointerdown", { clientX: 100 }));
    fireEvent(track, pointer("pointerup", { clientX: 100 }));
    fireEvent.click(cardButton);

    expect(onOpenVideo).toHaveBeenCalledWith(expect.objectContaining({ id: "feed-1" }));
  });

  it("handles repeated focusVideo requests (3+ times) and focuses the target video every time", async () => {
    class IntersectionObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    const sampleVideos: FeedVideo[] = [
      { id: "feed-1", youtube_video_id: "yt-1", youtube_url: "https://youtu.be/1", title: "Video 1", channel_title: "Ch 1", thumbnail_url: "https://example.com/1.jpg", duration_seconds: 30, caption_available: true, saved_status: "READY", published_at: null, language: "en", base_score: 1, status: "APPROVED" },
      { id: "feed-2", youtube_video_id: "yt-2", youtube_url: "https://youtu.be/2", title: "Video 2", channel_title: "Ch 2", thumbnail_url: "https://example.com/2.jpg", duration_seconds: 40, caption_available: true, saved_status: "READY", published_at: null, language: "en", base_score: 1, status: "APPROVED" },
      { id: "feed-3", youtube_video_id: "yt-3", youtube_url: "https://youtu.be/3", title: "Video 3", channel_title: "Ch 3", thumbnail_url: "https://example.com/3.jpg", duration_seconds: 50, caption_available: true, saved_status: "READY", published_at: null, language: "en", base_score: 1, status: "APPROVED" },
    ];

    vi.mocked(apiFetch).mockImplementation((path) => {
      if (String(path).startsWith("/api/feed?")) {
        return Promise.resolve({ items: sampleVideos, seed: "s", next_cursor: null, total: 3 });
      }
      return Promise.resolve({});
    });

    const onFocusConsumed = vi.fn();
    const { rerender } = render(
      <FeedView
        active={true}
        openLearning={vi.fn()}
        focusVideo={sampleVideos[0]}
        focusKey={1}
        onFocusConsumed={onFocusConsumed}
      />
    );

    // 1st request
    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(1));

    // 2nd request (video 2)
    rerender(
      <FeedView
        active={true}
        openLearning={vi.fn()}
        focusVideo={sampleVideos[1]}
        focusKey={2}
        onFocusConsumed={onFocusConsumed}
      />
    );
    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(2));

    // 3rd request (back to video 1)
    rerender(
      <FeedView
        active={true}
        openLearning={vi.fn()}
        focusVideo={sampleVideos[0]}
        focusKey={3}
        onFocusConsumed={onFocusConsumed}
      />
    );
    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(3));

    // 4th request (video 3)
    rerender(
      <FeedView
        active={true}
        openLearning={vi.fn()}
        focusVideo={sampleVideos[2]}
        focusKey={4}
        onFocusConsumed={onFocusConsumed}
      />
    );
    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(4));
  });
});
