# 작업 지침

[출력 원칙]
- 결론부터. 서론·요약 반복·맺음말 인사 금지.
- 묻지 않은 내용 추가 설명 금지. 확장은 요청받을 때만.
- 만들기 전에 판단: 꼭 필요한가 → 이미 있는 걸 재사용 가능한가
  → 표준 기능으로 되는가 → 그래도 필요하면 최소한만.
- 예시는 1개면 충분. 같은 말 다르게 반복 금지.
- 검증·에러 처리·보안·접근성은 축약 대상에서 제외.

[검증 원칙]
- 팩트 / 추론 / 확인 필요를 구분해 표기.
- 외부 사실은 출처 명시. 근거 없으면 없다고 말할 것.
- 불확실하면 단정 대신 가능 시나리오로.

[진행 원칙]
- 매 단계 확인받지 말고 자율 진행. 막힐 때만 질문.

---

## 이 레포 고유 규칙 (CrewFit)

**구성**
- 메인 앱 크루핏 `/` (동호회 일정·참석·정산·투표·앨범·3쿠션 순위) + 별도 당구 운영관리 앱 gilead `/gilead/`.
- 순수 정적 파일: `index.html`, `app.js`, `config.js`, `styles.css` (+ `gilead/index.html`). 빌드 단계 없음(바닐라 JS IIFE, Firebase compat SDK).
- 데이터: Firebase Realtime Database(프로젝트 `srk-mt`, asia-southeast1). 크루핏=루트, gilead=`/gilead` 경로. **두 앱이 같은 DB를 공유**해서 회비·수지 등이 연동됨.
- 사진·영상: Cloudinary(cloudName `dpv6iqkfu`, unsigned preset `ml_default`). 파일은 Cloudinary, URL·메타데이터만 Firebase에 저장.

**배포**
- **GitHub Pages.** `main` 브랜치 루트 정적 파일이 그대로 `https://greencar-uxd.github.io/crewfit/` 로 서빙(gilead는 `/crewfit/gilead/`). 커스텀 도메인·빌드·CI 배포 없음.
- **`main` 커밋/머지 = 곧 배포**(1~2분 뒤 반영). 커밋 전 배포돼도 되는 상태인지 확인할 것.
- 캐시버스팅: `config.js`/`app.js`/`styles.css`를 `?v=분단위타임스탬프`로 로드. 파일명은 그대로 두고 내용만 수정.
- 반영은 작업 브랜치 → PR → `main` 스쿼시 머지로. `main` 직접 push는 막혀 있음.

**절대 건드리지 말 것**
- `config.js`의 Firebase 설정(projectId `srk-mt`, databaseURL 등)·Cloudinary 설정(cloudName/preset). 바꾸면 데이터·사진 연결이 끊긴다.
- RTDB 경로 구조(`gilead`, `clubmatches`, `members`, `roster`, `clubnotices`, `clubpolls`, `clubdues`, `clubmeta`, `clubrecords`, `photos`, `sessions`, `notifications`, `settings`). **두 앱이 공유**하므로 한쪽만 보고 스키마를 바꾸지 말 것.
- 회원 PIN(`members/<id>/pin`, hashPin salt `srk!`). 초기화·변경 금지 — 개개인이 설정한 값이다.
- `.github/workflows/cloudinary-cleanup.yml` + `scripts/cloudinary_cleanup.py`: 앨범(`srk-gallery` 태그) 사진을 48h 뒤 자동삭제하는 워크플로(아바타/히어로는 태그 없어 영구). 시크릿(`CLOUDINARY_API_KEY`/`SECRET`)은 읽지도 쓰지도 않는다.
- gilead 명단·설정(`ACTIVE`/`GHOST`/`DUES`/`GILEAD_ACTIVE`/`ROSTER_ID`)은 실제 운영 데이터. 사용자 지시 없이 바꾸지 말 것.

**원칙**
- 이 레포가 source of truth. Firebase 콘솔에서 데이터 직접 편집은 지양(운영진이 앱에서 조작하는 게 기준).
- 라이브 Firebase DB는 에이전트가 코드로 직접 쓸 수 없다(권한 밖). 리셋·초기화 등은 인앱 버튼이나 코드 필터로 처리하고, 운영진이 앱에서 눌러야 반영된다.

**반복해서 틀렸던 것**
<!-- 실수할 때마다 여기에 한 줄씩 추가 -->
