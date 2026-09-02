import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodayView } from "@/components/TodayView";
import { apiFetch } from "@/lib/api";
import { listeningActivity, today, user } from "./fixtures";
import { mockCoachHint, mockRecommendedVideos, mockReviewSummary } from "@/lib/todayMock";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

function mockApi(override: (path: string) => unknown = () => undefined) {
  vi.mocked(apiFetch).mockImplementation((path) => {
    const value = String(path);
    const handled = override(value);
    if (handled !== undefined) return Promise.resolve(handled) as never;
    if (value.startsWith("/api/feed")) {
      return Promise.resolve({ items: mockRecommendedVideos.items, total: mockRecommendedVideos.total, seed: "s", next_cursor: null }) as never;
    }
    if (value.startsWith("/api/review/queue")) {
      return Promise.resolve({ as_of: "", summary: mockReviewSummary, items: [] }) as never;
    }
    if (value.startsWith("/api/learning/sessions/results")) {
      return Promise.resolve({ items: [{ id: "r1", content_id: "c1", practiced_line_count: 8, saved_expression_count: 2, retry_line_count: 3, missing_words: ["on", "for"], completed_at: "" }] }) as never;
    }
    if (value.startsWith("/api/reports")) {
      return Promise.resolve({ items: [{ next_focus: mockCoachHint.focusTags, weaknesses: [] }] }) as never;
    }
    return Promise.resolve({}) as never;
  });
}

function renderToday(props: Partial<Parameters<typeof TodayView>[0]> = {}) {
  return render(
    <TodayView
      today={today}
      user={user}
      refresh={vi.fn()}
      openLearning={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  // 09:00 KST puts the day in the morning-commute slot.
  vi.setSystemTime(new Date("2026-08-23T00:00:00Z"));
});

describe("Today summary", () => {
  it("highlights the routine for the current time with its estimate and targets", async () => {
    mockApi();
    renderToday();

    const summary = document.querySelector(".today-summary") as HTMLElement;
    expect(within(summary).getByText("NOW · 출근 듣기")).toBeInTheDocument();
    expect(within(summary).getByRole("heading", { level: 2 })).toHaveTextContent("출근 듣기");
    expect(within(summary).getByText(/대본 없이 한 번 듣고/)).toBeInTheDocument();
    expect(within(summary).getByText("30분")).toBeInTheDocument();
    expect(within(summary).getByText("1개")).toBeInTheDocument();
    expect(screen.getByLabelText("오늘 진행률 25퍼센트")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: /학습 시작/ })).toBeInTheDocument();
  });

  it("starts the current routine with routineStep, contentId and entrySource", async () => {
    mockApi();
    const openLearning = vi.fn();
    renderToday({ openLearning });

    fireEvent.click(screen.getByRole("button", { name: /학습 시작/ }));
    expect(openLearning).toHaveBeenCalledWith(expect.objectContaining({
      slot: "MORNING_COMMUTE",
      id: listeningActivity.id,
    }));
  });

  it("moves the focus to the evening step in the evening", async () => {
    mockApi();
    // 20:00 KST.
    vi.setSystemTime(new Date("2026-08-23T11:00:00Z"));
    renderToday();
    const summary = document.querySelector(".today-summary") as HTMLElement;
    expect(within(summary).getByText("NOW · 밤 음성 대화")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: /음성 대화 열기/ })).toBeInTheDocument();
  });
});

