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
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(APP_SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppShellSnapshot>;
    if (!isAppTab(parsed.activeTab)) return null;
    const visitedTabs = Array.isArray(parsed.visitedTabs)
      ? parsed.visitedTabs.filter(isAppTab)
      : [parsed.activeTab];
    return {
      activeTab: parsed.activeTab,
      visitedTabs: Array.from(new Set([parsed.activeTab, ...visitedTabs])),
      learningMode: parsed.learningMode || "morning",
      scrollPositions: parsed.scrollPositions || {},
      savedAt: Number(parsed.savedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveAppShellSnapshot(snapshot: AppShellSnapshot) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(APP_SHELL_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

export function readBootstrapSnapshot(): BootstrapSnapshot | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_KEY);
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
    window.localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify({ user, today, savedAt: Date.now() }));
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

export function emitTabVisibility(tab: AppTab, active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("loopine:tab-visibility", { detail: { tab, active } }));
}
