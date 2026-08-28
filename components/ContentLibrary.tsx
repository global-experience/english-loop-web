"use client";

import { FormEvent, useEffect, useState } from "react";
import { Download, ExternalLink, FileAudio, Plus, Trash2, Upload } from "lucide-react";
import { apiFetch, mediaUrl } from "@/lib/api";
import type { Content } from "@/lib/types";

export function ContentLibrary() {
  const [items, setItems] = useState<Content[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await apiFetch<{ items: Content[] }>("/api/contents?page_size=100");
    setItems(data.items);
  }
  useEffect(() => { void load(); }, []);

  function cacheContent(content: Content) {
    const urls = [content.media_url ? mediaUrl(content.media_url) : null].filter(Boolean);
    navigator.serviceWorker.controller?.postMessage({ type: "CACHE_CONTENT", urls });
    localStorage.setItem(`english-loop:offline:${content.id}`, JSON.stringify(content));
    setMessage(`“${content.title}”을 오프라인 목록에 저장했어요.`);
  }
  function removeOffline(content: Content) {
    const urls = [content.media_url ? mediaUrl(content.media_url) : null].filter(Boolean);
    navigator.serviceWorker.controller?.postMessage({ type: "REMOVE_CONTENT", urls });
    localStorage.removeItem(`english-loop:offline:${content.id}`);
    setMessage("오프라인 사본을 삭제했어요.");
  }
  async function clearAll() {
    if (!confirm("오프라인 저장 콘텐츠를 모두 삭제할까요?")) return;
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_OFFLINE_CONTENT" });
    Object.keys(localStorage).filter((key) => key.startsWith("english-loop:offline:")).forEach((key) => localStorage.removeItem(key));
    setMessage("오프라인 콘텐츠를 모두 삭제했어요.");
  }

  return <section className="library-view"><div className="section-heading"><div><p className="eyebrow">CONTENT LIBRARY</p><h2>내 학습 콘텐츠</h2></div><button className="small-button" onClick={() => setShowForm((value) => !value)}><Plus size={16}/> 등록</button></div>
    {showForm && <ContentForm onCreated={() => { setShowForm(false); void load(); }}/>} 
    {message && <p className="save-message" role="status">{message}</p>}
    <div className="library-list">{items.map((content) => <article key={content.id}><span className="content-icon"><FileAudio/></span><div><p><span>{content.level}</span> {content.topic}</p><h3>{content.title}</h3><small>{content.source_type} · {content.duration_seconds || "—"}초</small></div><div className="library-actions">{content.source_url && <a href={content.source_url} target="_blank" rel="noreferrer" aria-label="원본 링크 열기"><ExternalLink size={18}/></a>}<button onClick={() => cacheContent(content)} aria-label="오프라인 저장"><Download size={18}/></button><button onClick={() => removeOffline(content)} aria-label="오프라인 사본 삭제"><Trash2 size={18}/></button></div></article>)}</div>
    <button className="text-button danger" onClick={() => void clearAll()}><Trash2 size={16}/> 오프라인 저장 전체 삭제</button>
  </section>;
}

function ContentForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "upload") {
        const upload = new FormData();
        upload.set("title", String(form.get("title")));
        upload.set("topic", String(form.get("topic")));
        upload.set("summary_ko", String(form.get("summary")));
        upload.set("media", form.get("media") as File);
        await apiFetch("/api/contents/upload", { method: "POST", body: upload });
      } else {
        await apiFetch("/api/contents", { method: "POST", body: JSON.stringify({ title: form.get("title"), topic: form.get("topic"), content_summary_ko: form.get("summary"), content_type: "AUDIO", source_type: "DIRECT_URL", source_url: form.get("url"), level: "B1", duration_seconds: 0, segments: [], expression_ids: [] }) });
      }
      onCreated();
    } finally { setBusy(false); }
  }
  return <form className="inline-form" onSubmit={submit}><div className="segmented"><button type="button" className={mode === "link" ? "active" : ""} onClick={() => setMode("link")}><ExternalLink size={15}/> 직접 URL</button><button type="button" className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}><Upload size={15}/> 파일 업로드</button></div><label>제목<input name="title" required maxLength={200}/></label><label>주제<input name="topic" required maxLength={120}/></label><label>한국어 요약<textarea name="summary" required maxLength={3000}/></label>{mode === "link" ? <label>직접 재생 가능한 HTTPS 오디오 URL<input name="url" type="url" required/></label> : <label>오디오 파일 (15MB 이하)<input name="media" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg" required/></label>}<button className="primary-button" disabled={busy}>{busy ? "등록 중…" : "콘텐츠 등록"}</button></form>;
}