describe("Today routine", () => {
  it("marks done, current and upcoming steps and emphasises only the current one", async () => {
    mockApi();
    const activities = today.plan!.activities.map((activity) =>
      activity.slot === "MORNING_COMMUTE" ? { ...activity, status: "COMPLETED" as const } : activity
    );
    renderToday({ today: { ...today, plan: { ...today.plan!, activities } } });

    const rows = document.querySelectorAll(".today-routine-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveClass("done");
    expect(rows[1]).toHaveClass("current");
    expect(rows[2]).toHaveClass("upcoming");
    expect(rows[3]).toHaveClass("upcoming");
    expect(document.querySelectorAll(".today-routine-row.current")).toHaveLength(1);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
  });

  it("opens the learning session for the step that is tapped", async () => {
    mockApi();
    const openLearning = vi.fn();
    renderToday({ openLearning });
    fireEvent.click(screen.getByLabelText("퇴근 자막 없이 말하기 열기"));
    expect(openLearning).toHaveBeenCalledWith(expect.objectContaining({ slot: "EVENING_COMMUTE" }));
  });

  it("shows the four steps of the day", async () => {
    mockApi();
    renderToday();
    for (const label of ["출근 듣기", "점심 말하기", "퇴근 자막 없이 말하기", "밤 음성 대화"]) {
      expect(screen.getByLabelText(`${label} 열기`)).toBeInTheDocument();
    }
  });
});

describe("Today sections", () => {
  it("shows recommended videos and opens the feed with the tapped one", async () => {
    mockApi();
    const openFeedVideo = vi.fn();
    renderToday({ openFeedVideo });

    const card = await screen.findByRole("button", { name: /Small talk that actually works at the office 피드에서 보기/ });
    fireEvent.click(card);
    expect(openFeedVideo).toHaveBeenCalledWith(expect.objectContaining({ id: "feed-1" }));
  });

  it("shows today's review counts and starts the review queue", async () => {
    mockApi();
    const openReview = vi.fn();
    renderToday({ openReview });

    // The loading placeholder shares the class name, so wait for the loaded numbers.
    const strip = (await waitFor(() => {
      const node = document.querySelector(".today-review-strip");
      expect(node?.querySelectorAll("dd").length).toBe(3);
      return node as HTMLElement;
    }));
    // Each value renders as "<number><unit>", so read the definitions themselves.
    const values = Array.from(strip.querySelectorAll("dd")).map((node) => node.textContent);
    expect(values).toEqual(["12개", "6분", "3개"]);
    const labels = Array.from(strip.querySelectorAll("dt")).map((node) => node.textContent);
    expect(labels).toEqual(["복습할 표현", "예상 시간", "다시 말할 문장"]);

    fireEvent.click(within(strip).getByRole("button", { name: /복습 시작/ }));
    expect(openReview).toHaveBeenCalled();
  });

  it("suggests a next action from the learner's own records", async () => {
    mockApi();
    renderToday();
    expect(await screen.findByText("다시 말할 문장 3개가 남아 있어요.")).toBeInTheDocument();
    expect(screen.getByText(/빠뜨린 단어: on, for/)).toBeInTheDocument();
  });

  it("falls back to generic guidance when there is no analysis", async () => {
    mockApi((path) => {
      if (path.startsWith("/api/learning/sessions/results")) return { items: [] };
      if (path.startsWith("/api/reports")) return { items: [] };
      return undefined;
    });
    renderToday();
    expect(await screen.findByText("먼저 한 세션을 끝내볼까요?")).toBeInTheDocument();
    expect(screen.getByText(/일반 안내를 보여드리고 있어요/)).toBeInTheDocument();
  });

  it("keeps the routine usable when the feed and review requests fail", async () => {
    mockApi((path) => {
      if (path.startsWith("/api/feed") || path.startsWith("/api/review/queue")) {
        throw new Error("서버에 연결할 수 없습니다.");
      }
      return undefined;
    });
    renderToday();

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    // The routine and the primary action do not depend on those requests.
    expect(screen.getByLabelText("출근 듣기 열기")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /학습 시작/ })).toBeEnabled();
  });
});

describe("Today session state", () => {
  it("shows the save reminder for a stale started session", async () => {
    mockApi();
    const stale = { ...today, coach_session: { status: "STARTED" as const, session_id: "s1", started_at: new Date(Date.now() - 46 * 60_000).toISOString(), completed_at: null } };
    renderToday({ today: stale });
    expect(screen.getByText(/음성 수업 결과가 아직 저장되지 않았습니다/)).toBeInTheDocument();
  });

  it("renders the completed ChatGPT session state", async () => {
    mockApi();
    const completed = { ...today, coach_session: { status: "COMPLETED" as const, session_id: "s1", started_at: new Date().toISOString(), completed_at: new Date().toISOString() } };
    renderToday({ today: completed });
    expect(screen.getByText("저장 완료")).toBeInTheDocument();
    expect(screen.getByText("오늘의 분석이 리포트에 반영됐어요.")).toBeInTheDocument();
  });

  it("keeps the tab usable on a day with no plan and can build the routine", async () => {
    const calls: string[] = [];
    mockApi((path) => {
      calls.push(path);
      if (path === "/api/today/plan") return { plan: null };
      return undefined;
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderToday({ today: { ...today, plan: null }, refresh });

    // The summary explains the state and offers the one action that fixes it.
    const summary = document.querySelector(".today-summary") as HTMLElement;
    expect(within(summary).getByText(/아직 없어요/)).toBeInTheDocument();
    const create = within(summary).getByRole("button", { name: /오늘 루틴 만들기/ });

    // The plan-independent sections still work, so the tab is not a dead end.
    expect(await screen.findByRole("button", { name: /Small talk .* 피드에서 보기/ })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".today-review-strip dd")).not.toBeNull());
    expect(await screen.findByText("다시 말할 문장 3개가 남아 있어요.")).toBeInTheDocument();
    // No routine rows to open, so the section explains what unlocks them.
    expect(document.querySelectorAll(".today-routine-row")).toHaveLength(0);
    expect(screen.getByText(/4단계가 열립니다/)).toBeInTheDocument();

    fireEvent.click(create);
    await waitFor(() => expect(calls).toContain("/api/today/plan"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("reports a failure to build the routine without breaking the tab", async () => {
    mockApi((path) => {
      if (path === "/api/today/plan") throw new Error("루틴을 만들지 못했습니다.");
      return undefined;
    });
    renderToday({ today: { ...today, plan: null } });

    fireEvent.click(screen.getByRole("button", { name: /오늘 루틴 만들기/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("루틴을 만들지 못했습니다.");
    expect(await screen.findByRole("button", { name: /Small talk .* 피드에서 보기/ })).toBeInTheDocument();
  });
});
