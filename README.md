# winClock

Windows에 사용하기 위한 시계 위젯 — MDClock 스타일의 가볍고 예쁜 데스크톱 디지털 시계입니다.

Tauri 2 + 순수 HTML/CSS/JS로 만들어져 실행 파일 약 8MB, 메모리 약 30~40MB로 가볍게 상시 실행할 수 있습니다.

## 주요 기능

### 시계
- **반응형 스케일** — 창 크기를 조절하면 시계가 자동으로 맞춰집니다. 시계 크기 비율(30~100%)도 별도 조절 가능
- **숫자 전환 애니메이션** — 페이드 / 슬라이드 / 플립 (자리별 셀 단위 애니메이션)
- 12/24시간제, 초 표시, 콜론 깜박임 옵션

### 폰트
- **내장 폰트 8종** — 7-Segment LCD(고스트 세그먼트 효과 포함), 14-Segment LCD, Orbitron, Share Tech Mono, Bebas Neue, Rajdhani, Major Mono, Segoe UI
- **시스템 폰트** — PC에 설치된 모든 폰트를 검색해서 선택 가능
- **요소별 지정** — 시간 / 날짜 / D-Day / 일정 폰트를 각각 다르게 설정

### 색상
- 시간·날짜용 7가지 발광 테마 (LCD 그린, 앰버, 시안, 화이트, 레드, 퍼플, 핑크)
- D-Day·일정용 보조 색상 8가지 (기본: 회색)
- 배경 불투명도 조절 (투명 창)

### 날짜 · D-Day · 일정
- **날짜 형식 10종** — `2026년 8월 2일 일요일`, `2026-08-02`, `08-02`, 영어 형식 등
- **D-Day** — 이벤트 등록 시 `D-30 / D-DAY / D+5` 형태로 표시 (최대 3개)
- **Google 캘린더 연동** — iCal 비공개 주소(ICS)를 여러 개 등록하면 다가오는 일정(8일 이내)을 시계 아래 표시
  - 30분 자동 갱신, 반복 일정(매일/매주/매월/매년) 전개, 캘린더별 색 점 구분
  - OAuth·로그인 불필요, 주소는 로컬에만 저장
- D-Day / 일정 각각 보이기·숨기기 토글

### 창 · 시스템
- 프레임 없는 투명 창, 드래그로 이동, 가장자리 드래그로 크기 조절
- **우클릭 메뉴** — 설정/항상 위/최소화/닫기 (작은 창에서는 호버 버튼 대신 사용)
- 항상 위에 고정(📌), 최소화, Windows 시작 시 자동 실행
- 모든 설정은 자동 저장(localStorage)

## 설치

[Releases](https://github.com/hierru/winClock/releases)에서 `winClock_x.x.x_x64-setup.exe`를 받아 실행하세요.
사용자 계정 단위 설치라 관리자 권한이 필요 없습니다. (요구 사항: Windows 10/11 + WebView2 — Windows 11에는 기본 내장)

## Google 캘린더 연동 방법

1. [Google 캘린더](https://calendar.google.com) → ⚙ 설정 → 왼쪽 "내 캘린더의 설정"에서 캘린더 선택
2. **캘린더 통합** 섹션의 **"iCal 형식의 비공개 주소"** 복사 (`private-...`가 들어간 주소)
3. winClock 설정 ⚙ → Google 캘린더에 붙여넣고 **추가**

> 회사(Workspace) 계정은 관리자가 외부 공유를 제한한 경우 비공개 주소가 보이지 않을 수 있습니다.

## 개발

```bash
npm install
npm run dev        # Tauri 개발 모드
```

UI만 빠르게 확인하려면 `src/`를 아무 정적 서버로 서빙하면 됩니다 (Tauri 전용 기능은 브라우저에서 비활성화).

```bash
npm run build      # 릴리스 빌드: src-tauri/target/release/bundle/nsis/*.exe
```

### 구조

```
src/               프론트엔드 (index.html, styles.css, main.js, fonts/)
src-tauri/         Tauri 셸
  ├─ src/main.rs   Rust 명령: fetch_ics(캘린더), list_system_fonts, autostart
  ├─ tauri.conf.json
  └─ capabilities/ 창 권한
```

- 폰트는 npm 패키지(dseg, @fontsource/*)에서 `src/fonts/`로 복사해 번들합니다 (오프라인 동작)
- 캘린더 fetch는 WebView CORS 제한을 피하기 위해 Rust(reqwest)에서 수행합니다

## 라이선스

[PolyForm Noncommercial 1.0.0](LICENSE) — **비상업적 용도로는 자유롭게** 사용·복사·수정·배포할 수 있으며, **상업적 사용만 제한**됩니다.

번들된 폰트는 각자의 라이선스(SIL Open Font License 등)를 따릅니다: [DSEG](https://github.com/keshikan/DSEG), Orbitron, Share Tech Mono, Bebas Neue, Rajdhani, Major Mono Display (Google Fonts/Fontsource).
