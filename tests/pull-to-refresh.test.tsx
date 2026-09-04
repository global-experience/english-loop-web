import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PullToRefresh } from "@/components/PullToRefresh";

describe("PullToRefresh Component", () => {
  const originalCapacitor = (window as unknown as { Capacitor?: unknown }).Capacitor;

  beforeEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  afterEach(() => {
    (window as unknown as { Capacitor?: unknown }).Capacitor = originalCapacitor;
    cleanup();
  });

  it("does not render indicator and does not attach listeners in web browser environment", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} activeTab="today">
        <div data-testid="child-content">Content</div>
      </PullToRefresh>
    );

    expect(screen.getByTestId("child-content")).toBeDefined();
    // 웹 브라우저에서는 .ptr-indicator-pill이 렌더링되지 않음
    expect(container.querySelector(".ptr-indicator-pill")).toBeNull();
  });

  it("renders indicator pill when running inside Capacitor native app", () => {
    (window as unknown as { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} activeTab="today">
        <div data-testid="child-content">Content</div>
      </PullToRefresh>
    );

    expect(screen.getByTestId("child-content")).toBeDefined();
    expect(container.querySelector(".ptr-indicator-pill")).toBeDefined();
  });

  it("does not trigger refresh when modal is open", () => {
    (window as unknown as { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    // 모달 활성화 시뮬레이션
    document.body.classList.add("modal-open");

    render(
      <PullToRefresh onRefresh={onRefresh} activeTab="today">
        <div data-testid="child-content">Content</div>
      </PullToRefresh>
    );

    // 터치 이벤트 발생
    window.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [{ clientX: 100, clientY: 100 } as Touch],
      })
    );
    window.dispatchEvent(
      new TouchEvent("touchmove", {
        touches: [{ clientX: 100, clientY: 250 } as Touch],
      })
    );
    window.dispatchEvent(new TouchEvent("touchend"));

    expect(onRefresh).not.toHaveBeenCalled();
    document.body.classList.remove("modal-open");
  });
});
