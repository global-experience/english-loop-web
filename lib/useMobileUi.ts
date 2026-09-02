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
