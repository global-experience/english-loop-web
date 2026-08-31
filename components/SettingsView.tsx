"use client";

import { FormEvent, useEffect, useState } from "react";
import { DatabaseBackup, Download, HardDrive, KeyRound, LogOut, Save, ShieldCheck, Smartphone, Vibrate } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/types";
import { isHapticsEnabled, setHapticsEnabled, triggerHapticImpact } from "@/lib/haptics";

export function SettingsView({ user, onSaved }: { user: User; onSaved: () => Promise<void> }) {
  const [usage, setUsage] = useState("확인 중");
  const [message, setMessage] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [hapticsOn, setHapticsOn] = useState(true);

  useEffect(() => {
    setHapticsOn(isHapticsEnabled());
    void navigator.storage?.estimate().then((estimate) => setUsage(`${formatBytes(estimate.usage || 0)} / ${formatBytes(estimate.quota || 0)}`));
  }, []);

  function toggleHaptics() {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    if (next) void triggerHapticImpact("medium");
    setMessage(next ? "터치 햅틱 피드백을 켰습니다." : "터치 햅틱 피드백을 껐습니다.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ display_name: form.get("display_name"), english_level: form.get("english_level"), goals: String(form.get("goals")).split(",").map((item) => item.trim()).filter(Boolean), custom_gpt_url: form.get("custom_gpt_url") || null, daily_minutes: Number(form.get("daily_minutes")), recording_retention_days: Number(form.get("recording_retention_days")) }) });
    setMessage("설정을 저장했어요.");
    await onSaved();
  }
  async function downloadExport() {
    const data = await apiFetch("/api/export");
    const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `loopine-export-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(href);
  }
  async function logout() { await apiFetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }
  async function revealActionKey() {
    let revealed = false;
    try {
      const data = await apiFetch<{ api_key: string }>("/api/me/action-key");
      setActionKey(data.api_key);
      revealed = true;
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(data.api_key);
      setMessage("내 계정의 Custom GPT Action 키를 복사했어요.");
    } catch { setMessage(revealed ? "Action 키를 표시했어요. 길게 눌러 복사하세요." : "Action 키를 불러오지 못했습니다. 다시 시도해 주세요."); }
  }
  async function clearOffline() { if (!confirm("이 기기에 오프라인 저장한 콘텐츠를 모두 삭제할까요?")) return; navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_OFFLINE_CONTENT" }); Object.keys(localStorage).filter((key) => key.startsWith("loopine:offline:")).forEach((key) => localStorage.removeItem(key)); setMessage("오프라인 콘텐츠를 삭제했어요."); }

  return <div className="view-stack"><header className="view-title"><p className="eyebrow">SETTINGS</p><h2>내 학습 방식에 맞게<br/>루프 조정하기.</h2></header>
    <form className="settings-form" onSubmit={save}><section><div className="settings-heading"><span>01</span><div><h3>프로필과 목표</h3><p>학습 계획과 Custom GPT 컨텍스트에 사용됩니다.</p></div></div><label>표시 이름<input name="display_name" defaultValue={user.display_name} required/></label><label>영어 수준<select name="english_level" defaultValue={user.english_level}>{["A1","A2","B1","B2","C1"].map((level) => <option key={level}>{level}</option>)}</select></label><label>학습 목표 (쉼표로 구분)<textarea name="goals" defaultValue={user.goals.join(", ")}/></label></section>
      <section><div className="settings-heading"><span>02</span><div><h3>ChatGPT 영어 코치</h3><p>일반 HTTPS Custom GPT 공유 링크를 등록하세요.</p></div></div><label>Custom GPT URL<input name="custom_gpt_url" type="url" defaultValue={user.custom_gpt_url || ""} placeholder="https://chatgpt.com/g/g-..."/></label><button type="button" className="secondary-button wide" onClick={() => void revealActionKey()}><KeyRound size={17}/> 내 Action 키 표시·복사</button>{actionKey && <div className="action-key-panel"><code className="selectable-text">{actionKey}</code><small>이 키는 본인 GPT Builder의 Bearer 인증에만 사용하고 공유하지 마세요.</small></div>}<div className="security-note"><ShieldCheck/><p>음성 모드 중 Action 호출은 전제로 하지 않습니다. 텍스트 “오늘 수업 시작”과 “오늘 수업 저장”에서만 서버가 연결됩니다.</p></div></section>
      <section><div className="settings-heading"><span>03</span><div><h3>시간과 녹음 정책</h3><p>녹음은 선택한 경우에만 서버에 저장됩니다.</p></div></div><label>하루 기본 학습 시간<input name="daily_minutes" type="number" min="30" max="240" defaultValue={user.daily_minutes}/></label><label>저장한 녹음 보관일<input name="recording_retention_days" type="number" min="0" max="365" defaultValue={user.recording_retention_days}/></label></section>
      {/* <section><div className="settings-heading"><span>04</span><div><h3>앱 반응 및 햅틱</h3><p>버튼 터치 및 탭 전환 시 진동/햅틱 반응을 제어합니다.</p></div></div><button type="button" className="secondary-button wide" onClick={toggleHaptics} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "flex", alignItems: "center", gap: "8px" }}><Vibrate size={17}/> 터치 햅틱 반응</span><strong>{hapticsOn ? "켜짐 ON" : "꺼짐 OFF"}</strong></button></section> */}
      {message && <p className="save-message" role="status">{message}</p>}<button className="primary-button wide"><Save size={18}/> 설정 저장</button></form>
    <section className="settings-tools"><div className="section-heading"><div><p className="eyebrow">DATA & OFFLINE</p><h2>내 데이터 관리</h2></div></div><button onClick={() => void downloadExport()}><Download/><span><strong>데이터 내보내기</strong><small>계획·표현 성장·리포트 JSON</small></span></button><button onClick={() => void clearOffline()}><HardDrive/><span><strong>오프라인 콘텐츠 삭제</strong><small>현재 사용량 {usage}</small></span></button><button onClick={() => alert("서버 운영자는 docs/deployment.md의 PostgreSQL 백업 절차를 사용하세요.")}><DatabaseBackup/><span><strong>백업·복구 안내</strong><small>운영 체크리스트 확인</small></span></button><button className="danger" onClick={() => void logout()}><LogOut/><span><strong>로그아웃</strong><small>{user.email}</small></span></button></section>
  </div>;
}

function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B","KB","MB","GB"]; const index = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
