import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedView } from "@/components/FeedView";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

type IntersectionEntryLike = {
  isIntersecting: boolean;
  intersectionRatio: number;
  target: HTMLElement;
};

let notify: ((entries: IntersectionEntryLike[]) => void) | null = null;

function stubIntersectionObserver() {
  class IntersectionObserverMock {
    constructor(callback: (entries: IntersectionEntryLike[]) => void) {
      notify = callback;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
}

function makeVideo(index: number) {
  return {
    id: `feed-${index}`,
    learning_content_id: `content-${index}`,
    youtube_video_id: `video-${index}`,
    youtube_url: `https://www.youtube.com/watch?v=video-${index}`,
    title: `Daily English ${index}`,
    channel_title: "English Channel",
    thumbnail_url: "https://example.com/thumb.jpg",
    duration_seconds: 45,
    caption_available: true,
    saved_status: "READY",
  };
}

type PlayerOptions = {
  videoId: string;
  host?: string;
  events?: { onError?: (event: { data: number }) => void };
};

function stubYouTubeApi() {
  const created: PlayerOptions[] = [];
  const player = {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    stopVideo: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    isMuted: vi.fn(() => true),
    destroy: vi.fn(),
    getPlayerState: vi.fn(() => 1),
    getDuration: vi.fn(() => 45),
    cueVideoById: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
  };
  window.YT = {
    Player: vi.fn((_element: HTMLElement, options: PlayerOptions) => {
      created.push(options);
      options.events?.onReady?.();
      return player;
    }) as unknown as NonNullable<typeof window.YT>["Player"],
  };
  return { created, player };
}

function scrollTo(index: number) {
  const card = document.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
  if (!card) throw new Error(`card ${index} is not rendered`);
  notify?.([{ isIntersecting: true, intersectionRatio: 0.95, target: card }]);
}

describe("Feed YouTube 봇 차단 방지", () => {
  beforeEach(() => {
    notify = null;
    stubIntersectionObserver();
    const items = [makeVideo(0), makeVideo(1), makeVideo(2), makeVideo(3)];
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (String(path).startsWith("/api/feed?")) {
        return Promise.resolve({ items, seed: "seed", next_cursor: null, total: items.length });
      }
      return Promise.resolve({});
    });
  });

  it("빠르게 넘기는 동안 지나간 영상의 임베드는 만들지 않는다", async () => {
    const { created } = stubYouTubeApi();
    render(<FeedView openLearning={vi.fn()} />);

    await waitFor(() => expect(document.querySelector('[data-feed-index="3"]')).not.toBeNull());
    await waitFor(() => expect(created.map((option) => option.videoId)).toEqual(["video-0"]));

    // 스와이프로 1 → 2 → 3을 연속 통과 (스크롤이 멈추지 않은 상태)
    // 각 프레임을 개별 커밋으로 흘려보내 실제 스와이프와 같은 상황을 만든다
    await act(async () => { scrollTo(1); });
    await act(async () => { scrollTo(2); });
    await act(async () => { scrollTo(3); });

    // 아직 정착 전이므로 새 플레이어가 생기지 않아야 한다
    expect(created.map((option) => option.videoId)).toEqual(["video-0"]);

    // 스크롤이 멈춘 뒤에는 마지막 영상만 로드된다
    await waitFor(
      () => expect(created.map((option) => option.videoId)).toEqual(["video-0", "video-3"]),
      { timeout: 2000 },
    );
  });

  it("쿠키가 전달되는 기본 youtube.com 임베드를 사용한다", async () => {
    const { created } = stubYouTubeApi();
    render(<FeedView openLearning={vi.fn()} />);

    await waitFor(() => expect(created.length).toBe(1));
    expect(created[0].host).toBeUndefined();
  });

  it("재생이 차단되면 YouTube에서 열기 폴백을 노출한다", async () => {
    const { created } = stubYouTubeApi();
    render(<FeedView openLearning={vi.fn()} />);

    await waitFor(() => expect(created.length).toBe(1));

    await act(async () => {
      created[0].events?.onError?.({ data: 150 });
    });

    expect(await screen.findByRole("button", { name: /YouTube에서 열기/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeTruthy();
  });
});
