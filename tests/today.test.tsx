import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodayView } from "@/components/TodayView";
import { today, user } from "./fixtures";

describe("TodayView", () => {
  it("renders the four-step day and current progress", () => {
    render(<TodayView today={today} user={user} refresh={vi.fn()} openLearning={vi.fn()}/>);
    expect(screen.getByText("출근 리스닝")).toBeInTheDocument();
    expect(screen.getByText("점심 스피킹")).toBeInTheDocument();
    expect(screen.getByText("퇴근 복습")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT 음성 대화")).toBeInTheDocument();
    expect(screen.getByLabelText("오늘 진행률 25퍼센트")).toBeInTheDocument();
  });

  it("opens a learning mode from the routine", () => {
    const open = vi.fn();
    render(<TodayView today={today} user={user} refresh={vi.fn()} openLearning={open}/>);
    fireEvent.click(screen.getByLabelText("출근 리스닝 열기"));
    expect(open).toHaveBeenCalledWith("morning");
  });

  it("shows the save reminder for a stale started session", () => {
    const stale = { ...today, coach_session: { status: "STARTED" as const, session_id: "s1", started_at: new Date(Date.now() - 46 * 60_000).toISOString(), completed_at: null } };
    render(<TodayView today={stale} user={user} refresh={vi.fn()} openLearning={vi.fn()}/>);
    expect(screen.getByText(/음성 수업 결과가 아직 저장되지 않았습니다/)).toBeInTheDocument();
  });

  it("renders the completed ChatGPT session state", () => {
    const completed = { ...today, coach_session: { status: "COMPLETED" as const, session_id: "s1", started_at: new Date().toISOString(), completed_at: new Date().toISOString() } };
    render(<TodayView today={completed} user={user} refresh={vi.fn()} openLearning={vi.fn()}/>);
    expect(screen.getByText("저장 완료")).toBeInTheDocument();
    expect(screen.getByText("오늘의 분석이 리포트에 반영됐어요.")).toBeInTheDocument();
  });
});
