"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, CalendarClock, Clock3, FolderOpen, Link2, LoaderCircle, Play, Plus, X, Youtube } from "lucide-react";
import type { Content, TodayData } from "@/lib/types";
import {
  readLearningPresets,
  readRecentLearningEntry,
  learningPresetsFromConfig,
  routineLabel,
  saveRecentLearningEntry,
  type LearningSessionEntry,
} from "@/lib/learningSession";
import { apiFetch } from "@/lib/api";
import { youtubeStore } from "@/lib/youtubeStore";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";
import { YouTubePractice } from "./YouTubePractice";
import { DirectContentPractice } from "./DirectContentPractice";
import { RoutineManagerView } from "./RoutineManagerView";

export type LearningMode = "morning" | "lunch" | "evening" | "library" | "youtube";

type Props = {
  today: TodayData;
  entry: LearningSessionEntry | null;
  setEntry: (entry: LearningSessionEntry | null) => void;
  refresh: () => Promise<void>;
  openReview: () => void;
  openNextRoutine: () => void;
};

export function LearningView({ today, entry, setEntry, refresh, openReview, openNextRoutine }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [routineManagerOpen, setRoutineManagerOpen] = useState(false);
  const [recent, setRecent] = useState<LearningSessionEntry | null>(null);
  const presets = entry?.routineConfig ? learningPresetsFromConfig(entry.routineConfig) : readLearningPresets();

  useEffect(() => setRecent(readRecentLearningEntry()), []);
  useEffect(() => {
    if (!entry) return;
    saveRecentLearningEntry(entry);
    setRecent(entry);
  }, [entry]);

  useEffect(() => {
    if (!entry?.contentId || entry.content || entry.youtubeUrl) return;
    void apiFetch<Content>(`/api/contents/${entry.contentId}`)
      .then((content) => setEntry({ ...entry, content, title: entry.title || content.title, youtubeUrl: content.source_type === "YOUTUBE" ? content.source_url : null }))
      .catch(() => setEntry(null));
  }, [entry, setEntry]);

  const endSession = () => {
    youtubeStore.stopActiveJob();
    setEntry(null);
  };

  if (routineManagerOpen) {
    return (
      <RoutineManagerView
        onBack={() => {
          void refresh();
          setRoutineManagerOpen(false);
        }}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="learning-workspace-shell">
      {/* <div className="learning-workspace-tools">
        <button type="button" className="secondary-button" onClick={() => setRoutineManagerOpen(true)}>
          <CalendarClock size={17} /> 학습 루틴 관리
        </button>
      </div> */}
      {(!entry || (!entry.content && !entry.youtubeUrl)) && (
        <section className="learning-launchpad">
          <div className="learning-launch-copy">
            <span className="learning-launch-icon"><BookOpen /></span>
            <p className="eyebrow">LEARNING WORKSPACE</p>
            <h2>{entry?.routineItemName ? `${entry.routineItemName}에 사용할 콘텐츠` : "무엇을 연습할까요?"}</h2>
            <p>콘텐츠를 선택하면 영상과 현재 문장, 말하기 연습, 전체 자막이 하나의 세션으로 열립니다.</p>
          </div>
          <button className="primary-button learning-pick-primary" onClick={() => setPickerOpen(true)}>
            <Plus size={18} /> 콘텐츠 선택
          </button>
          <button className="routine-entry-card" onClick={() => setRoutineManagerOpen(true)}>
            <span><CalendarClock size={20} /></span>
            <div><small>내 시간표 바꾸기</small><strong>학습 루틴 관리</strong><em>평일·주말 루틴, 알림, 반복 설정</em></div>
          </button>
          {recent && (
            <button className="recent-learning-card" onClick={() => setEntry(recent)}>
              <span><Clock3 size={18} /></span>
              <div><small>최근 학습 이어하기</small><strong>{recent.title || "이전 콘텐츠"}</strong><em>{recent.routineItemName || routineLabel(recent.routineStep)}</em></div>
              <Play size={18} fill="currentColor" />
            </button>
          )}
          <div className="learning-entry-hints">
            <span>오늘 루틴에서 바로 열기</span><span>피드에서 문장과 함께 열기</span><span>내 콘텐츠에서 선택하기</span>
          </div>
        </section>
      )}

      {entry && (entry.youtubeUrl || entry.content?.source_type === "YOUTUBE") && (
        <YouTubePractice
          entry={entry}
          presets={presets}
          onChangeContent={() => setPickerOpen(true)}
          onEndSession={endSession}
          onSessionEntryChange={setEntry}
          onOpenReview={openReview}
          onNextRoutine={openNextRoutine}
        />
      )}

      {entry && !entry.youtubeUrl && entry.content && entry.content.source_type !== "YOUTUBE" && (
        <DirectContentPractice
          entry={entry}
          presets={presets}
          onChangeContent={() => setPickerOpen(true)}
          onEndSession={endSession}
          onRefresh={refresh}
          onOpenReview={openReview}
          onNextRoutine={openNextRoutine}
        />
      )}

      {pickerOpen && (
        <ContentPicker
          today={today}
          onClose={() => setPickerOpen(false)}
          onSelect={(nextEntry) => {
            setEntry(entry?.routineItemId ? { ...nextEntry, routineId: entry.routineId, routineItemId: entry.routineItemId, routineItemName: entry.routineItemName, routineSnapshot: entry.routineSnapshot, routineConfig: entry.routineConfig, activityId: entry.activityId, entrySource: entry.entrySource } : nextEntry);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ContentPicker({ today, onClose, onSelect }: { today: TodayData; onClose: () => void; onSelect: (entry: LearningSessionEntry) => void }) {
  const { mobile } = useMobileUi();
  const portalReady = usePortalReady();
  const [items, setItems] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    void apiFetch<{ items: Content[] }>("/api/contents?page_size=100")
      .then((data) => setItems(data.items))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "콘텐츠를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  function submitYoutube(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    youtubeStore.prepareVideo(value);
    onSelect({
      contentId: null,
      entrySource: "direct",
      youtubeUrl: value,
      title: "YouTube 직접 학습",
      sourceLabel: "YouTube URL",
    });
  }

  const todayContents = today.plan?.activities.filter((activity) => activity.content).map((activity) => activity.content!) || [];
  const uniqueItems = [...todayContents, ...items].filter((content, index, list) => list.findIndex((item) => item.id === content.id) === index);

  if (!portalReady) return null;

  return createPortal(
    <div className={`content-picker-layer ${mobile ? "mobile" : "desktop"}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="content-picker" role="dialog" aria-modal={mobile} aria-labelledby="content-picker-title">
        {mobile && <div className="content-picker-handle" aria-hidden="true" />}
        <header><div><p className="eyebrow">CONTENT SOURCE</p><h2 id="content-picker-title">학습 콘텐츠 선택</h2></div><button onClick={onClose} aria-label="콘텐츠 선택 닫기"><X size={19} /></button></header>
        <form className="youtube-url-form content-picker-url" onSubmit={submitYoutube}>
          <label className="sr-only" htmlFor="learning-youtube-url">YouTube URL</label>
          <Link2 size={17} />
          <input id="learning-youtube-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="YouTube URL을 붙여넣으세요" required />
          <button type="submit"><Youtube size={16} /> 추가</button>
        </form>
        <div className="content-picker-heading"><FolderOpen size={17} /><strong>내 콘텐츠</strong><span>{uniqueItems.length}개</span></div>
        {loading && <div className="content-picker-loading"><LoaderCircle className="spin" />불러오는 중…</div>}
        {error && <p className="youtube-error">{error}</p>}
        <div className="content-picker-list">
          {uniqueItems.map((content) => (
            <button key={content.id} onClick={() => onSelect({
              contentId: content.id,
              entrySource: "library",
              youtubeUrl: content.source_type === "YOUTUBE" ? content.source_url : null,
              title: content.title,
              sourceLabel: content.source_type === "YOUTUBE" ? "YouTube · 내 콘텐츠" : "내 콘텐츠",
              content,
            })}>
              <span className={content.source_type === "YOUTUBE" ? "youtube" : "library"}>{content.source_type === "YOUTUBE" ? <Youtube /> : <BookOpen />}</span>
              <div><strong>{content.title}</strong><small>{content.topic} · {content.duration_seconds ? `${Math.ceil(content.duration_seconds / 60)}분` : "길이 미정"}</small></div>
              <Play size={16} />
            </button>
          ))}
          {!loading && !uniqueItems.length && <p className="muted-copy">저장한 콘텐츠가 없습니다. 위에 YouTube URL을 추가해 바로 시작할 수 있어요.</p>}
        </div>
      </section>
    </div>,
    document.body
  );
}
