import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsView, SettingsSkeleton } from "@/components/SettingsView";
import { apiFetch } from "@/lib/api";
import { user } from "./fixtures";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("SettingsView Skeleton & Loading State", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
  });

  it("renders SettingsSkeleton when user is null", () => {
    render(<SettingsView user={null} onSaved={vi.fn()} />);

    expect(screen.getByRole("status", { name: "설정을 불러오는 중입니다" })).toBeInTheDocument();
    expect(screen.getByText("설정을 불러오는 중입니다…")).toBeInTheDocument();
    expect(document.querySelectorAll(".settings-form-skeleton section").length).toBe(4);
    expect(document.querySelector(".settings-tools-skeleton")).toBeInTheDocument();
  });

  it("renders SettingsSkeleton when loading prop is true even if user exists", () => {
    render(<SettingsView user={user} onSaved={vi.fn()} loading={true} />);

    expect(screen.getByRole("status", { name: "설정을 불러오는 중입니다" })).toBeInTheDocument();
    expect(document.querySelectorAll(".settings-form-skeleton section").length).toBe(4);
  });

  it("renders actual settings form when user is present and not loading", () => {
    render(<SettingsView user={user} onSaved={vi.fn()} loading={false} />);

    expect(screen.queryByRole("status", { name: "설정을 불러오는 중입니다" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(user.display_name)).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /설정 저장/ })).toBeInTheDocument();
  });

  it("responds to loopine:pull-refresh event on settings tab", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<SettingsView user={user} onSaved={onSaved} />);

    const done = vi.fn();
    window.dispatchEvent(
      new CustomEvent("loopine:pull-refresh", {
        detail: { tab: "settings", done },
      })
    );

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores loopine:pull-refresh for other tabs", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<SettingsView user={user} onSaved={onSaved} />);

    const done = vi.fn();
    window.dispatchEvent(
      new CustomEvent("loopine:pull-refresh", {
        detail: { tab: "report", done },
      })
    );

    expect(onSaved).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it("fetches /api/me when user is null, showing skeleton and then transitioning to loaded form", async () => {
    let resolveUser: (u: typeof user) => void = () => {};
    vi.mocked(apiFetch).mockImplementation(() => new Promise((res) => {
      resolveUser = res as unknown as (u: typeof user) => void;
    }));

    render(<SettingsView user={null} onSaved={vi.fn()} />);

    expect(screen.getByRole("status", { name: "설정을 불러오는 중입니다" })).toBeInTheDocument();

    resolveUser(user);

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "설정을 불러오는 중입니다" })).not.toBeInTheDocument();
      expect(screen.getByDisplayValue(user.display_name)).toBeInTheDocument();
    });
  });
});
