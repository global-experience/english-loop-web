"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Award, ChartNoAxesColumnIncreasing, MessageCircle, Timer } from "lucide-react";
import { SafeQueryClientProvider } from "@/app/providers";
import { useReportQueries, type LearningResult, type LearningProfile } from "@/lib/useReportQuery";

export { type LearningResult, type LearningProfile };

export function ReportView({ active = true }: { active?: boolean }) {
  return (
    <SafeQueryClientProvider>
      <ReportViewContent active={active} />
    </SafeQueryClientProvider>
  );
}

function ReportViewContent({ active = true }: { active?: boolean }) {
  const [days, setDays] = useState<7 | 14>(7);
  const { analytics, reports, learningResults, profile, isLoading, refetchAll } = useReportQueries({
    days,
    active,
  });

  // Pull to refresh event handler
  useEffect(() => {
    const handlePull = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string; done?: () => void }>;
      if (customEvent.detail?.tab === "report") {
        void refetchAll().finally(() => {
          customEvent.detail?.done?.();
        });
      }
    };
    window.addEventListener("loopine:pull-refresh", handlePull);
    return () => window.removeEventListener("loopine:pull-refresh", handlePull);
  }, [refetchAll]);

  const latest = reports[0];
  const practicedLines = learningResults.reduce((sum, item) => sum + item.practiced_line_count, 0);
  const retryLines = learningResults.reduce((sum, item) => sum + item.retry_line_count, 0);
  const frequentMissingWords = Object.entries(
    learningResults
      .flatMap((item) => item.missing_words)
      .reduce<Record<string, number>>((counts, word) => ({ ...counts, [word]: (counts[word] || 0) + 1 }), {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="view-stack">
      <header className="view-title report-title">
        <div>
          <p className="eyebrow">PROGRESS, NOT POINTS</p>
          <h2>점수보다 중요한<br/>실제 사용의 변화.</h2>
        </div>
        <div className="segmented">
          <button className={days === 7 ? "active" : ""} onClick={() => setDays(7)}>7일</button>
          <button className={days === 14 ? "active" : ""} onClick={() => setDays(14)}>14일</button>
        </div>
      </header>

      {isLoading ? (
        <ReportSkeleton />
      ) : (
        <div className="report-content-enter">
          {analytics && (
            <>
              <section className="metric-grid">
                <Metric Icon={MessageCircle} label="자발적 사용률" value={`${analytics.target_expression_usage.spontaneous_rate}%`} detail={`${analytics.target_expression_usage.spontaneous}/${analytics.target_expression_usage.tracked} 표현`}/>
                <Metric Icon={Timer} label="총 학습 시간" value={`${analytics.total_study_minutes}`} suffix="분" detail={`${days}일 누적`}/>
                <Metric Icon={Award} label="새로 MASTERED" value={`${analytics.newly_mastered}`} suffix="개" detail="반복 성공"/>
                <Metric Icon={ChartNoAxesColumnIncreasing} label="발화 일치도" value={analytics.speech.average_match == null ? "—" : `${analytics.speech.average_match}`} suffix={analytics.speech.average_match == null ? undefined : "점"} detail={analytics.speech.average_improvement == null ? `따라 말하기 ${analytics.speech.attempts}회` : `${analytics.speech.average_improvement > 0 ? "+" : ""}${analytics.speech.average_improvement}점 · ${analytics.speech.attempts}회`}/>
                <Metric Icon={MessageCircle} label="연습한 자막" value={`${practicedLines}`} suffix="개" detail={`다시 말할 문장 ${retryLines}개`}/>
              </section>

              {profile?.data_quality && (
                <section className="latest-report">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">AI PERSONALIZATION</p>
                      <h2>내 학습 정보 연결 상태</h2>
                    </div>
                    <strong>{profile.data_quality.confidence}</strong>
                  </div>
                  <p>근거 {profile.data_quality.evidence_count}건 · 음성 {profile.data_quality.speech_attempts_14d}회 · 피드 {profile.data_quality.feed_events_14d}건 · 코치 리포트 {profile.data_quality.coach_reports}개</p>
                  <div className="compact-list">
                    <article>
                      <span className="status-dot"/>
                      <div>
                        <strong>ChatGPT {profile.integration?.latest_coach_session?.status || "NOT_STARTED"}</strong>
                        <small>컨텍스트 {profile.integration?.latest_coach_session?.context_version || profile.profile_version} · 분석 근거 {profile.integration?.latest_coach_session?.report_evidence_count || 0}건</small>
                      </div>
                    </article>
                    {profile.recommended_actions?.map((item) => (
                      <article key={`${item.type}-${item.title}`}>
                        <span className="status-dot warning"/>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.reason}</small>
                        </div>
                      </article>
                    ))}
                    {profile.content_preferences?.top_channels?.slice(0, 3).map((item) => (
                      <article key={item.channel}>
                        <span className="status-dot"/>
                        <div>
                          <strong>{item.channel}</strong>
                          <small>학습 열기 {item.opens}회 · 저장 {item.saves}회</small>
                        </div>
                      </article>
                    ))}
                  </div>
                  {(profile.integration?.unfinished_sessions ?? 0) > 0 && (
                    <p className="muted-copy">저장되지 않은 ChatGPT 세션이 {profile.integration?.unfinished_sessions}개 있어요.</p>
                  )}
                </section>
              )}

              <section className="routine-chart">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">ROUTINE CONSISTENCY</p>
                    <h2>루틴 완료율</h2>
                  </div>
                </div>
                {Object.entries(analytics.routine).map(([slot, stat]) => (
                  <div className="bar-row" key={slot}>
                    <span>{slotLabel(slot)}</span>
                    <div><i style={{ width: `${stat.completion_rate}%` }}/></div>
                    <strong>{stat.completion_rate}%</strong>
                  </div>
                ))}
              </section>

              <section>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">14-DAY WEAKNESSES</p>
                    <h2>반복 취약점</h2>
                  </div>
                </div>
                <div className="weakness-list">
                  {analytics.weaknesses.length ? (
                    analytics.weaknesses.map((item) => (
                      <article key={item.category}>
                        <div>
                          <strong>{item.category.replaceAll("_", " ")}</strong>
                          <p>{item.description_ko}</p>
                        </div>
                        <span className={`trend ${item.trend.toLowerCase()}`}>
                          {item.trend === "IMPROVING" ? <ArrowDownRight/> : item.trend === "WORSENING" ? <ArrowUpRight/> : "—"}{item.trend}
                        </span>
                        <small>{item.occurrence_count}회 · 심각도 {item.average_severity}</small>
                      </article>
                    ))
                  ) : (
                    <p className="muted-copy">분석 리포트가 쌓이면 최근 추세를 비교합니다.</p>
                  )}
                </div>
              </section>
            </>
          )}

          <section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">LEARNING WORKSPACE</p>
                <h2>자주 빠진 단어</h2>
              </div>
            </div>
            <div className="compact-list">
              {frequentMissingWords.length ? (
                frequentMissingWords.map(([word, count]) => (
                  <article key={word}>
                    <span className="status-dot warning"/>
                    <div>
                      <strong>{word}</strong>
                      <small>따라 말하기에서 {count}회 누락</small>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted-copy">따라 말하기 결과가 쌓이면 자주 빠지는 단어를 보여줘요.</p>
              )}
            </div>
          </section>

          <section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">LATEST VOICE REPORT</p>
                <h2>오늘 음성 수업 분석</h2>
              </div>
            </div>
            {latest ? (
              <article className="latest-report">
                <p>{latest.summary_ko}</p>
                <div className="report-scores">
                  {Object.entries(latest.scores).map(([key, value]) => (
                    <span key={key}>
                      <small>{key}</small>
                      <strong>{value}/5</strong>
                    </span>
                  ))}
                </div>
                <h3>가장 먼저 다시 말할 문장</h3>
                {latest.corrections.slice(0, 2).map((item) => (
                  <div className="report-correction" key={item.original}>
                    <s>{item.original}</s>
                    <strong>{item.corrected}</strong>
                  </div>
                ))}
                <h3>다음 집중 항목</h3>
                <ul>{latest.next_focus.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            ) : (
              <section className="empty-state compact">
                <h2>아직 저장된 수업 분석이 없어요.</h2>
                <p>ChatGPT 음성 모드를 종료한 뒤 채팅에 “오늘 수업 저장”을 입력하세요.</p>
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="report-skeleton-group" role="status" aria-busy="true" aria-live="polite" data-testid="report-skeleton">
      <span className="sr-only">리포트 데이터를 불러오는 중입니다...</span>

      {/* 1. Metric Grid Skeleton (5 cards with lateral shimmer wave) */}
      <section className="metric-grid" aria-hidden="true">
        <article className="metric-card skeleton-shimmer skeleton-card-acid">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-60 h-lg" />
          <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-50 h-lg" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-40 h-lg" />
          <div className="report-skeleton-line w-35 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer skeleton-card-ink">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-40 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-50 h-lg" />
          <div className="report-skeleton-line w-60 h-xs" style={{ marginTop: "auto" }} />
        </article>
        <article className="metric-card skeleton-shimmer">
          <div className="report-skeleton-icon" />
          <div className="report-skeleton-line w-45 h-xs" style={{ marginTop: "12px", marginBottom: "3px" }} />
          <div className="report-skeleton-line w-40 h-lg" />
          <div className="report-skeleton-line w-55 h-xs" style={{ marginTop: "auto" }} />
        </article>
      </section>

      {/* 2. AI Personalization Skeleton */}
      <section className="latest-report skeleton-shimmer skeleton-dark" aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-50 h-md" />
          </div>
          <div className="report-skeleton-badge" />
        </div>
        <div className="report-skeleton-line w-75 h-xs" style={{ margin: "14px 0 16px" }} />
        <div className="compact-list" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <article style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="status-dot skeleton-dot dark" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-40 h-sm" />
              <div className="report-skeleton-line w-60 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
          <article style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="status-dot skeleton-dot dark" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-45 h-sm" />
              <div className="report-skeleton-line w-65 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
        </div>
      </section>

      {/* 3. Routine Consistency Skeleton */}
      <section className="routine-chart skeleton-shimmer skeleton-routine" aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-40 h-md" />
          </div>
        </div>
        {[65, 80, 45, 70].map((width, idx) => (
          <div className="bar-row" key={idx}>
            <div className="report-skeleton-line w-80 h-xs" />
            <div className="skeleton-bar-track">
              <div className="skeleton-bar-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="report-skeleton-line w-70 h-xs" style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </section>

      {/* 4. Weakness Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-35 h-md" />
          </div>
        </div>
        <div className="weakness-list">
          <article className="skeleton-shimmer">
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-35 h-sm" />
              <div className="report-skeleton-line w-65 h-xs" style={{ marginTop: "7px" }} />
            </div>
            <div className="report-skeleton-line w-20 h-xs" />
          </article>
        </div>
      </section>

      {/* 5. Missing Words Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-30 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-40 h-md" />
          </div>
        </div>
        <div className="compact-list">
          <article className="skeleton-shimmer">
            <span className="status-dot skeleton-dot" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-25 h-sm" />
              <div className="report-skeleton-line w-45 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
          <article className="skeleton-shimmer">
            <span className="status-dot skeleton-dot" />
            <div style={{ flex: 1 }}>
              <div className="report-skeleton-line w-30 h-sm" />
              <div className="report-skeleton-line w-50 h-xs" style={{ marginTop: "6px" }} />
            </div>
          </article>
        </div>
      </section>

      {/* 6. Voice Report Skeleton */}
      <section aria-hidden="true">
        <div className="section-heading">
          <div>
            <div className="report-skeleton-line w-35 h-xs" style={{ marginBottom: "6px" }} />
            <div className="report-skeleton-line w-45 h-md" />
          </div>
        </div>
        <article className="latest-report skeleton-shimmer skeleton-dark">
          <div className="report-skeleton-line w-90 h-sm" />
          <div className="report-skeleton-line w-65 h-sm" style={{ marginTop: "8px" }} />
          <div className="report-scores">
            {[1, 2, 3, 4].map((i) => (
              <span className="skeleton-score-box" key={i}>
                <div className="report-skeleton-line w-50 h-xs" />
                <div className="report-skeleton-line w-70 h-sm" style={{ marginTop: "5px" }} />
              </span>
            ))}
          </div>
          <div className="report-skeleton-line w-35 h-xs" style={{ marginTop: "20px", marginBottom: "10px" }} />
          <div className="report-correction">
            <div className="report-skeleton-line w-55 h-xs" />
            <div className="report-skeleton-line w-70 h-sm" style={{ marginTop: "6px" }} />
          </div>
        </article>
      </section>
    </div>
  );
}

function Metric({ Icon, label, value, suffix, detail }: { Icon: typeof Timer; label: string; value: string; suffix?: string; detail: string }) { return <article className="metric-card"><Icon size={20}/><p>{label}</p><strong>{value}<small>{suffix}</small></strong><span>{detail}</span></article>; }
function slotLabel(slot: string) { return ({ listen: "듣기", shadowing: "쉐도잉", recall: "떠올리기", record: "녹음", review: "복습", ai_conversation: "AI 대화", free_study: "자유 학습" } as Record<string,string>)[slot] || slot; }


