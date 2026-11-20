# 버프 숫자 원본과 판독 데이터

- 시간 숫자 원본: `UI.wz/UIWindow2.img/SkillCooldownNumber/1`, `/2`
- 실제 보관 파일: `wz/ui/_Canvas/_Canvas_011.wz`
- `buff_time_1`: 0~9 및 콜론, 원본 높이 12px.
- `buff_time_2`: 0~9 및 콜론, 원본 높이 13px.
- `count_0.png`~`count_9.png`: 예인 수량 숫자. 색상, 그림자, 투명도를 포함해 비교합니다.
- 원본 PNG의 크기와 투명도를 유지했습니다. 두 시간 글꼴이 게임의 작은/크게 설정에 각각 대응하는지는 확인되지 않았습니다.
- 판독 코드에 연결됨: `js/data/number-glyphs.js`. 시간 숫자는 여러 배율과 밝기에서 비교하고, 예인 수량은 원본 색상 합성 결과도 비교합니다.
- PNG를 교체한 뒤 `node scripts/build-number-glyphs.mjs`로 판독 데이터를 다시 생성합니다.
- 검증: `node --test tests/*.test.mjs`. 실제 PNG를 아이콘에 합성하고 여러 크기로 변환한 사례를 포함합니다. 실시간 화면 공유 결과는 별도 확인이 필요합니다.