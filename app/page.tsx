"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, CircleUserRound, Clapperboard, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { TodayData, User } from "@/lib/types";
import { ServiceWorker } from "@/components/ServiceWorker";
import { TodayView } from "@/components/TodayView";
import { LearningView, type LearningMode } from "@/components/LearningView";
import { AppSplash, useAppSplash } from "@/components/AppSplash";
import { youtubeStore } from "@/lib/youtubeStore";
import { triggerHapticSelection } from "@/lib/haptics";
import { isNativeAppRuntime } from "@/lib/nativeRuntime";
import {
  APP_TABS,
  emitTabVisibility,
  isAppTab,
  readAppShellSnapshot,
  readBootstrapSnapshot,
  requestIdleWork,
  saveAppShellSnapshot,
  saveBootstrapSnapshot,
  type AppTab,
} from "@/lib/appShellState";

type TabDirection = "forward" | "back";

const FeedView = dynamic(() => import("@/components/FeedView").then((mod) => mod.FeedView), { ssr: false });
const ReviewView = dynamic(() => import("@/components/ReviewView").then((mod) => mod.ReviewView), { ssr: false });
const ReportView = dynamic(() => import("@/components/ReportView").then((mod) => mod.ReportView), { ssr: false });
const SettingsView = dynamic(() => import("@/components/SettingsView").then((mod) => mod.SettingsView), { ssr: false });

const nav = [
  { id: "today" as const, label: "오늘", Icon: CalendarDays },
  { id: "learn" as const, label: "학습", Icon: BookOpen },
  { id: "feed" as const, label: "피드", Icon: Clapperboard },
  { id: "review" as const, label: "복습", Icon: RefreshCw },
  { id: "report" as const, label: "리포트", Icon: BarChart3 },
  // { id: "settings" as const, label: "설정", Icon: Settings },
];

const tabLabels: Record<AppTab, string> = {
  today: "오늘",
  learn: "학습",
  feed: "피드",
  review: "복습",
  report: "리포트",
  settings: "설정",
};

function getInitialRoute() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get("tab");
  const hashTab = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  const tab = isAppTab(queryTab) ? queryTab : isAppTab(hashTab) ? hashTab : null;
  const mode = params.get("mode");
  return {
    tab,
    mode: mode === "morning" || mode === "lunch" || mode === "evening" || mode === "library" || mode === "youtube" ? mode : null,
  };
}

function isNativeRuntime() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return isNativeAppRuntime(capacitor, navigator.userAgent);
}

