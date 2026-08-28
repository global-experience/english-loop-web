# CSS 구조

`../globals.css`는 이 폴더의 파일을 순서대로 불러오는 진입점입니다. 전역 cascade를 예측할 수 있도록 import 순서를 임의로 바꾸지 않습니다.

- `foundation.css`: 디자인 토큰, reset, 앱 셸, 상단·하단 내비게이션, 공통 상태
- `shared.css`: 버튼, 공통 카드, 빈 상태, 재사용 UI
- `learning.css`: 출근·점심·퇴근 학습, 플레이어, 녹음, 콘텐츠 라이브러리
- `review-report.css`: 복습 카드, 통계, 리포트
- `settings.css`: 프로필, 데이터, 오프라인, Action 설정
- `auth.css`: 스플래시, 로그인, 회원가입
- `responsive.css`: 화면 크기별 레이아웃과 `prefers-reduced-motion`

여러 화면에서 공유하는 selector는 `shared.css`에 두고, 특정 기능에서만 사용하는 selector는 해당 기능 파일에 둡니다.
