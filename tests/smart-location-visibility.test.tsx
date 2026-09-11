import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SmartLocationSettings } from "@/components/SmartLocationSettings";

vi.mock("@/lib/routines", () => ({
  fetchRoutines: vi.fn().mockRejectedValue(new Error("not needed by this test")),
}));

type RuntimeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

describe("SmartLocationSettings platform visibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as RuntimeWindow).Capacitor;
  });

  afterEach(() => {
    cleanup();
    delete (window as RuntimeWindow).Capacitor;
  });

  it("does not expose geofencing controls in desktop, mobile web, or PWA runtimes", async () => {
    render(<SmartLocationSettings variant="full" />);

    await waitFor(() => {
      expect(screen.queryByText("출퇴근 위치로 알림 받기")).not.toBeInTheDocument();
      expect(document.querySelector(".smart-location-settings")).not.toBeInTheDocument();
    });
  });

  it("shows geofencing controls inside the Capacitor native shell", async () => {
    (window as RuntimeWindow).Capacitor = { isNativePlatform: () => true };
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    expect(await screen.findByText("출퇴근 위치로 알림 받기")).toBeInTheDocument();
    expect(document.querySelector(".smart-location-settings")).toBeInTheDocument();
  });
});
