"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type {
  ContentListResponse,
  ContentListView,
  LibraryKind,
  LibraryResponse,
} from "./reviewTypes";

export const CONTENT_RECORDS_PAGE_LIMIT = 10;
export const LIBRARY_PAGE_LIMIT = 10;

export function useInfiniteContentRecordsQuery({
  view,
  search,
  active,
}: {
  view: ContentListView;
  search: string;
  active: boolean;
}) {
  return useInfiniteQuery<ContentListResponse>({
    queryKey: ["review", "contents", view, search],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        view,
        page: String(pageParam),
        limit: String(CONTENT_RECORDS_PAGE_LIMIT),
      });
      if (search.trim()) params.set("search", search.trim());
      return apiFetch<ContentListResponse>(`/api/review/contents?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more && lastPage.page) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    enabled: active,
  });
}

export function useInfiniteLibraryQuery({
  kind,
  search,
  source,
  level,
  sort,
  active,
}: {
  kind: LibraryKind;
  search: string;
  source: string;
  level: string;
  sort: string;
  active: boolean;
}) {
  return useInfiniteQuery<LibraryResponse>({
    queryKey: ["review", "library", kind, search, source, level, sort],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        kind,
        sort,
        page: String(pageParam),
        limit: String(LIBRARY_PAGE_LIMIT),
      });
      if (search.trim()) params.set("search", search.trim());
      if (source) params.set("source", source);
      if (level) params.set("level", level);
      return apiFetch<LibraryResponse>(`/api/review/library?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.has_more && lastPage.page) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    enabled: active,
  });
}

export function useInvalidateReviewQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateContentRecords: () => {
      void queryClient.invalidateQueries({ queryKey: ["review", "contents"] });
    },
    invalidateLibrary: () => {
      void queryClient.invalidateQueries({ queryKey: ["review", "library"] });
    },
    invalidateAll: () => {
      void queryClient.invalidateQueries({ queryKey: ["review"] });
    },
  };
}
