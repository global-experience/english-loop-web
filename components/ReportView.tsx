"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Award, ChartNoAxesColumnIncreasing, MessageCircle, Timer } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Analytics, Report } from "@/lib/types";

type LearningResult = { id: string; practiced_line_count: number; saved_expression_count: number; retry_line_count: number; missing_words: string[]; completed_at: string };

export function ReportView() {
  const [days, setDays] = useState<7 | 14>(7);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [learningResults, setLearningResults] = useState<LearningResult[]>([]);
  useEffect(() => {
    void Promise.all([apiFetch<Analytics>(`/api/analytics/weekly?days=${days}`), apiFetch<{ items: Report[] }>("/api/reports?page_size=14"), apiFetch<{ items: LearningResult[] }>("/api/learning/sessions/results?limit=30")]).then(([stats, reportData, resultData]) => { setAnalytics(stats); setReports(reportData.items); setLearningResults(resultData.items); });
  }, [days]);
  const latest = reports[0];
  const practicedLines = learningResults.reduce((sum, item) => sum + item.practiced_line_count, 0);
  const retryLines = learningResults.reduce((sum, item) => sum + item.retry_line_count, 0);
  const frequentMissingWords = Object.entries(learningResults.flatMap((item) => item.missing_words).reduce<Record<string, number>>((counts, word) => ({ ...counts, [word]: (counts[word] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return <div className="view-stack"><header className="view-title report-title"><div><p className="eyebrow">PROGRESS, NOT POINTS</p><h2>점수보다 중요한<br/>실제 사용의 변화.</h2></div><div className="segmented"><button className={days === 7 ? "active" : ""} onClick={() => setDays(7)}>7일</button><button className={days === 14 ? "active" : ""} onClick={() => setDays(14)}>14일</button></div></header>
    {analytics && <><section className="metric-grid"><Metric Icon={MessageCircle} label="자발적 사용률" value={`${analytics.target_expression_usage.spontaneous_rate}%`} detail={`${analytics.target_expression_usage.spontaneous}/${analytics.target_expression_usage.tracked} 표현`}/><Metric Icon={Timer} label="총 학습 시간" value={`${analytics.total_study_minutes}`} suffix="분" detail={`${days}일 누적`}/><Metric Icon={Award} label="새로 MASTERED" value={`${analytics.newly_mastered}`} suffix="개" detail="반복 성공"/><Metric Icon={ChartNoAxesColumnIncreasing} label="첫→최종 이해도" value={analytics.listening.average_improvement == null ? "—" : `+${analytics.listening.average_improvement}`} detail={`${analytics.listening.shadowed_sentences}회 쉐도잉`}/><Metric Icon={MessageCircle} label="연습한 자막" value={`${practicedLines}`} suffix="개" detail={`다시 말할 문장 ${retryLines}개`}/></section>
      <section className="routine-chart"><div className="section-heading"><div><p className="eyebrow">ROUTINE CONSISTENCY</p><h2>단계별 완료율</h2></div></div>{Object.entries(analytics.routine).map(([slot, stat]) => <div className="bar-row" key={slot}><span>{slotLabel(slot)}</span><div><i style={{ width: `${stat.completion_rate}%` }}/></div><strong>{stat.completion_rate}%</strong></div>)}</section>
      <section><div className="section-heading"><div><p className="eyebrow">14-DAY WEAKNESSES</p><h2>반복 취약점</h2></div></div><div className="weakness-list">{analytics.weaknesses.length ? analytics.weaknesses.map((item) => <article key={item.category}><div><strong>{item.category.replaceAll("_", " ")}</strong><p>{item.description_ko}</p></div><span className={`trend ${item.trend.toLowerCase()}`}>{item.trend === "IMPROVING" ? <ArrowDownRight/> : item.trend === "WORSENING" ? <ArrowUpRight/> : "—"}{item.trend}</span><small>{item.occurrence_count}회 · 심각도 {item.average_severity}</small></article>) : <p className="muted-copy">분석 리포트가 쌓이면 최근 추세를 비교합니다.</p>}</div></section></>}
    <section><div className="section-heading"><div><p className="eyebrow">LEARNING WORKSPACE</p><h2>자주 빠진 단어</h2></div></div><div className="compact-list">{frequentMissingWords.length ? frequentMissingWords.map(([word, count]) => <article key={word}><span className="status-dot warning"/><div><strong>{word}</strong><small>따라 말하기에서 {count}회 누락</small></div></article>) : <p className="muted-copy">따라 말하기 결과가 쌓이면 자주 빠지는 단어를 보여줘요.</p>}</div></section>
    <section><div className="section-heading"><div><p className="eyebrow">LATEST VOICE REPORT</p><h2>오늘 음성 수업 분석</h2></div></div>{latest ? <article className="latest-report"><p>{latest.summary_ko}</p><div className="report-scores">{Object.entries(latest.scores).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}/5</strong></span>)}</div><h3>가장 먼저 다시 말할 문장</h3>{latest.corrections.slice(0, 2).map((item) => <div className="report-correction" key={item.original}><s>{item.original}</s><strong>{item.corrected}</strong></div>)}<h3>다음 집중 항목</h3><ul>{latest.next_focus.map((item) => <li key={item}>{item}</li>)}</ul></article> : <section className="empty-state compact"><h2>아직 저장된 수업 분석이 없어요.</h2><p>ChatGPT 음성 모드를 종료한 뒤 채팅에 “오늘 수업 저장”을 입력하세요.</p></section>}</section>
  </div>;
}

function Metric({ Icon, label, value, suffix, detail }: { Icon: typeof Timer; label: string; value: string; suffix?: string; detail: string }) { return <article className="metric-card"><Icon size={20}/><p>{label}</p><strong>{value}<small>{suffix}</small></strong><span>{detail}</span></article>; }
function slotLabel(slot: string) { return ({ MORNING_COMMUTE: "출근", LUNCH: "점심", EVENING_COMMUTE: "퇴근", NIGHT_VOICE: "밤 대화" } as Record<string,string>)[slot] || slot; }
