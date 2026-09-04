"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Activity, FeedVideo, TodayData, TodayRoutineItem, User } from "@/lib/types";
import {
  fetchCoachHint,
  fetchRecommendedVideos,
  fetchReviewSummary,
  idleSection,
  sectionError,
  type AsyncSection,
  type CoachHint as CoachHintData,
  type RecommendedVideos,
  type TodayReviewSummary,
} from "@/lib/todayData";
import { resolveTodayFocus, stepOpensCoach, type RoutineSlot } from "@/lib/todayPlan";
import { CoachHint } from "./today/CoachHint";
import { RecommendedCarousel } from "./today/RecommendedCarousel";
import { TodayReviewStrip } from "./today/TodayReviewStrip";
import { TodayRoutine } from "./today/TodayRoutine";
import { TodaySummary } from "./today/TodaySummary";

const sessionCopy = {
  NOT_STARTED: ["학습 데이터 준비 전", "수업 시작 전 오늘 루틴을 확인하세요."],
  STARTED: ["음성 수업 진행 중", "음성 모드 종료 후 저장 문구를 입력하세요."],
  AWAITING_REPORT: ["분석 저장 대기", "ChatGPT 채팅에서 ‘오늘 수업 저장’을 입력하세요."],
  COMPLETED: ["저장 완료", "오늘의 분석이 리포트에 반영됐어요."],
  FAILED: ["저장 실패", "ChatGPT 채팅에서 저장을 다시 요청하세요."],
} as const;

type Props = {
  today: TodayData;
  user: User;
  refresh: () => Promise<void>;
  openLearning: (target: Activity | TodayRoutineItem) => void;
  /** Jump to the feed tab with this video selected. */
  openFeedVideo?: (video: FeedVideo) => void;
  /** Jump to the review tab's today queue. */
  openReview?: () => void;
};

/**
 * The Today tab picks the next action rather than reporting the day.
 *
 * Each section below the summary loads on its own (`AsyncSection`), so a failing feed
 * or review request degrades that one strip and leaves the routine — which needs no
 * extra request — fully usable.
 */