export default function Home() {
  const splash = useAppSplash();
  const restoredShell = useMemo(() => readAppShellSnapshot(), []);
  const restoredBootstrap = useMemo(() => readBootstrapSnapshot(), []);
  const initialRoute = useMemo(() => getInitialRoute(), []);
  const initialTab = initialRoute?.tab || restoredShell?.activeTab || "today";
  const [tab, setTab] = useState<AppTab>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<AppTab[]>(() =>
    Array.from(new Set([initialTab, ...(restoredShell?.visitedTabs || ["today"])]))
  );
  const [learningMode, setLearningMode] = useState<LearningMode>((initialRoute?.mode || restoredShell?.learningMode || "morning") as LearningMode);
  const [today, setToday] = useState<TodayData | null>(restoredBootstrap?.today || null);
  const [user, setUser] = useState<User | null>(restoredBootstrap?.user || null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!restoredBootstrap);
  const [online, setOnline] = useState(true);
  const [tabDirection, setTabDirection] = useState<TabDirection>("forward");
  const tabRef = useRef<AppTab>(initialTab);
  const scrollPositionsRef = useRef<Partial<Record<AppTab, number>>>(restoredShell?.scrollPositions || {});

  const refresh = useCallback(async () => {
    try {
      setError("");
      const [me, data] = await Promise.all([apiFetch<User>("/api/me"), apiFetch<TodayData>("/api/today")]);
      setUser(me);
      setToday(data);
      saveBootstrapSnapshot(me, data);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(caught instanceof Error ? caught.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  useEffect(() => {
    requestIdleWork(() => {
      void import("@/components/FeedView");
      void import("@/components/LearningView");
      void import("@/components/ReviewView");
      void import("@/components/ReportView");
      void import("@/components/SettingsView");
    });
  }, []);

  useEffect(() => {
    const onLifecyclePause = () => {
      scrollPositionsRef.current[tabRef.current] = window.scrollY;
      saveAppShellSnapshot({
        activeTab: tabRef.current,
        visitedTabs,
        learningMode,
        scrollPositions: scrollPositionsRef.current,
        savedAt: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("loopine:app-background"));
    };
    const onLifecycleResume = () => {
      window.dispatchEvent(new CustomEvent("loopine:app-foreground"));
      if (Date.now() - (restoredBootstrap?.savedAt || 0) > 60_000) void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLifecyclePause();
      if (document.visibilityState === "visible") onLifecycleResume();
    };
    window.addEventListener("pagehide", onLifecyclePause);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onLifecyclePause);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [learningMode, refresh, restoredBootstrap?.savedAt, visitedTabs]);

  useEffect(() => {
    saveAppShellSnapshot({
      activeTab: tab,
      visitedTabs,
      learningMode,
      scrollPositions: scrollPositionsRef.current,
      savedAt: Date.now(),
    });
  }, [learningMode, tab, visitedTabs]);

  useEffect(() => {
    const previousTab = tabRef.current;
    if (previousTab !== tab) emitTabVisibility(previousTab, false);
    tabRef.current = tab;
    emitTabVisibility(tab, true);
  }, [tab]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboardState = () => {
      document.body.classList.toggle("keyboard-open", window.innerHeight - viewport.height > 120);
    };
    syncKeyboardState();
    viewport.addEventListener("resize", syncKeyboardState);
    viewport.addEventListener("scroll", syncKeyboardState);
    return () => {
      viewport.removeEventListener("resize", syncKeyboardState);
      viewport.removeEventListener("scroll", syncKeyboardState);
      document.body.classList.remove("keyboard-open");
    };
  }, []);

  useEffect(() => {
    if (!isNativeRuntime()) return;
    window.history.replaceState({ loopine: true, tab }, "", window.location.href);
    const onPopState = () => {
      if (tabRef.current !== "today") {
        setTabDirection("back");
        setTab("today");
        setVisitedTabs((current) => Array.from(new Set([...current, "today"])));
        window.history.pushState({ loopine: true, tab: "today" }, "", window.location.href);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [tab]);

  const scrollToTop = (behavior: ScrollBehavior) => {
    window.scrollTo({ top: 0, left: 0, behavior });
  };

  const switchTab = (nextTab: AppTab) => {
    void triggerHapticSelection();
    scrollPositionsRef.current[tabRef.current] = window.scrollY;
    if (nextTab === tab) {
      scrollToTop("instant");
      scrollPositionsRef.current[nextTab] = 0;
      return;
    }
    const direction: TabDirection = APP_TABS.indexOf(nextTab) > APP_TABS.indexOf(tab) ? "forward" : "back";
    setTabDirection(direction);
    setVisitedTabs((current) => Array.from(new Set([...current, nextTab])));
    setTab(nextTab);
    window.scrollTo({ top: scrollPositionsRef.current[nextTab] || 0, left: 0, behavior: "instant" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPositionsRef.current[nextTab] || 0, left: 0, behavior: "instant" });
    });
  };

  const openLearning = (mode: LearningMode) => {
    setLearningMode(mode);
    switchTab("learn");
  };

  const openFeedVideo = (videoUrl: string) => {
    void youtubeStore.loadTranscript(videoUrl);
    setLearningMode("youtube");
    switchTab("learn");
  };

  if (!splash.ready || splash.visible) return <AppSplash />;

  const needsBootstrap = !user || !today;
  const bootstrapFallback = (
    <section className="shell-loading-card" aria-live="polite">
      {loading ? <LoaderCircle className="spin" size={22} /> : <WifiOff size={22} />}
      <h2>{loading ? "학습 루프를 연결하고 있어요." : "학습 데이터를 불러오지 못했습니다."}</h2>
      <p>{error || "앱 화면은 먼저 열어두고, 서버 응답이 오면 바로 이어서 표시합니다."}</p>
      {!loading && <button className="primary-button" onClick={() => void refresh()}>다시 시도</button>}
    </section>
  );

  return (
    <main className="app-shell" data-tab={tab}>
      <ServiceWorker />
      {!online && <div className="offline-banner" role="status"><WifiOff size={15} /> 오프라인 — 작성 내용은 이 기기에 보관됩니다.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <nav className="desktop-side-nav" aria-label="데스크탑 주요 메뉴">
        {/* <div className="desktop-side-brand" onClick={() => switchTab("today")} role="button" tabIndex={0} title="오늘 화면으로 이동">
          <img src="/icons/loopine-logo.svg" alt="Loopine" />
        </div> */}
        <div className="desktop-side-menu" role="tablist">
          {nav.map(({ id, label, Icon }) => (
            <button
              id={`desktop-side-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => switchTab(id)}
              title={label}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <header className="topbar">
        <div className="brand-mark"><img src="/icons/loopine-logo.svg" alt="" aria-hidden="true" /></div>
        <div><p className="eyebrow">LOOPINE</p><h1>{user?.display_name || "사용자"}님의 학습 루프</h1></div>
        <button id="settings-avatar" className="avatar" aria-label="설정 열기" onClick={() => switchTab("settings")}><CircleUserRound size={23} /></button>
      </header>

      <div className="tab-viewport" aria-label={`${tabLabels[tab]} 화면`}>
        {APP_TABS.map((paneTab) => {
          if (!visitedTabs.includes(paneTab)) return null;
          const active = tab === paneTab;
          return (
            <section
              key={paneTab}
              id={`panel-${paneTab}`}
              role="tabpanel"
              aria-labelledby={paneTab === "settings" ? "settings-avatar" : `tab-${paneTab}`}
              aria-hidden={!active}
              className={`tab-pane ${active ? "active" : "inactive"} ${active ? `tab-scene tab-scene-${tabDirection}` : ""}`}
            >
              {paneTab === "today" && (needsBootstrap ? bootstrapFallback : <TodayView today={today} user={user} refresh={refresh} openLearning={openLearning} />)}
              {paneTab === "feed" && <FeedView active={active} openLearning={openFeedVideo} />}
              {paneTab === "learn" && (today ? <LearningView today={today} mode={learningMode} setMode={setLearningMode} refresh={refresh} /> : bootstrapFallback)}
              {paneTab === "review" && <ReviewView />}
              {paneTab === "report" && <ReportView />}
              {paneTab === "settings" && (user ? <SettingsView user={user} onSaved={refresh} /> : bootstrapFallback)}
            </section>
          );
        })}
      </div>

      <nav className="bottom-nav" aria-label="주요 메뉴" role="tablist">
        {nav.map(({ id, label, Icon }) => (
          <button id={`tab-${id}`} role="tab" aria-controls={`panel-${id}`} aria-selected={tab === id} className={tab === id ? "active" : ""} key={id} onClick={() => switchTab(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
