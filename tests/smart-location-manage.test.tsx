import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SmartLocationSettings } from "@/components/SmartLocationSettings";
import { saveSmartReminderSettings } from "@/lib/nativeReminders";

vi.mock("@/lib/routines", () => ({
  fetchRoutines: vi.fn().mockResolvedValue({ plans: [], timezone: "Asia/Seoul" }),
}));

vi.mock("@/lib/nativeReminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nativeReminders")>();
  return {
    ...actual,
    configureSmartLocationMonitoring: vi.fn().mockResolvedValue(undefined),
    stopSmartLocationMonitoring: vi.fn().mockResolvedValue(undefined),
    syncNativeRoutineReminders: vi.fn().mockResolvedValue("scheduled"),
  };
});

type RuntimeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

describe("SmartLocationSettings accordion, edit popup, and delete confirmation popup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    (window as RuntimeWindow).Capacitor = { isNativePlatform: () => true };
    saveSmartReminderSettings({
      enabled: false,
      places: {
        "place-home": {
          id: "place-home",
          name: "집",
          addressLabel: "서울특별시 마포구",
          radiusMeters: 500,
          latitude: 37.55,
          longitude: 126.92,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        "place-work": {
          id: "place-work",
          name: "회사",
          addressLabel: "성수동 사무실",
          radiusMeters: 300,
          latitude: 37.54,
          longitude: 127.05,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
      inside: {},
      triggered: {},
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as RuntimeWindow).Capacitor;
  });

  it("toggles accordion with smooth animation classes", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const summaryButton = screen.getByRole("button", { name: /출퇴근 위치로 알림 받기/ });
    expect(summaryButton).toHaveAttribute("aria-expanded", "true");

    const collapseContainer = document.querySelector(".smart-location-accordion-collapse");
    expect(collapseContainer).toHaveClass("expanded");

    // Click to collapse
    fireEvent.click(summaryButton);
    expect(summaryButton).toHaveAttribute("aria-expanded", "false");
    expect(collapseContainer).not.toHaveClass("expanded");

    // Click to expand again
    fireEvent.click(summaryButton);
    expect(summaryButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseContainer).toHaveClass("expanded");
  });

  it("opens delete confirmation popup on delete click, allows cancel", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    expect(screen.getByText("집")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: "집 삭제" });
    fireEvent.click(deleteBtn);

    // Delete popup is displayed
    expect(screen.getByText("‘집’ 장소를 삭제할까요?")).toBeInTheDocument();
    expect(screen.getByText("이 장소를 사용하는 루틴은 시간 알림으로만 동작할 수 있어요.")).toBeInTheDocument();

    // Click cancel
    const cancelBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelBtn);

    // Popup closed, place still exists
    expect(screen.queryByText("‘집’ 장소를 삭제할까요?")).not.toBeInTheDocument();
    expect(screen.getByText("집")).toBeInTheDocument();
  });

  it("deletes place when confirmed in delete popup", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const deleteBtn = screen.getByRole("button", { name: "집 삭제" });
    fireEvent.click(deleteBtn);

    // Delete popup confirm button
    const confirmBtn = screen.getByRole("button", { name: "삭제" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("‘집’ 장소를 삭제할까요?")).not.toBeInTheDocument();
      expect(screen.queryByText("서울특별시 마포구")).not.toBeInTheDocument();
      expect(screen.getByText("집 장소를 삭제했어요.")).toBeInTheDocument();
    });
  });

  it("opens edit popup when clicking modify button and saves changes", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const editBtn = screen.getByRole("button", { name: "집 수정" });
    fireEvent.click(editBtn);

    // Edit modal appears
    expect(screen.getByText("‘집’ 장소 수정")).toBeInTheDocument();

    const nameInput = screen.getByLabelText("장소 이름");
    const addressInput = screen.getByLabelText("주소 또는 메모 (선택)");
    const radiusInput = screen.getByLabelText("감지 반경 (m)");

    expect(nameInput).toHaveValue("집");
    expect(addressInput).toHaveValue("서울특별시 마포구");
    expect(radiusInput).toHaveValue(500);

    // Update inputs
    fireEvent.change(nameInput, { target: { value: "우리집" } });
    fireEvent.change(addressInput, { target: { value: "합정역 근처" } });
    fireEvent.change(radiusInput, { target: { value: 300 } });

    // Save
    const saveBtn = screen.getByRole("button", { name: "저장" });
    fireEvent.click(saveBtn);

    // Modal closed and card updated
    await waitFor(() => {
      expect(screen.queryByText("‘집’ 장소 수정")).not.toBeInTheDocument();
      const updatedCard = screen.getByText("우리집").closest("article");
      expect(updatedCard).not.toBeNull();
      expect(updatedCard).toHaveTextContent("합정역 근처");
      expect(updatedCard).toHaveTextContent("반경 300m");
    });
  });

  it("allows selecting preset chips in edit popup and cancels without saving", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const editBtn = screen.getByRole("button", { name: "집 수정" });
    fireEvent.click(editBtn);

    expect(screen.getByText("‘집’ 장소 수정")).toBeInTheDocument();

    // Click preset chip "헬스장"
    const gymChip = screen.getByRole("button", { name: "헬스장" });
    fireEvent.click(gymChip);

    const nameInput = screen.getByLabelText("장소 이름");
    expect(nameInput).toHaveValue("헬스장");

    // Click cancel
    const cancelBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelBtn);

    // Unsaved changes discarded, original "집" remains
    expect(screen.queryByText("‘집’ 장소 수정")).not.toBeInTheDocument();
    expect(screen.getByText("집")).toBeInTheDocument();
    expect(screen.queryByText("헬스장")).not.toBeInTheDocument();
  });

  it("allows deleting place from inside the edit popup", async () => {
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const editBtn = screen.getByRole("button", { name: "회사 수정" });
    fireEvent.click(editBtn);

    expect(screen.getByText("‘회사’ 장소 수정")).toBeInTheDocument();

    // Click delete trigger inside edit modal
    const modalDeleteBtn = screen.getByRole("button", { name: "장소 삭제" });
    fireEvent.click(modalDeleteBtn);

    // Edit modal closes and delete confirmation appears
    expect(screen.queryByText("‘회사’ 장소 수정")).not.toBeInTheDocument();
    expect(screen.getByText("‘회사’ 장소를 삭제할까요?")).toBeInTheDocument();

    // Confirm delete
    const confirmDeleteBtn = screen.getByRole("button", { name: "삭제" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByText("‘회사’ 장소를 삭제할까요?")).not.toBeInTheDocument();
      expect(screen.queryByText("성수동 사무실")).not.toBeInTheDocument();
      expect(screen.getByText("회사 장소를 삭제했어요.")).toBeInTheDocument();
    });
  });

  it("keeps teaser visible during current routine page visit when enabled, and hides on re-entry", async () => {
    // Initial mount: teaser is shown because enabled is false
    const { unmount } = render(
      <SmartLocationSettings variant="teaser" payload={{ plans: [], timezone: "Asia/Seoul" }} />
    );

    expect(screen.getByText("출퇴근 위치로 알림 받기")).toBeInTheDocument();
    const toggleBtn = screen.getByRole("button", { name: "사용하기" });
    fireEvent.click(toggleBtn);

    // After clicking '사용하기', it should NOT vanish immediately!
    await waitFor(() => {
      expect(screen.getByText("사용 중 · 끄기")).toBeInTheDocument();
      expect(screen.getByText("집")).toBeInTheDocument();
      expect(screen.getByText("회사")).toBeInTheDocument();
    });

    // Simulate navigating away from Routine page (unmounting)
    unmount();

    // Simulate navigating back to Routine page later (fresh mount when enabled is already true)
    render(
      <SmartLocationSettings variant="teaser" payload={{ plans: [], timezone: "Asia/Seoul" }} />
    );

    // Now it should be hidden on re-entry
    expect(screen.queryByText("출퇴근 위치로 알림 받기")).not.toBeInTheDocument();
    expect(document.querySelector(".smart-location-settings")).not.toBeInTheDocument();
  });

  it("locks body scroll when modal is open and updates title animation classes", async () => {
    // Provide dummy scrollTo for jsdom
    window.scrollTo = vi.fn();

    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    // Initially disabled, title has 'disabled' class and no badge
    const titleEl = screen.getByText("출퇴근 위치로 알림 받기");
    expect(titleEl).toHaveClass("smart-location-title", "disabled");
    expect(document.querySelector(".smart-location-active-badge")).not.toBeInTheDocument();

    // Body scroll is not locked initially
    expect(document.body.style.position).not.toBe("fixed");

    // Click edit button -> Edit modal opens
    const editBtn = screen.getByRole("button", { name: "집 수정" });
    fireEvent.click(editBtn);

    // Body scroll locked
    expect(document.body.style.position).toBe("fixed");
    expect(document.body).toHaveClass("modal-open");

    // Close edit modal
    const cancelBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelBtn);

    // Body scroll restored
    expect(document.body.style.position).not.toBe("fixed");

    // Click delete button -> Delete modal opens
    const deleteBtn = screen.getByRole("button", { name: "집 삭제" });
    fireEvent.click(deleteBtn);

    // Body scroll locked again
    expect(document.body.style.position).toBe("fixed");

    // Close delete modal
    const cancelDeleteBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelDeleteBtn);

    // Body scroll restored
    expect(document.body.style.position).not.toBe("fixed");

    // Click '사용하기' -> Title updates to enabled with active badge
    const toggleBtn = screen.getByRole("button", { name: "사용하기" });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      const activeTitle = screen.getByText("스마트 위치 알림 사용 중");
      expect(activeTitle).toHaveClass("smart-location-title", "enabled");
      expect(document.querySelector(".smart-location-active-badge")).toBeInTheDocument();
    });
  });
});
