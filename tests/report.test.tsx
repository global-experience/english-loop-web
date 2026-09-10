import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportView } from "@/components/ReportView";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

const analytics = {
  period: { days: 7, from: "2026-08-19", to: "2026-08-25" },
  total_study_minutes: 90,
  routine: { listen: { completed: 1, planned: 1, completion_rate: 100 }, ai_conversation: { completed: 1, planned: 2, completion_rate: 50 } },
  speech: { attempts: 4, average_match: 82, average_improvement: 6, practiced_lines: 12, retry_lines: 3 },
  reviews_completed: 5,
  voice_sessions_completed: 1,
  target_expression_usage: { tracked: 3, spontaneous: 1, spontaneous_rate: 33.3 },
  newly_mastered: 0,
  weaknesses: [{ category: "TENSE", occurrence_count: 2, latest_severity: 2, average_severity: 2.5, trend: "IMPROVING", description_ko: "시제 선택이 개선 중" }],
};

const report = {
  session_id: "s1",
  study_date: "2026-08-25",
  summary_ko: "목표 표현을 실제 대화에서 자발적으로 사용했습니다.",
  topics: ["프로젝트"],
  successful_expressions: [],
  target_expression_usage: [],
  corrections: [{ original: "I work on it since one year.", corrected: "I've been working on it for a year.", category: "TENSE", reason_ko: "기간 표현 교정" }],
  weaknesses: [],
  scores: { fluency: 3, grammar: 3, vocabulary: 4, comprehension: 4 },
  next_focus: ["현재완료진행형"],
  next_day_plan: {},
  created_at: "2026-08-25T12:00:00Z",
};

describe("ReportView", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path.startsWith("/api/analytics") ? analytics : path.startsWith("/api/reports") ? { items: [report] } : { items: [] }));
  });

  it("renders the saved report and switches the analytics period", async () => {
    render(<ReportView/>);
    expect(await screen.findByText(report.summary_ko)).toBeInTheDocument();
    expect(screen.getByText(report.corrections[0].corrected)).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "14일" }));
    expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/weekly?days=14");
  });

  it("refreshes the report when its app tab becomes active again", async () => {
    const view = render(<ReportView active={false}/>);
    expect(apiFetchMock).not.toHaveBeenCalled();

    view.rerender(<ReportView active/>);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/api/analytics/weekly?days=7"));
  });

  it("displays skeleton screen while loading and then reveals actual content", async () => {
    let resolveAnalytics: (value: unknown) => void;
    const pendingAnalytics = new Promise((resolve) => {
      resolveAnalytics = resolve;
    });

    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/analytics")) return pendingAnalytics;
      if (path.startsWith("/api/reports")) return Promise.resolve({ items: [report] });
      return Promise.resolve({ items: [] });
    });

    render(<ReportView />);

    // Skeleton should be visible while loading
    expect(screen.getByTestId("report-skeleton")).toBeInTheDocument();
    expect(screen.getByText("리포트 데이터를 불러오는 중입니다...")).toBeInTheDocument();

    // Premature empty states should NOT be rendered while loading
    expect(screen.queryByText("아직 저장된 수업 분석이 없어요.")).not.toBeInTheDocument();
    expect(screen.queryByText("따라 말하기 결과가 쌓이면 자주 빠지는 단어를 보여줘요.")).not.toBeInTheDocument();

    // Now resolve the analytics API
    resolveAnalytics!(analytics);

    // After resolution, real content should be visible and skeleton removed
    expect(await screen.findByText(report.summary_ko)).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.queryByTestId("report-skeleton")).not.toBeInTheDocument();
  });
});

