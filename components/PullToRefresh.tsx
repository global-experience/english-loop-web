"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { isNativeAppRuntime } from "@/lib/nativeRuntime";
import { triggerHapticImpact, triggerHapticSelection } from "@/lib/haptics";

type PullToRefreshProps = {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  activeTab?: string;
  disabled?: boolean;
};

const PULL_THRESHOLD = 60; // 임계값 (px)
const MAX_PULL = 80; // 최대 내려오는 거리 (px)
const DAMPING = 0.42; // 고무줄 저항 계수

export function PullToRefresh({ children, onRefresh, activeTab, disabled = false }: PullToRefreshProps) {
  const [isNative, setIsNative] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [willRefresh, setWillRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const willRefreshRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const hapticTriggeredRef = useRef(false);

  // 오로지 Capacitor 네이티브 앱 환경인지 확인
  useEffect(() => {
    if (typeof window === "undefined") return;
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setIsNative(isNativeAppRuntime(capacitor, ua));
  }, []);

  // 최상단 스크롤 상태 검사
  const isAtTop = useCallback(() => {
    if (typeof window === "undefined") return false;

    // 피드 탭일 경우 내부의 .feed-stream 스크롤 상태 확인
    if (activeTab === "feed") {
      const feedStream = document.querySelector(".feed-stream");
      if (feedStream) {
        return feedStream.scrollTop <= 1;
      }
    }

    // 일반 탭일 경우 윈도우 스크롤 상태 확인
    return window.scrollY <= 1 && document.documentElement.scrollTop <= 1;
  }, [activeTab]);

  useEffect(() => {
    // 오로지 Capacitor 네이티브 앱 환경에서만 이벤트 리스너를 등록
    if (!isNative || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      if (e.touches.length !== 1) return;

      if (isAtTop()) {
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX;
        isPullingRef.current = false;
        willRefreshRef.current = false;
        hapticTriggeredRef.current = false;
      } else {
        startYRef.current = 0;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      if (startYRef.current === 0) return;
      if (e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - startYRef.current;
      const deltaX = currentX - startXRef.current;

      // 위로 스크롤하거나 가로 스와이프인 경우 무시
      if (deltaY <= 0) {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          setPullDistance(0);
          setWillRefresh(false);
        }
        return;
      }

      // 세로 스와이프 우선 판별 (가로 제스처와 충돌 방지)
      if (Math.abs(deltaX) > deltaY * 0.8 && !isPullingRef.current) {
        startYRef.current = 0;
        return;
      }

      // 최상단에서 아래로 당기기 시작
      if (isAtTop()) {
        isPullingRef.current = true;
        const distance = Math.min(MAX_PULL, deltaY * DAMPING);
        setPullDistance(distance);

        const shouldTrigger = distance >= PULL_THRESHOLD;
        if (shouldTrigger !== willRefreshRef.current) {
          willRefreshRef.current = shouldTrigger;
          setWillRefresh(shouldTrigger);

          if (shouldTrigger && !hapticTriggeredRef.current) {
            hapticTriggeredRef.current = true;
            void triggerHapticSelection();
          } else if (!shouldTrigger) {
            hapticTriggeredRef.current = false;
          }
        }

        // 제스처 활성화 시 기본 터치 바운스 간섭 방지
        if (e.cancelable && distance > 5) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current || isRefreshingRef.current) {
        startYRef.current = 0;
        isPullingRef.current = false;
        return;
      }

      isPullingRef.current = false;
      startYRef.current = 0;

      if (willRefreshRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(48); // 로딩 중 고정 인디케이터 높이
        void triggerHapticImpact("light");

        try {
          await onRefresh();
        } catch {
          // ignore
        } finally {
          // 자연스러운 수납 애니메이션
          setTimeout(() => {
            setPullDistance(0);
            setTimeout(() => {
              isRefreshingRef.current = false;
              setIsRefreshing(false);
              setWillRefresh(false);
              willRefreshRef.current = false;
              hapticTriggeredRef.current = false;
            }, 240);
          }, 200);
        }
      } else {
        setPullDistance(0);
        setWillRefresh(false);
        willRefreshRef.current = false;
        hapticTriggeredRef.current = false;
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [disabled, isAtTop, isNative, onRefresh]);

  // Capacitor 네이티브 앱이 아닌 일반 브라우저/PWA 환경에서는 UI 및 제스처 전혀 노출하지 않음
  if (!isNative) {
    return <>{children}</>;
  }

  const isVisible = pullDistance > 0 || isRefreshing;
  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <>
      <div
        className={`ptr-indicator-pill ${isVisible ? "visible" : ""} ${isRefreshing ? "refreshing" : ""} ${willRefresh ? "ready" : ""}`}
        style={{
          transform: `translateX(-50%) translateY(${pullDistance > 0 ? pullDistance : -60}px)`,
          opacity: isVisible ? (isRefreshing ? 1 : Math.max(0.2, progress)) : 0,
        }}
        aria-hidden="true"
      >
        <div className="ptr-pill-content">
          {isRefreshing ? (
            <>
              <LoaderCircle size={15} className="spin" />
              <span>새로고침 중...</span>
            </>
          ) : (
            <>
              <ArrowDown
                size={15}
                style={{
                  transform: `rotate(${willRefresh ? 180 : Math.min(180, progress * 180)}deg)`,
                  transition: isPullingRef.current ? "none" : "transform 0.2s ease",
                }}
              />
              <span>{willRefresh ? "놓아서 새로고침" : "당겨서 새로고침"}</span>
            </>
          )}
        </div>
      </div>
      {children}
    </>
  );
}
