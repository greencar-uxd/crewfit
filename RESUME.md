# 크루핏(CREWFIT) — 작업 재개 체크포인트

> 마지막 갱신: 2026-06-18 (사무실 → 집 이어작업용). 집에서는 `git pull` 후 이 파일부터 읽기.

## 지금 상태 (한 줄)
다중 동호회 스포츠 커뮤니티 앱. **라이브 정상 배포 + 모든 변경 푸시 완료.** 사용성 평가(아래 §7) 결과 반영만 남음.

- 라이브: **https://greencar-uxd.github.io/crewfit/**  (저장소 `Greencar-UXD/crewfit`, public — 2026-06-18 srk-mt→crewfit 리네임, 구 `/srk-mt/` 404. **로컬 폴더는 `~/Downloads/srk-mt` 그대로**, git remote는 crewfit.git)
- 동호회 3개: 슈퍼리치키드(클라이밍·SRK), 지리아드(당구), 그린 포인트(일반·종목 미확정)
- 데이터: Firebase Realtime DB(클라우드) ↔ 미설정 시 localStorage 데모 폴백

## 여러 기기에서 이어작업 (집 맥 · 모바일 · 아무 브라우저)
> **원본은 GitHub 레포 하나뿐**(`Greencar-UXD/crewfit`). 어디서 작업하든 흐름은 같다: **고치기 → 커밋 → push → 1~2분 내 라이브 반영**(캐시버스팅 자동, `.github/workflows/cache-bust.yml`). `deploy.sh` 없이도 push만 하면 됨.

| 기기 | 코드 받기 | 미리보기 | 배포 |
|---|---|---|---|
| **집 맥북** | `git clone https://github.com/Greencar-UXD/crewfit.git` | `./serve.sh` → http://localhost:8000 | 커밋 후 `git push` (또는 `./deploy.sh`) |
| **모바일/아이패드/아무 맥 (브라우저)** | **Codespaces**: 레포 → `Code ▸ Codespaces ▸ Create`. 풀 VS Code + 8000 포트 자동 미리보기(`.devcontainer`) | 자동 포워딩된 8000 포트 | 커밋 → push (Codespaces 인증 내장) |
| **폰에서 빠른 한 줄 수정** | 레포 페이지에서 **`.` 키**(또는 github.com → github.dev) | (미리보기 없음 · 텍스트 편집만) | 커밋 → push |

- **안전장치(중요)**: localhost·Codespaces·`?demo=1` 에서는 앱이 **자동 데모 모드(localStorage)** — 둘러봐도 라이브 데이터 안 건드림. **프로덕션(`*.github.io`)만 클라우드.** 개발 중 라이브를 봐야 하면 URL에 `?live=1`(실데이터 주의). 판정: `app.js` Store `useCloud`.
- **집 맥 최초 1회**: git push 인증 필요 → `gh auth login` 또는 GitHub PAT(키체인). Codespaces/github.dev는 인증 내장이라 불필요.
- 맥 기본 `python3`만 있으면 `serve.sh` 동작(node/brew 불필요).

## 재개 방법 / 환경 주의
- 파일: `index.html` / `styles.css` / `config.js`(명단·세션·동호회 시드·Firebase) / `app.js`(스토어·렌더·정산·실력모듈) / `deploy.sh`
- 이 맥엔 **node/brew 없음**. `gh`는 `~/.local/bin`(`export PATH="$HOME/.local/bin:$PATH"`).
- **JS 문법검증**: JXA — `osascript -l JavaScript -e 'var d=$.NSString.stringWithContentsOfFileEncodingError("…/app.js",4,null);try{new Function(ObjC.unwrap(d));"OK"}catch(e){e.message}'`
- **프리뷰**: 이제 `./serve.sh`(localhost) 또는 `?demo=1`이 **자동 데모**라 예전 `/tmp/srk-preview` + `firebase = {}` append 트릭은 불필요. **단, 레포 `config.js`엔 여전히 `firebase = {}` 줄을 절대 넣지 말 것**(클라우드 모드 유지 = 실제 크루 데이터). 안전망으로 배포 전 `grep -c 'firebase = {}' config.js` 가 `0`인지 확인.
- **배포**: `cd ~/Downloads/srk-mt && ./deploy.sh "메시지"` (캐시버스팅 자동, 1~2분 내 반영)
- 편집은 원자적 파이썬 스크립트(`.count()==n` 단언)로 안전하게.

