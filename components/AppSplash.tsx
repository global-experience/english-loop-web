"use client";

import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/api";

export const SPLASH_SESSION_KEY = "loopine:splash:shown";
const SPLASH_DURATION_MS = 1500;

export function useAppSplash() {
  const [state, setState] = useState({ ready: false, visible: true });

  useEffect(() => {
    const apiBase = getApiBase();
    if (typeof fetch === "function") {
      // 실제 앱 실행과 동시에 Render Free를 깨운다. 화면 전환은 이 요청을 기다리지 않는다.
      void fetch(`${apiBase}/health`, { cache: "no-store", credentials: "omit" }).catch(() => undefined);
    }
    try {
      if (sessionStorage.getItem(SPLASH_SESSION_KEY) === "true") {
        setState({ ready: true, visible: false });
        return;
      }
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    } catch {
      // The splash can still run when session storage is unavailable.
    }

    setState({ ready: true, visible: true });
    const timer = window.setTimeout(() => setState({ ready: true, visible: false }), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return state;
}

export function AppSplash() {
  useEffect(() => {
    document.documentElement.classList.add("splash-active");
    document.body.classList.add("splash-active");
    return () => {
      document.documentElement.classList.remove("splash-active");
      document.body.classList.remove("splash-active");
    };
  }, []);

  return (
    <main className="splash-page" role="status" aria-label="Loopine 시작 화면">
      <div className="splash-orbit splash-orbit-outer" aria-hidden="true"/>
      <div className="splash-orbit splash-orbit-inner" aria-hidden="true"/>
      <div className="splash-center">
        <div className="splash-logo" aria-hidden="true"><span>EL</span></div>
        <p className="eyebrow">CLOSED LEARNING LOOP</p>
        <h1>Loopine</h1>
        <p>들은 영어를, 내 말로.</p>
      </div>
      <div className="splash-loader" aria-hidden="true"><span/></div>
    </main>
  );
}
