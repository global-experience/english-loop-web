import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { SPLASH_SESSION_KEY } from "@/components/AppSplash";
import { today, user } from "./fixtures";

const apiFetchMock = vi.hoisted(() => vi.fn());
const scrollToMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  mediaUrl: (path: string | null) => path,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

describe("Home", () => {
  beforeEach(() => {
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
    expect(screen.getByText("오늘의 학습 루틴")).toBeInTheDocument();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("moves forward and back through the main app tabs", async () => {
    render(<Home/>);
    await screen.findByText("오늘의 학습 루틴");

    fireEvent.click(screen.getByRole("tab", { name: "학습" }));
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
    const learnPanel = document.getElementById("panel-learn");
    expect(learnPanel).toHaveClass("tab-viewport");
    expect(learnPanel?.firstElementChild).toHaveClass("tab-scene-forward");
    expect(screen.getByRole("tab", { name: "학습" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "학습" }));
    expect(scrollToMock).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "smooth" });

    fireEvent.click(screen.getByRole("tab", { name: "점심" }));
    expect(document.getElementById("learning-panel-lunch")).toHaveClass("mode-scene-forward");
    fireEvent.click(screen.getByRole("tab", { name: "출근" }));
    expect(document.getElementById("learning-panel-morning")).toHaveClass("mode-scene-back");

    fireEvent.click(screen.getByRole("tab", { name: "오늘" }));
    expect(document.getElementById("panel-today")?.firstElementChild).toHaveClass("tab-scene-back");
  });
});
