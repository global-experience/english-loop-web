import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { SPLASH_SESSION_KEY } from "@/components/AppSplash";
import { today, user } from "./fixtures";
import { mockRecommendedVideos, mockReviewSummary } from "@/lib/todayMock";
import { emptyQueueResponse } from "./review-fixtures";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getApiBase: () => "http://localhost:8000",
  mediaUrl: (path: string | null) => path,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const feedVideo = mockRecommendedVideos.items[0];

describe("Today tab navigation", () => {
  beforeEach(() => {
    class IntersectionObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    window.history.replaceState({}, "", "/");
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    vi.setSystemTime(new Date("2026-08-23T00:00:00Z"));
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      const value = String(path);
      if (value === "/api/me") return Promise.resolve(user);
      if (value === "/api/today") return Promise.resolve(today);
      if (value.startsWith("/api/feed?")) {
        return Promise.resolve({ items: mockRecommendedVideos.items, total: 3, seed: "seed", next_cursor: null });
      }
      if (value.startsWith("/api/review/queue")) {
        return Promise.resolve({ as_of: "", summary: mockReviewSummary, items: emptyQueueResponse.items });
      }
      if (value.startsWith("/api/review/contents") || value.startsWith("/api/review/library")) {
        return Promise.resolve({ items: [], total: 0, view: "recent", as_of: "", counts: { words: 0, sentences: 0 }, sources: [], levels: [] });
      }
      if (value.startsWith("/api/learning/sessions/results")) return Promise.resolve({ items: [] });
      if (value.startsWith("/api/reports")) return Promise.resolve({ items: [] });
      if (value.startsWith("/api/contents/")) return Promise.resolve(today.plan!.activities[0].content);
      return Promise.resolve({});
    });
  });

  it("keeps the tab order 오늘 / 학습 / 피드 / 복습 / 리포트", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");
    expect(Array.from(document.querySelectorAll(".bottom-nav button span")).map((n) => n.textContent))
      .toEqual(["오늘", "학습", "피드", "복습", "리포트"]);
    expect(Array.from(document.querySelectorAll(".desktop-side-menu button span")).map((n) => n.textContent))
      .toEqual(["오늘", "학습", "피드", "복습", "리포트"]);
  });

  it("Today -> Learn opens the current routine in the learning tab", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(screen.getByRole("button", { name: /학습 시작/ }));
    await waitFor(() => expect(document.getElementById("panel-learn")).toHaveClass("active"));
    // The morning content and its routine preset came across with the entry.
    expect(await screen.findByText("프로젝트 소개")).toBeInTheDocument();
    expect(screen.getByText("오늘 루틴")).toBeInTheDocument();
    expect(screen.getByText("출근 프리셋")).toBeInTheDocument();
  });

  it("Today -> Feed opens the feed tab with the tapped video selected", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    const card = await screen.findByRole("button", { name: new RegExp(`${feedVideo.title} 피드에서 보기`) });
    fireEvent.click(card);

    await waitFor(() => expect(document.getElementById("panel-feed")).toHaveClass("active"));
    // The video is first in the feed stream, so it is the one that plays.
    const firstCard = await waitFor(() => {
      const node = document.querySelector('#panel-feed [data-feed-index="0"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(within(firstCard).getByText(feedVideo.title)).toBeInTheDocument();
    expect(within(firstCard).getByRole("button", { name: /바로 학습/ })).toBeInTheDocument();
  });

  it("Feed -> Learn carries the same contentId", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`${feedVideo.title} 피드에서 보기`) }));
    await waitFor(() => expect(document.getElementById("panel-feed")).toHaveClass("active"));

    const feedPanel = document.getElementById("panel-feed") as HTMLElement;
    const firstCard = feedPanel.querySelector('[data-feed-index="0"]') as HTMLElement;
    fireEvent.click(within(firstCard).getByRole("button", { name: /바로 학습/ }));

    await waitFor(() => expect(document.getElementById("panel-learn")).toHaveClass("active"));
    expect(await screen.findByText(new RegExp(`피드 · ${feedVideo.channel_title}`))).toBeInTheDocument();
  });

  it("Today -> Review opens the review tab on today's queue", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    const strip = await waitFor(() => {
      const node = document.querySelector(".today-review-strip");
      expect(node?.querySelectorAll("dd").length).toBe(3);
      return node as HTMLElement;
    });
    fireEvent.click(within(strip).getByRole("button", { name: /복습 시작/ }));

    await waitFor(() => expect(document.getElementById("panel-review")).toHaveClass("active"));
    // ReviewView is loaded lazily, so wait for its sub-tabs to mount.
    expect(await screen.findByRole("tab", { name: /오늘의 복습/ })).toHaveAttribute("aria-selected", "true");
  });

  it("Today -> Review returns to today's queue even after the library was left open", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(document.getElementById("tab-review")!);
    fireEvent.click(await screen.findByRole("tab", { name: /내 보관함/ }));
    expect(screen.getByRole("tab", { name: /내 보관함/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(document.getElementById("tab-today")!);
    const strip = await waitFor(() => {
      const node = document.querySelector(".today-review-strip");
      expect(node?.querySelectorAll("dd").length).toBe(3);
      return node as HTMLElement;
    });
    fireEvent.click(within(strip).getByRole("button", { name: /복습 시작/ }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /오늘의 복습/ })).toHaveAttribute("aria-selected", "true")
    );
  });
});
