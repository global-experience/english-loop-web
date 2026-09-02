# AI 학습 제안 — 후속 구현 설계

현재 학습 워크스페이스에는 AI 제안을 노출하지 않는다. 화면 구조는 고정하고, AI는 아래 실행 값만 추천하는 보조 계층으로 추가한다.

## 입력

- 최근 7일 콘텐츠별 학습 문장 수
- 문장별 반복 횟수와 마지막 재생 속도
- 자막 번역을 본 시점
- STT 비교에서 자주 빠진 단어
- 다시 말하기로 표시된 문장
- 현재 루틴(`MORNING_COMMUTE`, `LUNCH`, `EVENING_COMMUTE`)

## 출력

```json
{
  "summary": "2번 듣고 1번 따라 말해 보세요.",
  "repeat_count": 2,
  "playback_rate": 0.75,
  "transcript_visibility": "HIDDEN_FIRST",
  "speaking_order": "LISTEN_THEN_SPEAK",
  "fallback_used": false
}
```

## 제한

- AI는 화면의 섹션 순서, 버튼 위치, 콘텐츠를 임의로 변경하지 않는다.
- 전문적인 발음·억양 점수를 생성하지 않는다.
- 실패 또는 타임아웃이면 출근 `2회 듣기`, 점심 `1회 듣고 1회 말하기`, 퇴근 `1회 자막 없이 듣기` 기본값을 사용한다.
- 추천 결과는 적용 전 사용자에게 한 문장으로 보여주고 언제든 현재 설정으로 되돌릴 수 있게 한다.

## 권장 API

- `POST /api/learning/recommendation`
- 서버에서 사용자 기록을 조회하고 provider를 호출한다.
- 클라이언트에는 provider API 키를 전달하지 않는다.
- 추천은 짧은 TTL로 캐시하고 동일 세션에서 반복 호출하지 않는다.
