import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { SPLASH_SESSION_KEY } from "@/components/AppSplash";
import { today, user } from "./fixtures";

const apiFetchMock = vi.hoisted(() => vi.fn());
const scrollToMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getApiBase: () => "http://localhost:8000",
  mediaUrl: (path: string | null) => path,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

describe("Home", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollToMock });
    scrollToMock.mockReset();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => Promise.resolve(path === "/api/me" ? user : today));
  });

  it("shows a clear offline state without losing the loaded day", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<Home/>);
    expect(await screen.findByText(/오프라인 — 작성 내용은 이 기기에 보관됩니다/)).toBeInTheDocument();
    expect(screen.getByText("오늘의 루틴")).toBeInTheDocument();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("moves forward and back through the main app tabs", async () => {
    render(<Home/>);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(document.getElementById("tab-learn")!);
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "instant" });
    const learnPanel = document.getElementById("panel-learn");
    expect(learnPanel).toHaveClass("tab-pane", "active", "tab-scene-forward");
    expect(document.getElementById("panel-today")).toHaveClass("inactive");
    expect(document.getElementById("tab-learn")).toHaveAttribute("aria-selected", "true");

    fireEvent.click(document.getElementById("tab-learn")!);
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "smooth" });

    expect(await screen.findByText("무엇을 연습할까요?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "콘텐츠 선택" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "점심" })).not.toBeInTheDocument();

    fireEvent.click(document.getElementById("tab-today")!);
    expect(document.getElementById("panel-today")).toHaveClass("tab-scene-back");
  });

  it("opens Today content directly in the learning workspace", async () => {
    render(<Home/>);
    await screen.findByText("오늘의 루틴");
    fireEvent.click(screen.getByRole("button", { name: "출근 듣기 열기" }));
    expect(await screen.findByText("프로젝트 소개")).toBeInTheDocument();
    expect(screen.getByText("오늘 루틴")).toBeInTheDocument();
    expect(screen.getByText("출근 프리셋")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The main challenge was keeping it simple." })).toBeInTheDocument();
  });
});
