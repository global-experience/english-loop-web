"use client";

import { useEffect, useState } from "react";
import { isNativeAppRuntime } from "./nativeRuntime";

export type PlatformType = "ios" | "android" | "web";

export function useMobileUi() {
  const [mobile, setMobile] = useState(false);
  const [platform, setPlatform] = useState<PlatformType>("web");

  useEffect(() => {
    const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 767px)") : null;
    const capacitor = typeof window !== "undefined" ? (window as typeof window & {
      Capacitor?: {
        getPlatform?: () => string;
        isNativePlatform?: () => boolean;
      };
    }).Capacitor : undefined;

    const update = () => {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      setMobile(isNativeAppRuntime(capacitor, ua) || query?.matches === true);
      const capacitorPlatform = capacitor?.getPlatform?.();
      const isIPadOs = typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      if (capacitorPlatform === "ios" || (typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(ua)) || isIPadOs) {
        setPlatform("ios");
      } else if (capacitorPlatform === "android" || (typeof navigator !== "undefined" && /Android/i.test(ua))) {
        setPlatform("android");
      } else {
        setPlatform("web");
      }
    };

    update();
    query?.addEventListener?.("change", update);
    return () => query?.removeEventListener?.("change", update);
  }, []);

  return { mobile, platform };
}

export function usePortalReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === "undefined" || typeof document === "undefined") return;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    const root = document.documentElement;

    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      touchAction: body.style.touchAction,
    };

    const previousRootStyle = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };

    body.classList.add("modal-open");
    root.classList.add("modal-open");

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";

    return () => {
      body.classList.remove("modal-open");
      root.classList.remove("modal-open");

      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.right = previousBodyStyle.right;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      body.style.touchAction = previousBodyStyle.touchAction;

      root.style.overflow = previousRootStyle.overflow;
      root.style.overscrollBehavior = previousRootStyle.overscrollBehavior;

      if (window.scrollY !== scrollY) {
        window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      }
    };
  }, [locked]);
}