## ⚠️ 절대 깨지면 안 되는 불변식
1. **summer-mt·dws-2026 정산 16분할 고정**: 두 세션 config에 `memberIds`(16명) 있고 `sessionMemberIds()`가 이를 우선. 명단(roster) 늘려도 이 16명으로 분할(평상 90,000÷16=**5,625원**). 함부로 손대지 말 것.
2. **동호회별 roster 격리**: 멤버 id는 전역, 각 club의 `roster`는 부분집합(강민관 m17은 여러 club 공유). 한 동호회 명단이 다른 데 새면 안 됨.
3. **레포 config.js = 클라우드 모드**(위 프리뷰 주의 참고).

## 이번 세션(2026-06-17) 완료 — 전부 배포됨
- 그린 포인트 별개 동호회 분리(지리아드 19 원복), 동호회 카드 뱃지 = 내 자격(관리자/운영진/멤버/미가입), 당구 대대 기준 표기.
- 그림자: "그림자 빼기(먼저) vs 디자인시스템 적용(나중)" → **나중 지시 우선** = 코발트 soft shadow 복원(되돌림).
- **항목1** SRK 카톡 신규 4명(세운 m18·이창석 m19·전민주 m20·정윤 m21) 추가(roster 20). 정산 16고정으로 5,625 불변 검증.
- **항목2·3** 클라이밍(V등급 최고난이도)·러닝(베스트 페이스) 실력 모듈 — sport별 순위 분기, `clubrecords/{clubId}`.
- **항목4** 세션↔순위 연동 — 세션 홈 실력기록 카드 → sessionId 태깅 → 클럽 순위 집계.
- **항목5** 폼 입력값 보존 — 저장 실패 시 같은 폼 입력값 그대로 재오픈 + 경고배너(전 폼).
- **항목6** Cloudinary 48h 자동삭제 — 완료 확인(워크플로 active·Secrets 설정·스케줄 실행 성공).

## 다음 할 일 (집에서 이어서)
1. **§7 사용성 평가 결과 반영** — 워크플로 완료 시 이 문서 하단에 우선순위 이슈가 추가됨. sev1→sev2 순으로 수정.
2. **그린 포인트 종목 확정** — 현재 `sport:"general"`(순위 없음). 당구/러닝 등이면 `config.js` clubs[gp].sport 변경(+이모지).
3. **(조건부) 신규 4명 summer-MT 참석 여부** — 참석이면 정산 분할 재결정 필요(현재 16고정이라 미포함).
4. **장기범(m05)** — 카톡 명단엔 없음. 진짜 탈퇴면 roster에서 제거(정산은 이미 16고정이라 안전).
5. 프로필 사진은 각자 앱 업로드 방식(기능 구현됨). 파일 주면 수동 적용 가능.

## §7 사용성 평가 결과 (워크플로 `wf_ec63dfcd-237` 완료, 8차원·16에이전트)
**집계: sev1 5 / sev2 32 / sev3 7 (총 44).** 단 평가자가 심각도를 다소 부풀림 — 아래는 내 트리아지(코드 재확인) 반영.

### "sev1" 5건 — 트리아지: 진짜 블로커 없음
- **SETL-2**(custom split 검증 실패 시 입력 사라짐) — ❌**오탐**. 검증 실패는 `closeModal` 전에 `return`이라 모달이 안 닫힘 → 입력 보존됨. 데이터 손실 없음.
- **FORM-6**(공지 빈 입력 시 모달 안 유지) — ❌**오탐**. 동일 이유(`if(!v) return;`가 닫기 전).
- **NAV-5**(info 세션 뒤로 목적지) — 검증자 본인이 "히스토리로 동작, 심각도 낮음"으로 정정. 사실상 sev3.
- **SESS-5**(정산 탭 진입 스크롤 위치) — 검증자 "사소함". sev3.
- **GATE-6**(동시 자가입 레이스 메시지 모호) — 진짜지만 희귀(동명 동시가입). 카피 개선 정도.

