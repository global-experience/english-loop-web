import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecommendedCarousel } from "@/components/today/RecommendedCarousel";
import { mockRecommendedVideos } from "@/lib/todayMock";

const items = mockRecommendedVideos.items;

/** jsdom has no layout, so give the track measurable geometry. */
function measureTrack({ scrollWidth = 900, clientWidth = 300, cardWidth = 240 } = {}) {
  const track = document.querySelector(".today-carousel") as HTMLElement;
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: clientWidth });
  for (const card of Array.from(document.querySelectorAll<HTMLElement>("[data-carousel-card]"))) {
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: cardWidth });
  }
  const scrollBy = vi.fn();
  const scrollTo = vi.fn();
  track.scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
  track.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  track.setPointerCapture = vi.fn();
  track.releasePointerCapture = vi.fn();
  track.hasPointerCapture = vi.fn().mockReturnValue(true);
  // The component measured a zero-sized track on mount, so re-sync the edge state
  // now that the geometry above exists.
  fireEvent.scroll(track);
  return { track, scrollBy, scrollTo };
}

/**
 * jsdom does not implement PointerEvent, and the generic event RTL falls back to
 * carries no clientX. A MouseEvent under the pointer event's name does, and React
 * dispatches it to the same handler.
 */
function pointer(type: string, { clientX = 0, pointerType = "mouse", pointerId = 1 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function renderCarousel(props: Partial<Parameters<typeof RecommendedCarousel>[0]> = {}) {
  return render(
    <RecommendedCarousel
      items={items}
      loading={false}
      error=""
      onRetry={vi.fn()}
      onOpenVideo={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Recommended videos carousel", () => {
  it("renders one card per recommendation with its channel and duration", () => {
    renderCarousel();
    expect(document.querySelectorAll("[data-carousel-card]")).toHaveLength(3);
    expect(screen.getByText("Everyday English")).toBeInTheDocument();
    expect(screen.getByText("3:52")).toBeInTheDocument();
    // A prepared video says so, which is what makes 학습하기 available in the feed.
    expect(screen.getByText(/Work English Daily · 학습 준비됨/)).toBeInTheDocument();
  });

  it("moves by one card with the arrow buttons", () => {
    renderCarousel();
    const { scrollBy } = measureTrack();
    fireEvent.click(screen.getByRole("button", { name: "다음 추천 영상" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 252, behavior: "smooth" });
  });

  it("disables the previous button at the start and the next button at the end", () => {
    renderCarousel();
    const { track } = measureTrack();
    expect(screen.getByRole("button", { name: "이전 추천 영상" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 추천 영상" })).toBeEnabled();

    Object.defineProperty(track, "scrollLeft", { configurable: true, value: 600 });
    fireEvent.scroll(track);
    expect(screen.getByRole("button", { name: "이전 추천 영상" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 추천 영상" })).toBeDisabled();
  });

  it("supports keyboard navigation on the track", () => {
    renderCarousel();
    const { track, scrollBy, scrollTo } = measureTrack();

    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledWith({ left: 252, behavior: "smooth" });
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -252, behavior: "smooth" });
    fireEvent.keyDown(track, { key: "End" });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 900, behavior: "smooth" });
    fireEvent.keyDown(track, { key: "Home" });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });

  it("drags with the mouse and does not open the card that was dragged", () => {
    const onOpenVideo = vi.fn();
    renderCarousel({ onOpenVideo });
    const { track } = measureTrack();
    track.scrollLeft = 0;

    fireEvent(track, pointer("pointerdown", { clientX: 300 }));
    fireEvent(track, pointer("pointermove", { clientX: 220 }));
    expect(track.scrollLeft).toBe(80);
    fireEvent(track, pointer("pointerup", { clientX: 220 }));

    // The click that ends a drag must not navigate.
    fireEvent.click(screen.getByRole("button", { name: /Small talk .* 피드에서 보기/ }));
    expect(onOpenVideo).not.toHaveBeenCalled();

    // A plain tap right after does navigate.
    fireEvent.click(screen.getByRole("button", { name: /Small talk .* 피드에서 보기/ }));
    expect(onOpenVideo).toHaveBeenCalledWith(expect.objectContaining({ id: "feed-1" }));
  });

  it("leaves touch swiping to native scrolling", () => {
    renderCarousel();
    const { track } = measureTrack();
    track.scrollLeft = 40;
    fireEvent(track, pointer("pointerdown", { clientX: 300, pointerType: "touch", pointerId: 2 }));
    fireEvent(track, pointer("pointermove", { clientX: 120, pointerType: "touch", pointerId: 2 }));
    // Untouched by the drag handler; the browser's own scrolling owns this gesture.
    expect(track.scrollLeft).toBe(40);
  });

  it("shows a skeleton while loading and an empty line when there is nothing", () => {
    const { unmount } = renderCarousel({ items: [], loading: true });
    expect(document.querySelector(".today-carousel-skeleton")).not.toBeNull();
    unmount();

    renderCarousel({ items: [], loading: false });
    expect(screen.getByText(/아직 추천할 영상이 없어요/)).toBeInTheDocument();
  });

  it("shows a retryable error without hiding the rest of the tab", () => {
    const onRetry = vi.fn();
    renderCarousel({ items: [], loading: false, error: "피드를 불러오지 못했습니다.", onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("피드를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
