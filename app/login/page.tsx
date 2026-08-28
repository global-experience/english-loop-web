"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AppSplash, useAppSplash } from "@/components/AppSplash";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const splash = useAppSplash();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [englishLevel, setEnglishLevel] = useState("B1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError("");
    setPasswordConfirm("");
    if (nextMode === "register" && email === "learner@example.com") {
      setEmail("");
      setPassword("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "register" && password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login"
        ? { email, password }
        : { display_name: displayName, email, password, english_level: englishLevel };
      await apiFetch(path, { method: "POST", body: JSON.stringify(payload) });
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : mode === "login" ? "로그인하지 못했습니다." : "회원가입하지 못했습니다.");
    } finally { setBusy(false); }
  }

  if (!splash.ready || splash.visible) return <AppSplash />;

  const AuthIcon = mode === "login" ? LockKeyhole : UserPlus;
  return (
    <main className="login-page">
      <section className="login-brand"><div className="brand-mark inverse">EL</div><p className="eyebrow">CLOSED LEARNING LOOP</p><h1>들은 영어를<br /><em>내 말로.</em></h1><p>출근길에 만난 표현을 점심에 말하고, 밤의 실제 대화까지 연결하세요.</p></section>
      <form className="login-card" onSubmit={submit}>
        <div className="auth-switch" role="tablist" aria-label="계정 접근 방식">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>회원가입</button>
        </div>
        <AuthIcon size={26} /><div><p className="eyebrow">{mode === "login" ? "PRIVATE ACCESS" : "START YOUR LOOP"}</p><h2>{mode === "login" ? "나의 루프에 로그인" : "새 학습 루프 만들기"}</h2></div>
        <div className={`auth-fields auth-fields-${mode}`} key={mode}>
          {mode === "register" && <label>표시 이름<input type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} placeholder="표시 이름" /></label>}
          <label>이메일<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="이메일" /></label>
          {mode === "register" && <label>영어 수준<select value={englishLevel} onChange={(event) => setEnglishLevel(event.target.value)}>{["A1", "A2", "B1", "B2", "C1"].map((level) => <option key={level}>{level}</option>)}</select></label>}
          <label>비밀번호<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "login" ? 8 : 10} placeholder="비밀번호" /></label>
          {mode === "register" && <><label>비밀번호 확인<input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required minLength={10} placeholder="비밀번호 확인" /></label><p className="password-hint">10자 이상, 영문과 숫자를 각각 하나 이상 포함하세요.</p></>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "처리 중…" : <>{mode === "login" ? "로그인" : "계정 만들기"} <ArrowRight size={18} /></>}</button>
        <p className="form-note">{mode === "login" ? "처음 확인할 때는 기본 계정을 사용할 수 있습니다." : "가입 후 자동 로그인되며, 본인 전용 샘플 대본과 오늘 학습 계획이 준비됩니다."}</p>
      </form>
    </main>
  );
}
