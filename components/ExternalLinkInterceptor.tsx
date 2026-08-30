"use client";

import { useEffect } from "react";
import { isNativeAppRuntime } from "@/lib/nativeRuntime";
import { openExternalUrl } from "@/lib/openExternal";

/**
 * Intercepts external link clicks when running inside native app shell (Capacitor),
 * routing them to In-App Browser (@capacitor/browser) so the user never exits the mobile app.
 */
export function ExternalLinkInterceptor() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isNative = isNativeAppRuntime(capacitor, navigator.userAgent);

    if (!isNative) return;

    const handleGlobalClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (!target || !target.href) return;

      const isExternal =
        target.target === "_blank" ||
        (!target.href.startsWith("javascript:") && !target.href.startsWith(window.location.origin));

      if (isExternal) {
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(target.href);
      }
    };

    document.addEventListener("click", handleGlobalClick, true);
    return () => document.removeEventListener("click", handleGlobalClick, true);
  }, []);

  return null;
}
