"use client";

import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/api";
import { isNativeAppRuntime, type CapacitorRuntime } from "@/lib/nativeRuntime";

export const SPLASH_SESSION_KEY = "loopine:splash:shown";
const SPLASH_DURATION_MS = 1250;
const FADE_DURATION_MS = 250;

function checkShouldSkipSplash(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
  const ua = navigator.userAgent;
  if (isNativeAppRuntime(capacitor, ua)) {
    return true;
  }
  const pathname = window.location?.pathname || "";
  const pathSegment = pathname.replace(/^\/|\/$/g, "").split("/")[0] || "";
  const isDirectTab = ["settings", "report", "learn", "feed", "review"].includes(pathSegment);
  if (isDirectTab) return true;

  try {
    if (sessionStorage.getItem(SPLASH_SESSION_KEY) === "true") {
      return true;
    }
  } catch {}
  return false;
}

export function useAppSplash() {
  const [state, setState] = useState({ ready: false, visible: true, fadingOut: false });

  useEffect(() => {
    const apiBase = getApiBase();
    if (typeof fetch === "function") {
      // 실제 앱 실행과 동시에 Render Free를 깨운다. 화면 전환은 이 요청을 기다리지 않는다.
      void fetch(`${apiBase}/health`, { cache: "no-store", credentials: "omit" }).catch(() => undefined);
    }

    if (checkShouldSkipSplash()) {
      setState({ ready: true, visible: false, fadingOut: false });
      return;
    }

    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    } catch {
      // The splash can still run when session storage is unavailable.
    }

    setState({ ready: true, visible: true, fadingOut: false });

    // 1단계: 페이드아웃 시작
    const fadeTimer = window.setTimeout(() => {
      setState((prev) => ({ ...prev, fadingOut: true }));
    }, SPLASH_DURATION_MS);

    // 2단계: DOM 완전 언마운트
    const hideTimer = window.setTimeout(() => {
      setState({ ready: true, visible: false, fadingOut: false });
    }, SPLASH_DURATION_MS + FADE_DURATION_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return state;
}

export function AppSplash({ fadingOut = false }: { fadingOut?: boolean }) {
  useEffect(() => {
    document.documentElement.classList.add("splash-active");
    document.body.classList.add("splash-active");
    return () => {
      document.documentElement.classList.remove("splash-active");
      document.body.classList.remove("splash-active");
    };
  }, []);

  return (
    <main className={`splash-page ${fadingOut ? "fading-out" : ""}`} role="status" aria-label="Loopine 시작 화면">
      <div className="splash-orbit splash-orbit-outer" aria-hidden="true" />
      <div className="splash-orbit splash-orbit-inner" aria-hidden="true" />
      <div className="splash-center">
        <img className="splash-logo" src="/icons/loopine-logo.svg" alt="" aria-hidden="true" />
        <p className="eyebrow">CLOSED LEARNING LOOP</p>
        <h1>Loopine</h1>
        <p>들은 영어를, 내 말로.</p>
      </div>
      <div className="splash-loader" aria-hidden="true"><span /></div>
    </main>
  );
}
