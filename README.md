# 슈퍼리치키드 하계 MT 🧗

크루가 **함께 결정하고(투표) · 함께 정산하는** 모바일 웹 페이지.
카톡방에서 흩어지던 의사결정·정산을 한 링크에 모은다.

- **인트로** — 명단에서 본인 이름 선택 → 출발역(검색/직접입력) + 자차 여부 입력. **이미 입장한 이름은 잠겨** 다른 사람이 도용 불가
- **투표/의사결정** — 후보를 올리고 실시간 투표 + 댓글 (*생성은 운영진만*)
- **정산** — 지출을 1/N 또는 항목별로 분배 → 누가 누구에게 얼마 보낼지 **최소 송금**으로 자동 정리
- **카풀** — 출발역이 가까운(인접 권역) 사람끼리 **가까움** 표시. 운전자 블록에 탑승자를 모집/배치
- **사진·영상** — 앱 안에서 업로드 → 일부/전체 선택 → 일괄 다운로드(zip). 원본은 Cloudinary, DB엔 URL만 (*Cloudinary 연결 필요*)
- **일정 · 공지 · 준비물** — 타임테이블, 공지, 공용/개인 준비물 체크 (*생성은 운영진만*)
- **역할** — 운영진(기본: 김찬우·강민관) / 크루원. 운영진은 다른 운영진을 추가하거나 잘못 입장한 이름을 해제할 수 있음 (헤더의 내 이름 칩 → 운영진 관리)
- **프로필 사진** — 헤더의 내 이름 칩 → 내 프로필에서 본인 아바타를 사진으로 변경 (*Cloudinary 연결 필요*, 자동 축소 적용)

## 폴더 구조

```
srk-mt/
├── index.html     ← 앱 껍데기 (스크립트/스타일 연결)
├── styles.css     ← 디자인 (색·폰트는 :root 변수만 바꿔도 분위기 전환)
├── config.js      ← ★ 명단(운영진 admin)·역 목록·일정·공지·준비물·Firebase 설정 (여기만 고치면 됨)
├── app.js         ← 앱 로직 (정산 엔진·렌더·실시간 동기화). 보통 건드릴 필요 없음
├── deploy.sh      ← GitHub Pages 배포/갱신 스크립트
├── .nojekyll      ← GitHub Pages가 파일을 그대로 서빙하도록
└── README.md
```

## 두 가지 동작 모드

| 모드 | 언제 | 데이터 저장 위치 |
|---|---|---|
| **데모 모드** (기본) | `config.js`의 `firebase`가 비어 있을 때 | 그 브라우저에만 (혼자 미리보기용) |
| **실시간 모드** | `firebase` 값을 채웠을 때 | 클라우드 (20명이 같은 링크로 실시간 공유) |

> 데모 모드로 먼저 화면을 둘러본 뒤, 아래 절차로 Firebase를 연결하면 크루 전체 공유가 켜진다.

---

## 1) Firebase 연결 (실시간 공유 켜기) — 5분

1. <https://console.firebase.google.com> 접속 → **프로젝트 만들기** (이름 예: `srk-mt`). 애널리틱스는 꺼도 됨.
2. 왼쪽 메뉴 **빌드 → Realtime Database** → **데이터베이스 만들기**
   - 위치: `asia-southeast1`(싱가포르) 권장
   - 보안 규칙: 일단 **테스트 모드로 시작** 선택 (아래 3번에서 교체)
3. **규칙(Rules) 탭**에 아래를 붙여넣고 **게시**:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   > 로그인 없는 크루 전용 페이지라 누구나 읽고 쓸 수 있는 규칙이다. 링크를 외부에 공유하지 않는 전제. (보안을 더 원하면 아래 **보안 메모** 참고)
4. 프로젝트 개요(⚙️ → 프로젝트 설정) → **내 앱**에서 **웹 앱 추가**(`</>`) → 표시되는 `firebaseConfig` 값을 복사
5. `config.js`의 `firebase` 칸을 채운다 (특히 `databaseURL`이 비면 실시간 모드가 안 켜짐):
   ```js
   firebase: {
     apiKey: "AIza...",
     authDomain: "srk-mt.firebaseapp.com",
     databaseURL: "https://srk-mt-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "srk-mt",
     appId: "1:...:web:..."
   }
   ```
6. 저장 후 새로고침 → 헤더 배지가 **데모 → LIVE** 로 바뀌면 성공. 처음 한 번 명단·일정·공지가 자동으로 클라우드에 심어진다.

## 1-2) Cloudinary 연결 (사진 업로드/다운로드 켜기) — 약 5분

사진 원본은 Cloudinary(무료, 월 25GB)에 저장하고 우리 DB엔 URL만 둔다 → 용량 부담 없음.

1. <https://cloudinary.com> 무료 가입 (신용카드 불필요).
2. 로그인 후 **대시보드**에 표시되는 **Cloud name**(예: `dxxxxxx`)을 복사.
3. **업로드 프리셋(Unsigned)** 만들기: ⚙️ **Settings → Upload → Upload presets → Add upload preset**
   - **Signing Mode = Unsigned** 로 설정 (필수! 서명 없이 브라우저에서 업로드)
   - (선택) Folder를 `srk-mt`로, 최대 용량/허용 포맷 제한을 걸면 더 안전
   - 저장 후 그 **프리셋 이름**(예: `srk_unsigned`)을 복사

