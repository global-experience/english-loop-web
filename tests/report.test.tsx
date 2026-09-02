import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportView } from "@/components/ReportView";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

const analytics = {
  period: { days: 7, from: "2026-08-19", to: "2026-08-25" },
  total_study_minutes: 90,
  routine: { MORNING_COMMUTE: { completed: 1, planned: 1, completion_rate: 100 } },
  listening: { first_average: 2, final_average: 4, average_improvement: 2, shadowed_sentences: 3 },
  lunch_speaking_attempts: 1,
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
});
