"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, BookOpen, CalendarDays, CircleUserRound, Clapperboard, RefreshCw, Settings, WifiOff } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { TodayData, User } from "@/lib/types";
import { ServiceWorker } from "@/components/ServiceWorker";
import { TodayView } from "@/components/TodayView";
import { LearningView, type LearningMode } from "@/components/LearningView";
import { ReviewView } from "@/components/ReviewView";
import { ReportView } from "@/components/ReportView";
import { SettingsView } from "@/components/SettingsView";
import { AppSplash, useAppSplash } from "@/components/AppSplash";
import { FeedView } from "@/components/FeedView";
import { youtubeStore } from "@/lib/youtubeStore";

type Tab = "today" | "feed" | "learn" | "review" | "report" | "settings";
type TabDirection = "forward" | "back";

const nav = [
  { id: "today" as const, label: "오늘", Icon: CalendarDays },
  { id: "feed" as const, label: "피드", Icon: Clapperboard },
  { id: "learn" as const, label: "학습", Icon: BookOpen },
  { id: "review" as const, label: "복습", Icon: RefreshCw },
  { id: "report" as const, label: "리포트", Icon: BarChart3 },
  { id: "settings" as const, label: "설정", Icon: Settings },
];

export default function Home() {
  const splash = useAppSplash();
  const [tab, setTab] = useState<Tab>("today");
  const [learningMode, setLearningMode] = useState<LearningMode>("morning");
  const [today, setToday] = useState<TodayData | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [tabDirection, setTabDirection] = useState<TabDirection>("forward");

  const refresh = useCallback(async () => {
    try {
      setError("");
      const [me, data] = await Promise.all([apiFetch<User>("/api/me"), apiFetch<TodayData>("/api/today")]);
      setUser(me);
      setToday(data);
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
    if (splash.ready && !splash.visible) void refresh();
  }, [splash.ready, splash.visible, refresh]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const scrollToTop = (behavior: ScrollBehavior) => {
    window.scrollTo({ top: 0, left: 0, behavior });
  };

  const switchTab = (nextTab: Tab) => {
    if (nextTab === tab) {
      scrollToTop("smooth");
      return;
    }
    const direction: TabDirection = nav.findIndex((item) => item.id === nextTab) > nav.findIndex((item) => item.id === tab) ? "forward" : "back";
    setTabDirection(direction);
    setTab(nextTab);
    scrollToTop("auto");
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

  if (!splash.ready || splash.visible) return <AppSplash/>;
  if (loading) return <main className="center-state"><img className="pulse-logo" src="/icons/loopine-logo.svg" alt="" aria-hidden="true" /><p>오늘의 학습 루프를 준비하고 있어요.</p></main>;
  if (!user || !today) return <main className="center-state"><p>{error || "학습 데이터를 불러오지 못했습니다."}</p><button className="primary-button" onClick={() => void refresh()}>다시 시도</button></main>;

  return (
    <main className="app-shell" data-tab={tab}>
      <ServiceWorker />
      {!online && <div className="offline-banner" role="status"><WifiOff size={15}/> 오프라인 — 작성 내용은 이 기기에 보관됩니다.</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <header className="topbar">
        <div className="brand-mark"><img src="/icons/loopine-logo.svg" alt="" aria-hidden="true" /></div>
        <div><p className="eyebrow">LOOPINE</p><h1>{user.display_name}님의 학습 루프</h1></div>
        <button className="avatar" aria-label="설정 열기" onClick={() => switchTab("settings")}><CircleUserRound size={23}/></button>
      </header>

      <div className="tab-viewport" role="tabpanel" id={`panel-${tab}`} aria-label={`${nav.find((item) => item.id === tab)?.label} 화면`}>
        <div className={`tab-scene tab-scene-${tabDirection}`} key={tab}>
          {tab === "today" && <TodayView today={today} user={user} refresh={refresh} openLearning={openLearning}/>} 
          {tab === "feed" && <FeedView openLearning={openFeedVideo}/>}
          {tab === "learn" && <LearningView today={today} mode={learningMode} setMode={setLearningMode} refresh={refresh}/>} 
          {tab === "review" && <ReviewView/>}
          {tab === "report" && <ReportView/>}
          {tab === "settings" && <SettingsView user={user} onSaved={refresh}/>} 
        </div>
      </div>

      <nav className="bottom-nav" aria-label="주요 메뉴" role="tablist">
        {nav.map(({ id, label, Icon }) => (
          <button id={`tab-${id}`} role="tab" aria-controls={`panel-${id}`} aria-selected={tab === id} className={tab === id ? "active" : ""} key={id} onClick={() => switchTab(id)}>
            <Icon size={19}/><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
