import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { SPLASH_SESSION_KEY } from "@/components/AppSplash";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getApiBase: () => "http://localhost:8000",
}));

describe("LoginPage authentication redirect", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "/login" },
    });
  });

  it("redirects to / when user is already logged in", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/me") {
        return Promise.resolve({ id: "user-1", email: "test@example.com" });
      }
      return Promise.resolve({});
    });

    render(<LoginPage />);
    await waitFor(() => {
      expect(window.location.href).toBe("/");
    });
  });

  it("shows login form when user is not logged in", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/me") {
        return Promise.reject({ status: 401 });
      }
      return Promise.resolve({});
    });

    render(<LoginPage />);
    expect(await screen.findByRole("heading", { name: "나의 루프에 로그인" })).toBeInTheDocument();
  });
});

describe("LoginPage registration", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/me") {
        return Promise.reject({ status: 401 });
      }
      return Promise.resolve({});
    });
    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
  });

  it("validates password confirmation and submits a new account", async () => {
    render(<LoginPage />);
    expect(await screen.findByRole("heading", { name: "나의 루프에 로그인" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "회원가입" }));

    expect(screen.getByRole("heading", { name: "새 학습 루프 만들기" })).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toHaveValue("");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "새 학습자" } });
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("영어 수준"), { target: { value: "B2" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "SecurePass1" } });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "Different1" } });
    fireEvent.click(screen.getByRole("button", { name: /계정 만들기/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("비밀번호 확인이 일치하지 않습니다.");
    expect(apiFetchMock).not.toHaveBeenCalledWith("/api/auth/register", expect.anything());

    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.reject({ status: 401 });
      if (path === "/api/auth/register") return Promise.reject(new Error("이미 가입된 이메일입니다."));
      return Promise.resolve({});
    });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "SecurePass1" } });
    fireEvent.click(screen.getByRole("button", { name: /계정 만들기/ }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          display_name: "새 학습자",
          email: "new@example.com",
          password: "SecurePass1",
          english_level: "B2",
        }),
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");
  });
});

describe("App splash", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.reject({ status: 401 });
      return Promise.resolve({});
    });
    sessionStorage.removeItem(SPLASH_SESSION_KEY);
  });
  afterEach(() => vi.useRealTimers());

  it("shows an animated launch screen once per app session", async () => {
    vi.useFakeTimers();
    render(<LoginPage />);

    expect(screen.getByRole("status", { name: "Loopine 시작 화면" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("splash-active");
    expect(document.body).toHaveClass("splash-active");
    await act(async () => vi.advanceTimersByTime(1600));
    expect(screen.getByRole("heading", { name: "나의 루프에 로그인" })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("splash-active");
    expect(document.body).not.toHaveClass("splash-active");
    expect(sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe("true");
  });
});
