"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

/**
 * 모바일 바텀시트를 손잡이(handle)로 끌어내려 닫는 제스처.
 *
 * 시트 CSS 는 `animation: translation-sheet-in ... both` 로 transform 을 점유하기 때문에
 * 인라인 transform 만으로는 움직이지 않는다. 그래서 한 번 잡은 시트에는
 * `sheet-interacted` 를 계속 붙여 등장 애니메이션을 영구히 꺼둔다.
 * (클래스를 떼면 애니메이션이 처음부터 다시 재생되어 깜박인다.)
 *
 * 손을 뗀 뒤의 처리는 프레임을 기다리지 않는다. React 렌더를 기다리면 그 사이
 * 시트가 멈춘 것처럼 보이고, 닫힌 뒤 스타일을 되돌리면 언마운트 전에 시트가
 * 제자리로 튀면서 배경이 다시 진해진다. 둘 다 눈에 보이는 결함이었다.
 */

const DEFAULT_CLOSE_DISTANCE = 110;
const DEFAULT_CLOSE_VELOCITY = 0.5; // px/ms
const FLICK_MIN_DISTANCE = 24;
const UPWARD_RESISTANCE = 4;
/** 제자리로 되돌아오는 시간(learning.css 의 .sheet-releasing 과 맞춘다). */
const SPRING_BACK_MS = 260;
/**
 * 닫힘은 남은 거리와 손을 뗀 속도로 시간을 정한다. 고정 길이로 하면
 * 시트가 화면을 벗어난 뒤에도 이징 꼬리와 스크림이 남아 "느리게 닫힌다"고 느껴진다.
 */
const CLOSE_MIN_MS = 60;
const CLOSE_MAX_MS = 110;
const CLOSE_MIN_SPEED = 4; // px/ms
/**
 * 이 정도로 짧으면 감속 곡선의 꼬리조차 지연으로 느껴진다. 거의 직선에 가깝게.
 */
const CLOSE_EASING = "cubic-bezier(.25, .55, .35, 1)";
/**
 * transition 이 완전히 끝나기 조금 전에 닫는다. 마지막 구간에서는 시트가 이미
 * 화면 밖 가까이 있고 스크림도 걷혀서, 여기서 언마운트해도 보이지 않는다.
 * 반대로 끝까지 기다리면 React 커밋 한 프레임이 더 붙어 지연으로 느껴진다.
 */
const CLOSE_SETTLE_LEAD_MS = 24;
const SCRIM_EASING = "cubic-bezier(.2, .8, .2, 1)";
/** 부모가 onClose 를 무시하는 예외 상황에서만 원위치로 되돌리기까지의 여유. */
const ORPHAN_RESTORE_MS = 420;
const SHEET_FADE = 0.35;
const BACKDROP_FADE = 0.7;

export type SheetDragHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  style: CSSProperties;
};

