"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { CATALOG_VIDEO_LIMIT, fetchCatalogPage, fetchCategoryPage } from "./catalog";
import type { CatalogPage, CatalogRow } from "./types";

export const CATALOG_STALE_TIME = 1000 * 60 * 5; // 5 minutes

export const catalogQueryKeys = {
  all: ["catalog"] as const,
  infinite: (seed: string) => ["catalog", "infinite", seed] as const,
  categoryVideos: (slug: string, seed: string) => ["catalog", "category", slug, seed] as const,
};

/**
 * 카테고리 카탈로그 세로 무한 스크롤 쿼리 (React Query 서버 상태 관리).
 */
export function useInfiniteCatalogQuery(seed: string) {
  return useInfiniteQuery<CatalogPage>({
    queryKey: catalogQueryKeys.infinite(seed),
    queryFn: async ({ pageParam = 0 }) => {
      return fetchCatalogPage(pageParam as number, seed);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      return lastPage?.next_cursor ?? undefined;
    },
    staleTime: CATALOG_STALE_TIME,
  });
}

/**
 * 특정 카테고리 행의 가로 무한 스크롤 쿼리 (React Query 서버 상태 관리).
 */
export function useInfiniteCategoryVideosQuery({
  slug,
  seed,
  initialRow,
}: {
  slug: string;
  seed: string;
  initialRow: CatalogRow;
}) {
  return useInfiniteQuery<CatalogRow>({
    queryKey: catalogQueryKeys.categoryVideos(slug, seed),
    queryFn: async ({ pageParam = 0 }) => {
      if (pageParam === 0) {
        return initialRow;
      }
      return fetchCategoryPage(slug, pageParam as number, seed, CATALOG_VIDEO_LIMIT);
    },
    initialPageParam: 0,
    initialData: {
      pages: [initialRow],
      pageParams: [0],
    },
    getNextPageParam: (lastPage) => {
      return lastPage?.next_cursor ?? undefined;
    },
    staleTime: CATALOG_STALE_TIME,
  });
}
