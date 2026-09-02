import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { SPLASH_SESSION_KEY } from "@/components/AppSplash";
import { listeningActivity, today, user } from "./fixtures";
import { emptyQueueResponse, queueResponse, savedQueueItem } from "./review-fixtures";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getApiBase: () => "http://localhost:8000",
  mediaUrl: (path: string | null) => path,
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

const content = listeningActivity.content!;
const segment = content.segments[0];

/** The queue card points at the seeded content and its first transcript line. */
const queueForSeededContent = {
  ...queueResponse,
  summary: { ...queueResponse.summary, total_count: 1, counts: { ...queueResponse.summary.counts, SPEAK_AGAIN: 0, CORRECTION: 0 } },
  items: [{ ...savedQueueItem, content_id: content.id, transcript_line_id: segment.id, content_title: content.title }],
};

const completeCalls: string[] = [];

describe("Review round trips", () => {
  beforeEach(() => {
    completeCalls.length = 0;
    window.history.replaceState({}, "", "/");
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
      const value = String(path);
      if (value === "/api/me") return Promise.resolve(user);
      if (value === "/api/today") return Promise.resolve(today);
      if (value.startsWith("/api/review/queue")) return Promise.resolve(queueForSeededContent);
      if (value.startsWith("/api/review/contents") || value.startsWith("/api/review/library")) {
        return Promise.resolve({ items: [], total: 0, view: "recent", as_of: "", counts: { words: 0, sentences: 0 }, sources: [], levels: [] });
      }
      if (value === "/api/learning/sessions/complete") {
        completeCalls.push(String(init?.body));
        return Promise.resolve({ id: "result-1", completed_at: "" });
      }
      if (value === `/api/contents/${content.id}`) return Promise.resolve(content);
      return Promise.resolve({});
    });
  });

  it("keeps the sidebar order 오늘 / 학습 / 피드 / 복습 / 리포트", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");
    const labels = Array.from(document.querySelectorAll(".bottom-nav button span")).map((node) => node.textContent);
    expect(labels).toEqual(["오늘", "학습", "피드", "복습", "리포트"]);
    const desktopLabels = Array.from(document.querySelectorAll(".desktop-side-menu button span")).map((node) => node.textContent);
    expect(desktopLabels).toEqual(["오늘", "학습", "피드", "복습", "리포트"]);
  });

  it("goes Today -> Review and shows the queue", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(document.getElementById("tab-review")!);
    expect(document.getElementById("panel-review")).toHaveClass("active");
    expect(await screen.findByRole("button", { name: /복습 시작/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /영상별 기록/ })).toBeInTheDocument();
  });

  it("goes Learn -> Review after finishing a session", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(screen.getByRole("button", { name: "출근 듣기 열기" }));
    expect(await screen.findByText("프로젝트 소개")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /세션 종료/ }));
    fireEvent.click(await screen.findByRole("button", { name: /복습에 추가하고 보기/ }));

    await waitFor(() => expect(completeCalls).toHaveLength(1));
    await waitFor(() => expect(document.getElementById("panel-review")).toHaveClass("active"));
    expect(await screen.findByRole("button", { name: /복습 시작/ })).toBeInTheDocument();
  });

  it("goes Review -> Learn and restores the same content and transcript line", async () => {
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(document.getElementById("tab-review")!);
    fireEvent.click(await screen.findByRole("button", { name: /복습 시작/ }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${content.title}에서 이어 학습`) }));

    await waitFor(() => expect(document.getElementById("panel-learn")).toHaveClass("active"));
    expect(await screen.findByText("복습 · 저장 표현")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: segment.english_text })).toBeInTheDocument();
  });

  it("returns to Review from Learn without losing the review tab state", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      const value = String(path);
      if (value === "/api/me") return Promise.resolve(user);
      if (value === "/api/today") return Promise.resolve(today);
      if (value.startsWith("/api/review/queue")) return Promise.resolve(emptyQueueResponse);
      if (value.startsWith("/api/review/contents") || value.startsWith("/api/review/library")) {
        return Promise.resolve({ items: [], total: 0, view: "recent", as_of: "", counts: { words: 0, sentences: 0 }, sources: [], levels: [] });
      }
      return Promise.resolve({});
    });
    render(<Home />);
    await screen.findByText("오늘의 루틴");

    fireEvent.click(document.getElementById("tab-review")!);
    expect(await screen.findByText("예정된 복습을 마쳤어요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /내 보관함/ }));
    expect(await screen.findByRole("tab", { name: /찜한 영상/ })).toBeInTheDocument();

    fireEvent.click(document.getElementById("tab-learn")!);
    expect(document.getElementById("panel-learn")).toHaveClass("active");

    fireEvent.click(document.getElementById("tab-review")!);
    expect(document.getElementById("panel-review")).toHaveClass("active");
    // The library sub-tab the learner left open is still selected.
    expect(screen.getByRole("tab", { name: /내 보관함/ })).toHaveAttribute("aria-selected", "true");
  });
});
