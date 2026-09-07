"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * 모바일 바텀시트를 손잡이(handle)로 끌어내려 닫는 제스처.
 *
 * 시트 CSS 는 `animation: translation-sheet-in ... both` 로 transform 을 점유하기 때문에
 * 인라인 transform 만으로는 움직이지 않는다. 그래서 드래그 중에는 `sheet-dragging`,
 * 되돌아가거나 닫히는 동안에는 `sheet-releasing` 클래스로 애니메이션을 끊어준다.
 * (learning.css 의 대응 규칙과 함께 동작한다.)
 */

const DEFAULT_CLOSE_DISTANCE = 110;
const DEFAULT_CLOSE_VELOCITY = 0.5; // px/ms
const FLICK_MIN_DISTANCE = 24;
const UPWARD_RESISTANCE = 4;
const RELEASE_MS = 260;

export type SheetDragHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  style: CSSProperties;
};

export type SheetDragResult = {
  /** 실제로 움직일 시트 요소(`<section>`)에 연결한다. */
  sheetRef: RefObject<HTMLElement | null>;
  /** 시트 className 에 그대로 이어 붙인다. 앞쪽 공백을 포함한다. */
  sheetClassName: string;
  dragging: boolean;
  handleProps: SheetDragHandleProps;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useSheetDragToClose({
  onClose,
  enabled = true,
  closeDistance = DEFAULT_CLOSE_DISTANCE,
  closeVelocity = DEFAULT_CLOSE_VELOCITY,
}: {
  onClose: () => void;
  enabled?: boolean;
  closeDistance?: number;
  closeVelocity?: number;
}): SheetDragResult {
  const sheetRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const drag = useRef({ pointerId: -1, startY: 0, lastY: 0, lastAt: 0, velocity: 0, offset: 0 });
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const paint = useCallback((offset: number) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const height = sheet.offsetHeight || 1;
    const progress = Math.min(Math.max(offset / height, 0), 1);
    sheet.style.transform = `translate3d(0, ${Math.round(offset)}px, 0)`;
    sheet.style.opacity = String(1 - progress * 0.35);
    sheet.parentElement?.style.setProperty("--sheet-drag-fade", String(1 - progress * 0.7));
  }, []);

  const reset = useCallback(() => {
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.opacity = "";
      sheet.parentElement?.style.removeProperty("--sheet-drag-fade");
    }
    drag.current.pointerId = -1;
    drag.current.offset = 0;
    closingRef.current = false;
    setDragging(false);
    setReleasing(false);
  }, []);

  // 다음 프레임까지 미룬 뒤 그려야 `sheet-releasing` 의 transition 이 실제로 걸린다.
  const paintAfterCommit = useCallback((offset: number) => {
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        paint(offset);
      });
    });
  }, [paint]);

  useEffect(() => clearPending, [clearPending]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || closingRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!sheetRef.current) return;
    clearPending();
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocity: 0,
      offset: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setReleasing(false);
    setDragging(true);
  }, [clearPending, enabled]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state.pointerId !== event.pointerId) return;
    const delta = event.clientY - state.startY;
    // 위로 끄는 동작은 고무줄처럼 저항을 준다.
    const offset = delta >= 0 ? delta : delta / UPWARD_RESISTANCE;
    const gap = event.timeStamp - state.lastAt;
    if (gap > 0) state.velocity = (event.clientY - state.lastY) / gap;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;
    state.offset = offset;
    paint(offset);
  }, [paint]);

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state.pointerId !== event.pointerId) return;
    const { offset, velocity } = state;
    state.pointerId = -1;
    setDragging(false);

    const sheet = sheetRef.current;
    const shouldClose =
      offset > closeDistance || (offset > FLICK_MIN_DISTANCE && velocity > closeVelocity);

    if (shouldClose) {
      closingRef.current = true;
      if (!sheet || prefersReducedMotion()) {
        reset();
        onClose();
        return;
      }
      setReleasing(true);
      paintAfterCommit(sheet.offsetHeight + 48);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        reset();
        onClose();
      }, RELEASE_MS);
      return;
    }

    if (offset === 0 || !sheet) {
      reset();
      return;
    }
    setReleasing(true);
    paintAfterCommit(0);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      reset();
    }, RELEASE_MS);
  }, [closeDistance, closeVelocity, onClose, paintAfterCommit, reset]);

  const sheetClassName = dragging ? " sheet-dragging" : releasing ? " sheet-releasing" : "";

  return {
    sheetRef,
    sheetClassName,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      style: { touchAction: "none" },
    },
  };
}