> **용량 아끼기 (중요)**
> - **사진**: 앱이 업로드 전 자동으로 줄여서 올린다(긴 변 2048px·JPEG 0.82 → 보통 80~90% 절감). `config.js`의 `media`에서 끄거나(`resizeImages:false`) 크기/품질을 바꿀 수 있다.
> - **영상**: 브라우저에서 못 줄이므로 **Cloudinary 프리셋에서 서버 축소**를 권장한다. 프리셋 편집 화면의 **Incoming Transformation**에 예: `c_limit,w_1280,q_auto`(영상 720~1280p로 압축 저장)를 넣고, 계정 **Settings → Upload → 최대 파일 크기**를 100MB 등으로 제한한다. 긴 4K 영상은 자제.
4. `config.js`의 `cloudinary` 칸을 채운다:
   ```js
   cloudinary: {
     cloudName: "dxxxxxx",
     uploadPreset: "srk_unsigned"   // 반드시 Unsigned 프리셋
   }
   ```
5. 저장 → 배포(`./deploy.sh`) → **사진** 탭에서 업로드 · 일부/전체 선택 · 일괄 다운로드(zip) 활성화.

> 비워두면 사진 탭은 '연결 안내'만 표시(다른 기능은 정상). Unsigned 프리셋이라 값을 아는 사람은 업로드가 가능하니, 프리셋에 용량/포맷 제한을 걸고 링크는 크루 내에서만 공유한다.

## 2) 배포 (크루에게 링크 공유) — GitHub Pages

```sh
~/.local/bin/gh auth login --web   # GitHub 로그인 (최초 1회)
./deploy.sh                         # 저장소 생성 → push → Pages 켜기 → 링크 출력
```

출력되는 링크(`https://{계정}.github.io/srk-mt/`)를 카톡방에 공유하면 끝.
이후 `config.js` 등을 고치면 `./deploy.sh` 한 번 더 실행 → 1~2분 내 자동 반영.

## 3) 내용 수정 (코드 몰라도 됨)

전부 **`config.js`** 안에서 끝난다.

- **명단 추가/변경** → `roster` 배열 (`id`는 안 겹치게, 예: `m18`)
- **여행 정보** → `trip` (날짜·장소·숙소 링크 등). `startDate`로 홈의 **D-day**가 자동 계산됨
- **초기 일정/공지/준비물/투표/지출** → `seed`

> `seed`는 **DB가 비어 있을 때 딱 1번만** 심어진다. 이미 운영 중인 사이트의 내용을 바꾸려면 `config.js`가 아니라 **사이트 안에서 직접** 추가/수정/삭제하면 된다. (처음부터 다시 심고 싶으면 Firebase Realtime Database의 데이터를 비우고 새로고침)

## 보안 메모 (읽어두면 좋음)

- 이 사이트는 **로그인이 없다.** 이름 선점 잠금·운영진 권한은 **브라우저(UI) 차원**에서 동작한다 — 크루 내 신뢰를 전제로 한 장치다. 개발자 도구나 DB 직접 접근으로는 우회가 가능하므로(오픈 규칙), 링크는 크루 외부에 공유하지 않는다. 더 엄격히 막으려면 Firebase 익명 인증 + 규칙(`auth != null`)을 도입해야 한다.
- public 저장소로 배포되므로 `config.js`의 **명단(이름)과 일정이 공개**된다. 민감 정보(전화번호·계좌 등)는 넣지 말 것.
- Firebase의 `apiKey`는 비밀이 아니다(클라이언트 공개가 정상). 데이터를 지키는 건 **Realtime Database 규칙**이다. 더 잠그고 싶다면: Firebase **익명 인증**을 켜고 규칙을 `".read"/".write": "auth != null"`로 바꾸거나, MT가 끝난 뒤 규칙을 `".write": false`로 바꿔 읽기 전용으로 동결한다.

## 로컬에서 보기 / 여러 기기에서 이어작업

`index.html`을 더블클릭(`file://`)하면 폰트/실시간 모듈 로딩이 막힐 수 있다. 정확히 보려면 간단한 정적 서버로 연다(맥 기본 `python3`만 있으면 됨):

```sh
./serve.sh            # = python3 -m http.server 8000 → http://localhost:8000
```

> **데이터 안전**: localhost·Codespaces·`?demo=1` 에서는 앱이 **자동 데모 모드(localStorage)** 라, 클릭하며 둘러봐도 라이브 크루 데이터(Firebase)를 건드리지 않는다. **프로덕션(`*.github.io`)만 실시간 클라우드.** 개발 중 라이브 데이터를 봐야 하면 URL에 `?live=1`(실데이터 주의).

**원본은 GitHub 레포 하나뿐.** 어디서 작업하든 *고치기 → 커밋 → `git push`* 하면 1~2분 내 라이브 반영(캐시버스팅 자동, `.github/workflows/cache-bust.yml`). `deploy.sh` 없이 push만으로도 배포된다.

- **집 맥북**: `git clone` → `./serve.sh` 로 미리보기 → 커밋/push (최초 1회 `gh auth login` 또는 PAT)
- **모바일·아이패드·아무 맥(브라우저)**: 레포에서 **Codespaces** 생성 → 풀 VS Code + 8000 포트 자동 미리보기(`.devcontainer`)
- **폰에서 빠른 수정**: 레포 페이지에서 **`.` 키**(github.dev) → 편집 → 커밋/push
