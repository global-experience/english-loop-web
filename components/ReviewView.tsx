"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, Check, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Report } from "@/lib/types";

type DueItem = { expression_progress_id: string; id: string; canonical_text: string; korean_meaning: string; example_sentence: string; current_stage: string; next_review_at: string | null };

export function ReviewView() {
  const [due, setDue] = useState<DueItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [vocabulary, setVocabulary] = useState<DueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [reviewData, reportData, vocabularyData] = await Promise.all([
      apiFetch<{ items: DueItem[] }>("/api/reviews/due"),
      apiFetch<{ items: Report[] }>("/api/reports?page_size=7"),
      apiFetch<{ items: DueItem[] }>("/api/vocabulary?limit=100"),
    ]);
    setDue(reviewData.items);
    setReports(reportData.items);
    setVocabulary(vocabularyData.items);
    setIndex(0);
  }
  useEffect(() => { void load(); }, []);

  const corrections = useMemo(() => reports.flatMap((report) => report.corrections.map((correction) => ({ ...correction, study_date: report.study_date }))).slice(0, 8), [reports]);
  const notUsed = useMemo(() => reports.flatMap((report) => report.target_expression_usage.filter((usage) => ["NOT_USED", "USED_INCORRECTLY"].includes(usage.status))).slice(0, 8), [reports]);
  const item = due[index];

  async function grade(result: "EASY" | "GOOD" | "HARD" | "FAILED") {
    await apiFetch(`/api/reviews/${item.expression_progress_id}/complete`, { method: "POST", body: JSON.stringify({ result }) });
    setMessage("복습 결과와 다음 복습일을 저장했어요.");
    setShowAnswer(false);
    if (index + 1 < due.length) setIndex((value) => value + 1); else await load();
  }

  return <div className="view-stack"><header className="view-title"><p className="eyebrow">REVIEW QUEUE</p><h2>기억이 흐려지기 전에<br/>한 번 더 꺼내기.</h2><span>{due.length}개 표현이 복습을 기다려요.</span></header>
    {item ? <section className="review-card"><div className="review-card-top"><span>{item.current_stage.replaceAll("_", " ")}</span><small>{index + 1} / {due.length}</small></div><p>이 상황을 영어로 말해보세요.</p><h3>{item.korean_meaning}</h3>{showAnswer ? <div className="answer-reveal"><strong>{item.canonical_text}</strong><p>{item.example_sentence}</p></div> : <button className="secondary-button wide" onClick={() => setShowAnswer(true)}>정답 확인 <ArrowRight size={17}/></button>}{showAnswer && <div className="review-grades"><button onClick={() => void grade("FAILED")}>기억 안 남</button><button onClick={() => void grade("HARD")}>어려움</button><button onClick={() => void grade("GOOD")}>좋음</button><button onClick={() => void grade("EASY")}>쉬움</button></div>}</section> : <section className="empty-state"><Sparkles/><h2>예정된 복습을 마쳤어요.</h2><p>밤 대화 결과가 저장되면 새 복습 항목이 자동으로 추가됩니다.</p></section>}
    {message && <p className="save-message" role="status">{message}</p>}
    <section><div className="section-heading"><div><p className="eyebrow">SAVED FROM YOUTUBE</p><h2>내 단어장</h2></div><Bookmark size={19}/></div><div className="compact-list vocabulary-list">{vocabulary.length ? vocabulary.map((word) => <article key={word.expression_progress_id}><span className="vocabulary-mark"><Bookmark size={13}/></span><div><strong>{word.canonical_text}</strong><small>{word.korean_meaning} · {word.current_stage.replaceAll("_", " ")}</small><p>{word.example_sentence}</p></div></article>) : <p className="muted-copy">자막에서 단어나 구절을 선택해 저장하면 여기에 모입니다.</p>}</div></section>
    <section><div className="section-heading"><div><p className="eyebrow">NEEDS RETRIEVAL</p><h2>아직 자발적으로 쓰지 못한 표현</h2></div><TriangleAlert size={19}/></div><div className="compact-list">{notUsed.length ? notUsed.map((usage, idx) => <article key={`${usage.expression}-${idx}`}><span className="status-dot warning"/><div><strong>{usage.expression}</strong><small>{usage.status.replaceAll("_", " ")}</small></div></article>) : <p className="muted-copy">아직 저장된 음성 수업 분석이 없습니다.</p>}</div></section>
    <section><div className="section-heading"><div><p className="eyebrow">SAY IT AGAIN</p><h2>교정 문장 다시 말하기</h2></div><RefreshCw size={19}/></div><div className="correction-list">{corrections.length ? corrections.map((correction, idx) => <article key={`${correction.original}-${idx}`}><p><s>{correction.original}</s></p><strong><Check size={16}/>{correction.corrected}</strong><small>{correction.reason_ko}</small></article>) : <p className="muted-copy">교정 문장이 저장되면 이곳에서 다시 말할 수 있어요.</p>}</div></section>
  </div>;
}
