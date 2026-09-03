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

let globalScrollLockCount = 0;
let savedScrollY = 0;

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === "undefined" || typeof document === "undefined") return;

    const body = document.body;
    const root = document.documentElement;

    if (globalScrollLockCount === 0) {
      savedScrollY = typeof window !== "undefined" ? (window.scrollY || window.pageYOffset || 0) : 0;
      body.classList.add("modal-open");
      root.classList.add("modal-open", "translation-sheet-open");
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
    }

    globalScrollLockCount++;

    return () => {
      globalScrollLockCount = Math.max(0, globalScrollLockCount - 1);

      if (globalScrollLockCount === 0) {
        body.classList.remove("modal-open");
        root.classList.remove("modal-open", "translation-sheet-open");

        body.style.removeProperty("position");
        body.style.removeProperty("top");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("touch-action");

        root.style.removeProperty("overflow");
        root.style.removeProperty("overscroll-behavior");

        try {
          if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
            const previousScrollBehavior = root.style.scrollBehavior;
            root.style.scrollBehavior = "auto";
            window.scrollTo({ top: savedScrollY, left: 0, behavior: "instant" as ScrollBehavior });
            root.style.scrollBehavior = previousScrollBehavior;
          }
        } catch {
          /* ignore jsdom unimplemented warnings */
        }
      }
    };
  }, [locked]);
}
