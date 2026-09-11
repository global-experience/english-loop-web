import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SmartLocationSettings } from "@/components/SmartLocationSettings";
import { openNativePermissionSettings, requestNativeNotificationPermission, saveCurrentLocationAsPlace, saveSmartReminderSettings, syncNativeRoutineReminders } from "@/lib/nativeReminders";

vi.mock("@/lib/routines", () => ({
  fetchRoutines: vi.fn().mockResolvedValue({ plans: [], timezone: "Asia/Seoul" }),
}));

vi.mock("@/lib/nativeReminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nativeReminders")>();
  return {
    ...actual,
    configureSmartLocationMonitoring: vi.fn().mockResolvedValue(undefined),
    openNativePermissionSettings: vi.fn().mockResolvedValue(true),
    requestNativeNotificationPermission: vi.fn().mockResolvedValue("granted"),
    saveCurrentLocationAsPlace: vi.fn(),
    stopSmartLocationMonitoring: vi.fn().mockResolvedValue(undefined),
    syncNativeRoutineReminders: vi.fn().mockResolvedValue("scheduled"),
  };
});

type RuntimeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

describe("SmartLocationSettings accordion, edit popup, and delete confirmation popup", () => {
  beforeEach(() => {
    vi.mocked(syncNativeRoutineReminders).mockResolvedValue("scheduled");
    vi.mocked(openNativePermissionSettings).mockResolvedValue(true);
    vi.mocked(requestNativeNotificationPermission).mockResolvedValue("granted");
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

  it("requests notification permission first and activates automatically after the first place is saved", async () => {
    saveSmartReminderSettings({ enabled: false, places: {}, inside: {}, triggered: {} });
    vi.mocked(saveCurrentLocationAsPlace).mockResolvedValue({
      enabled: false,
      places: {
        "place-home": {
          id: "place-home",
          name: "집",
          radiusMeters: 500,
          latitude: 37.55,
          longitude: 126.92,
          createdAt: "2026-09-11T00:00:00.000Z",
          updatedAt: "2026-09-11T00:00:00.000Z",
        },
      },
      inside: {},
      triggered: {},
    });
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    fireEvent.click(screen.getByRole("button", { name: "사용하기" }));

    await waitFor(() => expect(requestNativeNotificationPermission).toHaveBeenCalledWith(true));
    expect(await screen.findByText("알림 권한을 확인했어요. 이제 알림에 사용할 장소를 추가해주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("장소 이름")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사용하기" })).toBeInTheDocument();
    expect(syncNativeRoutineReminders).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /현재 위치로 추가/ }));

    await waitFor(() => {
      expect(syncNativeRoutineReminders).toHaveBeenCalledWith(
        { plans: [], timezone: "Asia/Seoul" },
        { requestPermission: false },
      );
      expect(screen.getByRole("button", { name: "사용 중 · 끄기" })).toBeInTheDocument();
      expect(screen.getByText(/스마트 위치 알림도 바로 켰어요/)).toBeInTheDocument();
    });
  });

  it("shows a notification permission dialog and opens system settings after denial", async () => {
    vi.mocked(requestNativeNotificationPermission).mockResolvedValueOnce("denied");
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    fireEvent.click(screen.getByRole("button", { name: "사용하기" }));

    expect(await screen.findByRole("dialog", { name: "알림 권한이 필요해요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사용하기" })).toBeInTheDocument();
    expect(screen.getByText(/학습 루틴을 알려드리려면 Loopine 알림 권한/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "권한 요청" }));

    await waitFor(() => expect(openNativePermissionSettings).toHaveBeenCalledWith("notification"));
    expect(screen.queryByRole("dialog", { name: "알림 권한이 필요해요" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사용하기" })).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent("loopine:native-app-resumed"));
    await waitFor(() => {
      expect(syncNativeRoutineReminders).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "사용 중 · 끄기" })).toBeInTheDocument();
      expect(screen.getByText("권한을 확인했고 스마트 위치 알림을 다시 준비했어요.")).toBeInTheDocument();
    });
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

  it("opens add modal with default values ('집', 500m) and allows closing via cancel", async () => {
    window.scrollTo = vi.fn();
    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const addBtn = screen.getByRole("button", { name: "장소 추가" });
    fireEvent.click(addBtn);

    expect(screen.getByText("새 장소 추가")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("장소 이름");
    const radiusInput = screen.getByLabelText("감지 반경 (m)");
    expect(nameInput).toHaveValue("집");
    expect(radiusInput).toHaveValue(500);

    // Cancel closes the modal
    const cancelBtn = screen.getByRole("button", { name: "취소" });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText("새 장소 추가")).not.toBeInTheDocument();
  });

  it("selects NAME_PRESETS and RADIUS_PRESETS in add modal and saves current location", async () => {
    window.scrollTo = vi.fn();
    vi.mocked(saveCurrentLocationAsPlace).mockResolvedValue({
      enabled: false,
      places: {
        "place-gym": {
          id: "place-gym",
          name: "헬스장",
          addressLabel: "역삼동 피트니스",
          radiusMeters: 1000,
          latitude: 37.5,
          longitude: 127.04,
          createdAt: "2026-09-11T00:00:00.000Z",
          updatedAt: "2026-09-11T00:00:00.000Z",
        },
      },
      inside: {},
      triggered: {},
    });

    render(<SmartLocationSettings variant="full" payload={{ plans: [], timezone: "Asia/Seoul" }} />);

    const addBtn = screen.getByRole("button", { name: "장소 추가" });
    fireEvent.click(addBtn);

    expect(screen.getByText("새 장소 추가")).toBeInTheDocument();

    // Click "헬스장" preset chip
    const gymChip = screen.getByRole("button", { name: "헬스장" });
    fireEvent.click(gymChip);
    expect(screen.getByLabelText("장소 이름")).toHaveValue("헬스장");

    // Click "1000m" preset chip
    const radius1000Chip = screen.getByRole("button", { name: "1000m" });
    fireEvent.click(radius1000Chip);
    expect(screen.getByLabelText("감지 반경 (m)")).toHaveValue(1000);

    // Enter address memo
    const addressInput = screen.getByLabelText("주소 또는 메모 (선택)");
    fireEvent.change(addressInput, { target: { value: "역삼동 피트니스" } });

    // Submit with "현재 위치로 추가"
    const submitBtn = screen.getByRole("button", { name: /현재 위치로 추가/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveCurrentLocationAsPlace).toHaveBeenCalledWith({
        name: "헬스장",
        addressLabel: "역삼동 피트니스",
        radiusMeters: 1000,
      });
      expect(screen.queryByText("새 장소 추가")).not.toBeInTheDocument();
    });
  });
});

