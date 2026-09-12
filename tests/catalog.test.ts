/**
 * 카탈로그 데이터 계층.
 *
 * 두 축(세로 카테고리 / 가로 영상) 모두 서버가 `next_cursor: null` 을 주면
 * 멈춰야 한다. 이 규칙이 깨지면 스크롤할수록 같은 요청이 계속 나간다.
 * 공유 링크가 내부 UUID 를 노출하지 않는 것도 여기서 고정한다.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { catalogSeed, fetchCatalogPage, fetchCategoryPage, toggleVideoLike, videoShareUrl } from "@/lib/catalog";
import { categoryVideoPath } from "@/components/feed/FeedVideoDetail";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

function calledPath(): string {
  return String(vi.mocked(apiFetch).mock.calls[0][0]);
}

describe("catalogSeed", () => {
  it("하루 동안 같은 seed 를 준다 — 스크롤을 오갈 때마다 줄이 섞이면 읽을 수 없다", () => {
    const morning = catalogSeed(new Date("2026-09-08T01:00:00"));
    const evening = catalogSeed(new Date("2026-09-08T22:30:00"));
    expect(morning).toBe(evening);
    expect(morning).toBe("catalog-20260908");
  });

  it("날짜가 바뀌면 새로 섞는다", () => {
    expect(catalogSeed(new Date("2026-09-09T01:00:00"))).not.toBe(catalogSeed(new Date("2026-09-08T01:00:00")));
  });
});

describe("fetchCatalogPage", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("커서와 seed 를 그대로 실어 보낸다", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], seed: "s", next_cursor: null, total: 0 });
    await fetchCatalogPage(4, "catalog-20260908");
    const path = calledPath();
    expect(path).toContain("cursor=4");
    expect(path).toContain("seed=catalog-20260908");
  });

  it("카테고리가 떨어지면 next_cursor 가 null 이다", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], seed: "s", next_cursor: null, total: 2 });
    await expect(fetchCatalogPage(2, "s")).resolves.toMatchObject({ next_cursor: null });
  });
});

describe("fetchCategoryPage", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("slug 를 URL 인코딩한다", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ category: {}, items: [], next_cursor: null, total: 0 });
    await fetchCategoryPage("daily conversation", 0, "s");
    expect(calledPath()).toContain("/api/feed/catalog/daily%20conversation/videos");
  });
});

describe("toggleVideoLike", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("켤 때 POST, 끌 때 DELETE", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ liked: true, like_count: 1 });
    await toggleVideoLike("video-1", true);
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: "POST" });

    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({ liked: false, like_count: 0 });
    await toggleVideoLike("video-1", false);
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});

describe("videoShareUrl", () => {
  it("내부 UUID 가 아니라 youtube_video_id 를 쓴다", () => {
    const url = videoShareUrl("rGQkLXIey4Y");
    expect(url).toContain("/feed/rGQkLXIey4Y/video/");
    // 앱이 있으면 앱, 없으면 웹 — 판단은 OS(Universal Links) 가 한다.
    // 그래서 링크 값 자체는 평범한 https 주소여야 한다.
    expect(url.startsWith("http")).toBe(true);
    expect(url).not.toContain("loopine://");
  });
});

describe("categoryVideoPath", () => {
  it("현재 영상 ID와 제목 slug로 공개 카테고리 공유 URL을 만든다", () => {
    const path = categoryVideoPath({
      youtube_video_id: "F1FLaK26RlQ",
      title: "The Simpsons | Best Moments Part 3",
    } as never);
    expect(path).toBe("/feed/categories/F1FLaK26RlQ/the-simpsons-best-moments-part-3/");
  });
});