export type SheetDragResult = {
  /**
   * 실제로 움직일 시트 요소(`<section>`)에 연결한다. 콜백 ref 인 이유가 있다.
   * 시트 컴포넌트들은 닫힐 때 `null` 을 반환할 뿐 언마운트되지는 않으므로,
   * 요소가 떨어지는 시점에 훅 상태를 직접 되돌려야 다음 열기에서 다시 동작한다.
   */
  sheetRef: (node: HTMLElement | null) => void;
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
  const nodeRef = useRef<HTMLElement | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const drag = useRef({ pointerId: -1, startY: 0, lastY: 0, lastAt: 0, velocity: 0, offset: 0 });
  const closingRef = useRef(false);
  const cancelReleaseRef = useRef<(() => void) | null>(null);
  const orphanTimerRef = useRef(0);

  const clearPending = useCallback(() => {
    cancelReleaseRef.current?.();
    cancelReleaseRef.current = null;
    window.clearTimeout(orphanTimerRef.current);
    orphanTimerRef.current = 0;
  }, []);

  const setScrim = useCallback((sheet: HTMLElement, value: number) => {
    sheet.parentElement?.style.setProperty("--sheet-drag-fade", String(value));
  }, []);

  const paint = useCallback((offset: number) => {
    const sheet = nodeRef.current;
    if (!sheet) return;
    const height = sheet.offsetHeight || 1;
    const progress = Math.min(Math.max(offset / height, 0), 1);
    sheet.style.transform = `translate3d(0, ${Math.round(offset)}px, 0)`;
    sheet.style.opacity = String(1 - progress * SHEET_FADE);
    setScrim(sheet, 1 - progress * BACKDROP_FADE);
  }, [setScrim]);

  const restore = useCallback(() => {
    const sheet = nodeRef.current;
    if (sheet) {
      sheet.style.transform = "";
      sheet.style.opacity = "";
      sheet.style.removeProperty("transition");
      const layer = sheet.parentElement;
      layer?.style.removeProperty("--sheet-drag-fade");
      layer?.style.removeProperty("transition");
    }
    drag.current.pointerId = -1;
    drag.current.offset = 0;
    closingRef.current = false;
    setDragging(false);
    setReleasing(false);
  }, []);

  /**
   * 시트가 닫히면 `<section>` 은 사라지지만 컴포넌트(와 이 훅)는 살아남는다.
   * 여기서 상태를 되돌리지 않으면 `closingRef` 가 계속 true 로 남아
   * 두 번째로 열었을 때 드래그가 아예 시작되지 않는다.
   */
  const sheetRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) return;
    clearPending();
    drag.current.pointerId = -1;
    drag.current.offset = 0;
    closingRef.current = false;
    setDragging(false);
    setReleasing(false);
    setInteracted(false);
  }, [clearPending]);

  /**
   * 놓은 즉시 transition 을 시작한다. 클래스를 React 렌더에 맡기면 한두 프레임
   * 멈춘 뒤에 움직이기 시작해 손끝의 관성과 어긋난다. 그래서 클래스를 DOM 에
   * 직접 반영하고(다음 렌더가 같은 값을 쓰므로 충돌하지 않는다) 같은 태스크에서 그린다.
   */
  const runRelease = useCallback((
    sheet: HTMLElement,
    settleMs: number,
    draw: () => void,
    done: () => void,
  ) => {
    clearPending();
    let settled = false;
    let timer = 0;

    // 예정보다 일찍 끝난 경우(transition 중단 등)를 위한 안전망.
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === sheet && event.propertyName === "transform") settle();
    };
    const teardown = () => {
      sheet.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timer);
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      teardown();
      cancelReleaseRef.current = null;
      done();
    };

    sheet.addEventListener("transitionend", onTransitionEnd);
    timer = window.setTimeout(settle, settleMs);
    cancelReleaseRef.current = () => {
      settled = true;
      teardown();
    };

    sheet.classList.remove("sheet-dragging");
    sheet.classList.add("sheet-interacted", "sheet-releasing");
    void sheet.offsetHeight; // transition 이 걸린 상태를 기준선으로 삼도록 강제 반영
    draw();
  }, [clearPending]);

  useEffect(() => clearPending, [clearPending]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || closingRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const sheet = nodeRef.current;
    if (!sheet) return;
    clearPending();
    sheet.parentElement?.style.removeProperty("transition");
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocity: 0,
      offset: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteracted(true);
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

    const sheet = nodeRef.current;
    const shouldClose =
      offset > closeDistance || (offset > FLICK_MIN_DISTANCE && velocity > closeVelocity);

    if (!sheet) {
      restore();
      if (shouldClose) onClose();
      return;
    }

    if (shouldClose) {
      closingRef.current = true;
      if (prefersReducedMotion()) {
        onClose();
        return;
      }
      setReleasing(true);
      // 바닥에 붙어 있으므로 자기 높이만큼 내리면 화면에서 완전히 빠진다.
      const height = sheet.offsetHeight;
      const remaining = Math.max(height - offset, 1);
      const speed = Math.max(Math.abs(velocity), CLOSE_MIN_SPEED);
      const duration = Math.round(
        Math.min(Math.max(remaining / speed, CLOSE_MIN_MS), CLOSE_MAX_MS),
      );
      runRelease(
        sheet,
        Math.max(duration - CLOSE_SETTLE_LEAD_MS, 45),
        () => {
          // 스크림도 같은 길이로 함께 걷힌다. 시트만 나가고 배경이 남으면
          // 언마운트 순간 배경이 툭 사라져 보인다.
          const layer = sheet.parentElement;
          if (layer) layer.style.transition = `background-color ${duration}ms ${SCRIM_EASING}`;
          sheet.style.transition = `transform ${duration}ms ${CLOSE_EASING}, opacity ${duration}ms ease-out`;
          sheet.style.transform = `translate3d(0, ${height}px, 0)`;
          sheet.style.opacity = "0";
          setScrim(sheet, 0);
        },
        () => {
          // 인라인 스타일은 지우지 않는다. React 언마운트가 커밋되기 전에 지우면
          // 시트가 제자리로 튀고 배경이 다시 진해지는 프레임이 생긴다.
          onClose();
          orphanTimerRef.current = window.setTimeout(() => {
            orphanTimerRef.current = 0;
            if (nodeRef.current) restore();
          }, ORPHAN_RESTORE_MS);
        },
      );
      return;
    }

    if (offset === 0) {
      setReleasing(false);
      return;
    }
    setReleasing(true);
    runRelease(sheet, SPRING_BACK_MS, () => paint(0), restore);
  }, [closeDistance, closeVelocity, onClose, paint, restore, runRelease, setScrim]);

  const sheetClassName =
    (interacted ? " sheet-interacted" : "") +
    (dragging ? " sheet-dragging" : releasing ? " sheet-releasing" : "");

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
