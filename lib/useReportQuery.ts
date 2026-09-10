"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Analytics, Report } from "@/lib/types";

export type LearningResult = {
  id: string;
  practiced_line_count: number;
  saved_expression_count: number;
  retry_line_count: number;
  missing_words: string[];
  completed_at: string;
};

export type LearningProfile = {
  profile_version: string;
  generated_at: string;
  data_quality: {
    confidence: string;
    evidence_count: number;
    coach_reports: number;
    feed_events_14d: number;
    speech_attempts_14d: number;
  };
  content_preferences: {
    top_channels: Array<{ channel: string; affinity_score: number; opens: number; saves: number }>;
  };
  recommended_actions: Array<{ type: string; title: string; reason: string }>;
  integration: {
    latest_coach_session: null | {
      study_date: string;
      status: string;
      context_version: string;
      report_received_at: string | null;
      report_evidence_count: number;
    };
    unfinished_sessions: number;
  };
};

export const reportQueryKeys = {
  all: ["report"] as const,
  analytics: (days: number) => ["report", "analytics", days] as const,
  reports: () => ["report", "reports"] as const,
  learningResults: (days: number) => ["report", "learningResults", days] as const,
  profile: () => ["report", "profile"] as const,
};

export const REPORT_STALE_TIME = 1000 * 60 * 5; // 5 minutes

export function useReportQueries({ days, active = true }: { days: 7 | 14; active?: boolean }) {
  const queryClient = useQueryClient();

  const analyticsQuery = useQuery({
    queryKey: reportQueryKeys.analytics(days),
    queryFn: () => apiFetch<Analytics>(`/api/analytics/weekly?days=${days}`),
    staleTime: REPORT_STALE_TIME,
    enabled: active,
  });

  const reportsQuery = useQuery({
    queryKey: reportQueryKeys.reports(),
    queryFn: () => apiFetch<{ items: Report[] }>("/api/reports?page_size=14"),
    staleTime: REPORT_STALE_TIME,
    enabled: active,
  });

  const learningResultsQuery = useQuery({
    queryKey: reportQueryKeys.learningResults(days),
    queryFn: () => apiFetch<{ items: LearningResult[] }>(`/api/learning/sessions/results?limit=200&days=${days}`),
    staleTime: REPORT_STALE_TIME,
    enabled: active,
  });

  const profileQuery = useQuery({
    queryKey: reportQueryKeys.profile(),
    queryFn: () => apiFetch<LearningProfile>("/api/learning/profile"),
    staleTime: REPORT_STALE_TIME,
    enabled: active,
  });

  const refetchAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: reportQueryKeys.all });
  }, [queryClient]);

  const isInitialLoading =
    (analyticsQuery.isPending && analyticsQuery.isFetching) ||
    (reportsQuery.isPending && reportsQuery.isFetching) ||
    (learningResultsQuery.isPending && learningResultsQuery.isFetching) ||
    (profileQuery.isPending && profileQuery.isFetching);

  return {
    analytics: analyticsQuery.data ?? null,
    reports: reportsQuery.data?.items ?? [],
    learningResults: learningResultsQuery.data?.items ?? [],
    profile: profileQuery.data ?? null,
    isLoading: isInitialLoading && !analyticsQuery.data,
    isRefetching:
      analyticsQuery.isRefetching ||
      reportsQuery.isRefetching ||
      learningResultsQuery.isRefetching ||
      profileQuery.isRefetching,
    refetchAll,
  };
}
