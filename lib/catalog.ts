/**
 * 카탈로그 데이터 계층.
 *
 * 두 축 모두 끝이 있다. 서버가 `next_cursor: null` 을 주면 그 축은 더 요청하지
 * 않는다. 이 규칙을 화면 쪽에 흩어 두면 한 곳만 빠뜨려도 무한 요청이 된다.
 */

import { apiFetch } from "@/lib/api";
import type { CatalogPage, CatalogRow, FeedVideoDetail } from "@/lib/types";

export const CATALOG_ROW_LIMIT = 4;
export const CATALOG_VIDEO_LIMIT = 10;

/** 줄 안의 순서를 하루 동안 고정한다. 스크롤을 오갈 때마다 섞이면 읽을 수 없다. */
export function catalogSeed(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `catalog-${year}${month}${day}`;
}

export async function fetchCatalogPage(cursor: number, seed: string): Promise<CatalogPage> {
  const params = new URLSearchParams({
    cursor: String(cursor),
    row_limit: String(CATALOG_ROW_LIMIT),
    video_limit: String(CATALOG_VIDEO_LIMIT),
    seed,
  });
  return apiFetch<CatalogPage>(`/api/feed/catalog?${params}`);
}

export async function fetchCategoryPage(
  slug: string,
  cursor: number,
  seed: string,
  limit = CATALOG_VIDEO_LIMIT,
): Promise<CatalogRow> {
  const params = new URLSearchParams({ cursor: String(cursor), limit: String(limit), seed });
  return apiFetch<CatalogRow>(`/api/feed/catalog/${encodeURIComponent(slug)}/videos?${params}`);
}

export async function fetchVideoDetail(videoId: string): Promise<FeedVideoDetail> {
  return apiFetch<FeedVideoDetail>(`/api/feed/videos/${encodeURIComponent(videoId)}`);
}

export async function toggleVideoLike(videoId: string, liked: boolean) {
  return apiFetch<{ liked: boolean; like_count: number }>(`/api/feed/${videoId}/like`, {
    method: liked ? "POST" : "DELETE",
  });
}

/**
 * 상세 화면 공유 링크.
 *
 * 내부 UUID 가 아니라 `youtube_video_id` 를 쓴다. 백엔드가 둘 다 받는다.
 * Universal Links / App Links 설정이 붙으면 이 주소 그대로 앱이 열리고,
 * 없으면 브라우저가 연다 — 링크 값은 어느 쪽이든 같다.
 */
export function videoShareUrl(youtubeVideoId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://loopine.life";
  return `${origin}/feed/${encodeURIComponent(youtubeVideoId)}/video/`;
}