export function TodayView({ today, user, refresh, openLearning, openFeedVideo, openReview }: Props) {
  const plan = today.plan;
  const activities = useMemo(() => plan?.activities || [], [plan]);
  const routineItems = useMemo(() => today.routine?.today_items || [], [today.routine?.today_items]);
  const focus = useMemo(() => resolveTodayFocus(activities, new Date(), routineItems), [activities, routineItems]);
  // An unmapped status would throw while destructuring and take the whole tab down.
  const [sessionLabel, sessionDetail] =
    sessionCopy[today.coach_session?.status as keyof typeof sessionCopy] ?? sessionCopy.NOT_STARTED;

  const [videos, setVideos] = useState<AsyncSection<RecommendedVideos>>(idleSection);
  const [review, setReview] = useState<AsyncSection<TodayReviewSummary>>(idleSection);
  const [coach, setCoach] = useState<AsyncSection<CoachHintData>>(idleSection);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planError, setPlanError] = useState("");

  const noPlan = !plan && routineItems.length === 0;

  /**
   * Build today's routine on demand. A plan is otherwise only created when the account
   * is approved or by the previous night's session, so any day in between would leave
   * this tab with nothing to start.
   */
  async function createPlan() {
    setCreatingPlan(true);
    setPlanError("");
    try {
      await apiFetch("/api/today/plan", { method: "POST" });
      await refresh();
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : "오늘 루틴을 만들지 못했습니다.");
    } finally {
      setCreatingPlan(false);
    }
  }

  const loadVideos = useCallback(async () => {
    setVideos((current) => ({ ...current, loading: true, error: "" }));
    try {
      setVideos({ data: await fetchRecommendedVideos(8), loading: false, error: "" });
    } catch (caught) {
      setVideos({ data: null, loading: false, error: sectionError(caught, "추천 영상을 불러오지 못했습니다.") });
    }
  }, []);

  const loadReview = useCallback(async () => {
    setReview((current) => ({ ...current, loading: true, error: "" }));
    try {
      setReview({ data: await fetchReviewSummary(), loading: false, error: "" });
    } catch (caught) {
      setReview({ data: null, loading: false, error: sectionError(caught, "복습 큐를 불러오지 못했습니다.") });
    }
  }, []);

  const loadCoach = useCallback(async () => {
    setCoach((current) => ({ ...current, loading: true, error: "" }));
    try {
      setCoach({ data: await fetchCoachHint(), loading: false, error: "" });
    } catch (caught) {
      // The coach is advisory: keep the tab working and fall back to generic copy.
      setCoach({ data: null, loading: false, error: sectionError(caught, "") });
    }
  }, []);

  useEffect(() => {
    void loadVideos();
    void loadReview();
    void loadCoach();
  }, [loadVideos, loadReview, loadCoach]);

  useEffect(() => {
    const handlePull = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; done?: () => void }>;
      if (customEvent.detail?.tab === "today") {
        void Promise.allSettled([loadVideos(), loadReview(), loadCoach()]).finally(() => {
          customEvent.detail?.done?.();
        });
      }
    };
    window.addEventListener("loopine:pull-refresh", handlePull);
    return () => window.removeEventListener("loopine:pull-refresh", handlePull);
  }, [loadVideos, loadReview, loadCoach]);

  const openRoutine = useCallback((target: RoutineSlot | TodayRoutineItem) => {
    if (stepOpensCoach(target)) {
      openCoach();
      return;
    }
    if (typeof target === "string") {
      const activity = activities.find((item) => item.slot === target);
      if (activity) openLearning(activity);
      return;
    }
    openLearning(target);
  }, [activities, openLearning]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCoach() {
    if (!user.custom_gpt_url) {
      alert("설정에서 Custom GPT URL을 먼저 등록해주세요.");
      return;
    }
    window.open(user.custom_gpt_url, "_blank", "noopener,noreferrer");
  }

  async function copyStart() {
    await navigator.clipboard.writeText("오늘 수업 시작");
  }

  const staleSession = today.coach_session?.status === "STARTED" && today.coach_session.started_at
    ? Date.now() - new Date(today.coach_session.started_at).getTime() > 45 * 60 * 1000
    : false;

  return (
    <div className="view-stack today-view">
      <TodaySummary
        today={today}
        focus={focus}
        onStart={() => {
          if (focus.routineItem) openRoutine(focus.routineItem);
          else if (focus.step) openRoutine(focus.step.slot);
        }}
        noPlan={noPlan}
        creatingPlan={creatingPlan}
        onCreatePlan={() => void createPlan()}
      />

      {planError && (
        <div className="today-inline-error" role="alert">
          <span>{planError}</span>
          <button type="button" className="text-button" onClick={() => void refresh()}>다시 불러오기</button>
        </div>
      )}

      {staleSession && (
        <div className="warning-card" role="status">
          <TriangleAlert size={20} />
          <p>
            <strong>음성 수업 결과가 아직 저장되지 않았습니다.</strong><br />
            ChatGPT 채팅에서 음성 모드를 종료한 뒤 “오늘 수업 저장”을 입력해주세요.
          </p>
        </div>
      )}

      <RecommendedCarousel
        items={videos.data?.items || []}
        loading={videos.loading}
        error={videos.error}
        onRetry={() => void loadVideos()}
        onOpenVideo={(video) => openFeedVideo?.(video)}
      />

      <TodayReviewStrip
        summary={review.data}
        loading={review.loading}
        error={review.error}
        onRetry={() => void loadReview()}
        onStartReview={() => openReview?.()}
      />

      {noPlan ? (
        <section className="today-section" aria-label="오늘의 루틴">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR DAY</p><h2>오늘의 루틴</h2></div>
            <span>기본 루틴</span>
          </div>
          <p className="muted-copy today-empty-line">
            오늘 루틴을 만들면 출근 듣기 · 점심 말하기 · 퇴근 자막 없이 말하기 · 밤 음성 대화 4단계가 열립니다.
          </p>
        </section>
      ) : (
        <TodayRoutine activities={activities} routineItems={routineItems} states={focus.states} onOpen={openRoutine} />
      )}

      <CoachHint
        hint={coach.data}
        loading={coach.loading}
        sessionLabel={sessionLabel}
        sessionDetail={sessionDetail}
        onCopyStart={() => void copyStart()}
        onOpenCoach={openCoach}
      />
    </div>
  );
}
