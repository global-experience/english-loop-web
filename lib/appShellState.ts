"use client";

import type { LearningMode } from "@/components/LearningView";
import type { TodayData, User } from "@/lib/types";

export type AppTab = "today" | "feed" | "learn" | "review" | "report" | "settings";

export type AppShellSnapshot = {
  activeTab: AppTab;
  visitedTabs: AppTab[];
  learningMode: LearningMode;
  scrollPositions: Partial<Record<AppTab, number>>;
  savedAt: number;
};

export type BootstrapSnapshot = {
  user: User;
  today: TodayData;
  savedAt: number;
};

export const APP_TABS: AppTab[] = ["today", "learn", "feed", "review", "report", "settings"];
const APP_SHELL_KEY = "loopine:app-shell:v1";
const BOOTSTRAP_KEY = "loopine:bootstrap:v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function isAppTab(value: unknown): value is AppTab {
  return typeof value === "string" && APP_TABS.includes(value as AppTab);
}

export function requestIdleWork(callback: () => void, timeout = 1200) {
  if (typeof window === "undefined") return;
  const idleCallback = window.requestIdleCallback;
  if (idleCallback) {
    idleCallback(callback, { timeout });
    return;
  }
  window.setTimeout(callback, Math.min(timeout, 250));
}

export function readAppShellSnapshot(): AppShellSnapshot | null {
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.removeItem(APP_SHELL_KEY);
      window.sessionStorage?.removeItem(APP_SHELL_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
  return null;
}

export function saveAppShellSnapshot(_snapshot: AppShellSnapshot) {
  // Tab/scroll state is preserved in React memory during the active session only,
  // and resets to the Today tab upon page reload/refresh as requested.
}

export function readBootstrapSnapshot(): BootstrapSnapshot | null {
  if (!canUseStorage()) return null;
  try {
    window.localStorage?.removeItem(BOOTSTRAP_KEY);
    const raw = window.sessionStorage.getItem(BOOTSTRAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootstrapSnapshot;
    if (!parsed.user?.id || !parsed.today?.study_date) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBootstrapSnapshot(user: User, today: TodayData) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify({ user, today, savedAt: Date.now() }));
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

export function emitTabVisibility(tab: AppTab, active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("loopine:tab-visibility", { detail: { tab, active } }));
}
