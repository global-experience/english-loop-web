import { expect, test } from "@playwright/test";

const apiBase = process.env.E2E_API_URL || "http://localhost:8000";
const actionKey = process.env.CHATGPT_ACTION_API_KEY || "development-action-key-change-me";

test("content to voice report closed learning loop", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("learner@example.com");
  await page.getByLabel("비밀번호").fill("ChangeMe123!");
  await page.getByRole("button", { name: /로그인/ }).click();
  await expect(page.getByText("오늘의 학습 루틴")).toBeVisible();
  await expect(page.getByText("출근 리스닝")).toBeVisible();

  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token")?.value;
  expect(csrf).toBeTruthy();
  const sessionHeaders = { "Content-Type": "application/json", "X-CSRF-Token": csrf! };
  const expressionsResponse = await page.request.get(`${apiBase}/api/expressions?page_size=5`);
  expect(expressionsResponse.ok()).toBeTruthy();
  const availableExpressions = (await expressionsResponse.json()).items;
  const chosenExpressions = availableExpressions.slice(0, 3);
  expect(chosenExpressions).toHaveLength(3);

  const contentResponse = await page.request.post(`${apiBase}/api/contents`, {
    headers: sessionHeaders,
    data: {
      title: `E2E 직접 등록 콘텐츠 ${Date.now()}`,
      content_type: "AUDIO",
      source_type: "DIRECT_URL",
      source_url: "https://example.com/e2e-audio.mp3",
      level: "B1",
      topic: "프로젝트 설명",
      content_summary_ko: "종단 테스트에서 직접 등록한 공개 URL 콘텐츠",
      duration_seconds: 60,
      copyright_note: "테스트용 URL; 서버 다운로드 없음",
      segments: [{ sequence: 1, start_ms: 0, end_ms: 5000, english_text: "The main challenge was keeping the learning loop small.", korean_meaning: "가장 큰 어려움은 학습 루프를 작게 유지하는 것이었습니다." }],
      expression_ids: chosenExpressions.map((item: { id: string }) => item.id),
    },
  });
  expect(contentResponse.status()).toBe(201);
  const createdContent = await contentResponse.json();

  const planDate = new Date(Date.UTC(2030, 0, 1 + (Math.floor(Date.now() / 1000) % 20_000))).toISOString().slice(0, 10);
  const planResponse = await page.request.post(`${apiBase}/api/daily-plans`, {
    headers: sessionHeaders,
    data: {
      study_date: planDate,
      primary_topic: "등록 콘텐츠로 프로젝트 설명",
      daily_goal_ko: "목표 표현 세 개를 실제 말하기로 연결한다.",
      target_expression_ids: chosenExpressions.map((item: { id: string }) => item.id),
      weakness_categories: ["TENSE"],
      morning_content_id: createdContent.id,
      status: "ACTIVE",
    },
  });
  expect(planResponse.status()).toBe(201);
  expect((await planResponse.json()).activities).toHaveLength(4);

  await page.getByRole("button", { name: "학습" }).click();
  await page.getByRole("tab", { name: "출근" }).click();
  await page.getByRole("button", { name: /영어 대본/ }).click();
  await expect(page.getByText(/What I've been working on|The main challenge was/).first()).toBeVisible();
  for (const count of [1, 2, 3]) {
    await page.getByRole("button", { name: /입 모양 쉐도잉/ }).click();
    await expect(page.getByText(`${count} / 3`)).toBeVisible();
  }
  await page.getByRole("button", { name: /학습 완료/ }).click();

  await page.getByRole("tab", { name: "점심" }).click();
  await page.getByPlaceholder(/영어로 2–3문장/).fill("What I've been working on is an English learning app. The main challenge was connecting listening to speaking. What I learned from that was to keep the loop small.");
  await page.getByPlaceholder(/project · challenge/).fill("learning app · challenge · lesson");
  await page.getByRole("button", { name: /문장 숨기기/ }).click();
  await expect(page.getByPlaceholder(/영어로 2–3문장/)).toHaveClass(/blurred/);
  await page.getByRole("button", { name: /말하기 기록 및 활동 완료/ }).click();
  await expect(page.getByText(/말하기 기록을 저장했어요/)).toBeVisible();

  await page.getByRole("tab", { name: "퇴근" }).click();
  await expect(page.getByText(/출근 때 어려웠던 문장/)).toBeVisible();
  await page.getByRole("button", { name: /학습 완료/ }).click();

  const actionHeaders = { Authorization: `Bearer ${actionKey}`, "Content-Type": "application/json" };
  const start = await page.request.post(`${apiBase}/actions/english-sessions/start`, {
    headers: actionHeaders,
    data: { provider: "CHATGPT" },
  });
  expect(start.ok()).toBeTruthy();
  const context = await start.json();
  const targets = context.daily_plan.target_expressions;
  expect(targets.length).toBeGreaterThanOrEqual(3);

  const usage = targets.slice(0, 5).map((expression: { id: string; canonical_text: string }, index: number) => ({
    expression_id: expression.id,
    expression: expression.canonical_text,
    status: index === 0 ? "USED_SPONTANEOUSLY" : index === 1 ? "USED_WITH_HELP" : "NOT_USED",
    evidence: index === 0 ? `I said: ${expression.canonical_text}` : index === 1 ? "The coach showed a hint." : null,
  }));
  const complete = await page.request.post(`${apiBase}/actions/english-sessions/${context.session_id}/complete`, {
    headers: actionHeaders,
    data: {
      summary_ko: "프로젝트와 학습 루프를 설명하고 목표 표현을 실제 대화에서 사용했다.",
      topics: ["프로젝트", "학습 루프"],
      successful_expressions: [{ expression_id: targets[0].id, expression: targets[0].canonical_text, usage_type: "SPONTANEOUS", evidence: `I said: ${targets[0].canonical_text}` }],
      target_expression_usage: usage,
      corrections: [{ original: "I work on it since one year.", corrected: "I've been working on it for a year.", category: "TENSE", reason_ko: "기간에는 현재완료진행형과 for를 씁니다.", evidence_confidence: "HIGH" }],
      weaknesses: [{ category: "TENSE", description_ko: "기간 표현에서 시제를 혼동함", severity: 3, evidence: ["I work on it since one year."] }],
      scores: { fluency: 3, grammar: 3, vocabulary: 4, comprehension: 4 },
      next_focus: ["현재완료진행형", "for와 since"],
      next_day_plan: { morning_listening_topic: "프로젝트 설명", target_expressions: targets.slice(0, 5).map((item: { canonical_text: string }) => item.canonical_text), lunch_speaking_topic: "최근 만든 기능", night_conversation_topic: "프로젝트 회고" },
      analysis_confidence: "HIGH",
      rubric_version: "1.0",
    },
  });
  expect(complete.ok()).toBeTruthy();
  expect((await complete.json()).saved).toBe(true);

  await page.getByRole("button", { name: "오늘" }).click();
  await page.getByRole("button", { name: /분석 결과 새로고침/ }).click();
  await expect(page.getByText("저장 완료")).toBeVisible();
  await page.getByRole("button", { name: "리포트" }).click();
  await expect(page.getByText("오늘 음성 수업 분석")).toBeVisible();
  await expect(page.getByText(/프로젝트와 학습 루프/)).toBeVisible();
});