### 실제로 손볼 가치 있는 것 (우선순위순, 집에서)
1. **RANK-2**: 당구 대전에서 목표(수지) 0 허용 → 승자 판정 무의미. 폼에 목표>0 검증 추가.
2. **GATE-5 / 신규멤버 격리 가시성**: 자가입·신규 멤버가 memberIds 고정 세션(summer/dws)에 안 뜨는데 UI 설명 없음. 안내 한 줄.
3. **NAV-2 / NAV-4**: hubTab(멤버/순위)이 세션 진출입·다른 동호회 선택 시 'schedule'로 강제 리셋. open-club·go-hub에서 보존 검토.
4. **RANK-1 / RANK-6**: 클라이밍 멤버 미선택 무음 실패, 난이도 기본 V0 실수 유발 → 검증·기본값 손질.
5. **검증 실패 UX 통일**: 여러 폼이 `alert()` 또는 무음 → 인라인 에러로 통일(FORM-3/FORM-5/RANK-1/RANK-3). polish.
6. **카피 일관성**: 크루원↔멤버, '미입장'↔'미가입', `.rbadge.admin` 클래스명=운영진 혼동(COPY-1/4/8).
7. **SETL-5**(정산 버튼 금액 vs 통지 금액 불일치 위험) — 돈 관련이라 코드 재확인 권장.
8. 모바일 터치타깃<44px(RESP-2), 모달 오버플로우(RESP-1) 등 반응형 polish.

전체 44건 원본 JSON: 이 머신 `wf_ec63dfcd-237.output` (집 머신엔 없음 — 위 요약이 이관본).

## §8 전체 검증 (지시·사용성·디자인시스템, 워크플로 wf_5542f0a3-fb6)
3트랙 7인스펙터 + 적대검증. **고칠것 40 / 기각 101.** 결론: 기능·지시·사용성은 거의 다 정상. 진짜 손본 것 3개(배포 완료):
- 버튼 `:hover` 추가(`@media (hover:hover)`, PC 폴리시 — 기존 `:active`만 있었음)
- 코발트 정합 토큰 추가: `--dur-fast/base/slow`, `--ease-in-out`, `--fw-*`, `--space-0/12/16/20/24` (가산적·무위험) + 버튼 transition 토큰화
- 자가입 레이스 메시지 카피 개선(GATE-6)
**에이전트 오판으로 안 고친 것**(검증 결과 멀쩡/의도/지시): 포커스링 "없음"=거짓(styles.css:704에 `:focus-visible` 2px focus-ring 있음), AppBar PC 제목숨김·BottomNav→사이드바=형 지시(task #1, PC헤더), Card shadow sm vs md=의도된 위계, 폰트 'Pretendard Variable'=실제 로드폰트(바꾸면 깨질 위험).
**N/A(바닐라 앱이 안 쓰는 DS 컴포넌트 기능)**: Tag 삭제버튼, 정사각 아바타, 애니 체크마크, 전용 IconButton/Divider, Input label/hint/error 구조, chart 팔레트, 풀 타입스케일 토큰 — 필요시만 추가.

## ✅ 형 결정 반영 완료 (2026-06-18)
1. **신규 4명: summer-MT 불참 + 크루핏 가입 + SRK 동호회 접근 부여** → 게이트·입장(inClub)을 `sessionMemberIds` 기준으로 변경. 결과: 4명은 SRK 멤버 탭에 보이고 동호회·**미래 세션**엔 입장 가능, summer-MT·dws(계획된 트립)엔 게이트 미노출(정산 16명·5,625 불변). 로그인한 비참여자가 트립 열면 `gateNotMember`("참여 멤버만 입장") 안내.
2. **장기범(m05): 탈퇴 아님 + MT 참석** → 현행 유지(summer-mt/dws memberIds 16에 포함, 정산 대상). 변경 없음.
→ **미해결 결정 0건.**

## §9 PC 반응형 spacing + DS 정합 2차 (2026-06-18)
- **PC spacing 수정**(직접 리사이즈 검증): 세션 앱 콘텐츠 884→698px(`#app` 980, nav 190), `.seg` 560 캡. 허브는 1200 풀폭 유지. 1680~390 전폭 OK.
- **전체검증 2차**(워크플로): 고칠것 26 → DS 6개 수정(뱃지/태그 pill, 인풋 포커스링, empty-msg radius, 토큰 --accent-soft/--space-7/--info-500). 지시누락 4=형 기결정/오판. N/A=바닐라 미사용 DS 컴포넌트 기능. 이모지=의도.
- **워크플로 행 방지**: gh fetch에 `timeout 25` + 스톨 워치독(저널 mtime 130s 무변화 감지). 1차는 행 걸려 resume로 복구한 이력.
- 남은 선택지(저위험·미적용): gp 종목 확정(현 general), 풀 타입스케일 토큰화 등 — 필요시.
