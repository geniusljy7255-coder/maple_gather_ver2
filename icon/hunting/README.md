# 자동 인식 기준 이미지

- `rune-normal.png`: 기본 룬 버프
- `rune-blessed.png`: 축복의 룬 버프 (확장자가 png여도 실제 WebP 데이터는 브라우저가 디코딩)
- `rune-cooldown.png`: 룬 재사용 대기 아이콘
- `reference-game.png`: 제공된 1368×800 실제 게임 캡처, 회귀 테스트용 원본

게임 화면의 룬 표식과 조각 아이콘은 실제 원본에서 추출하여 `js/data/monitor-reference.js`에 포함했습니다.
실행 시 기준 스크린샷의 크기 검사나 고정 좌표 추출에 의존하지 않습니다.
경험치/조각 숫자 비교용 실제 글꼴은 `js/data/screen-glyphs.js`에 있습니다.
새 화면 배율/글꼴에서는 추가 검증이 필요합니다.
