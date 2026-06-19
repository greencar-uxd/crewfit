/* ============================================================
   슈퍼리치키드 하계 MT — 설정 & 초기 데이터
   이 파일만 고치면 명단·일정·공지·준비물·역 목록 등을 바꿀 수 있어요.
   ============================================================ */
window.SRK_CONFIG = {

  /* ── 1) Firebase (실시간 동기화) ──────────────────────────── */
  firebase: {
    apiKey: "AIzaSyDBKcVMjKluqmeahRcZJcxrEfY_BmrsjfA",
    authDomain: "srk-mt.firebaseapp.com",
    databaseURL: "https://srk-mt-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "srk-mt",
    appId: "1:1080501646167:web:88abf17460342d6e260412"
  },

  /* ── 1-2) Cloudinary (사진 저장) ───────────────────────────────
     비워두면 사진 탭이 '연결 안내'만 표시. README의 'Cloudinary 연결'
     절차대로 아래 2개를 채우면 앱 내 업로드/다운로드가 켜집니다.
     (원본 사진은 Cloudinary에 저장, 우리 DB엔 URL만 — 용량 절약) */
  cloudinary: {
    cloudName: "dpv6iqkfu",
    uploadPreset: "ml_default"   // Unsigned 프리셋 (검증 완료 · srk-mt 폴더로 저장)
  },

  /* ── 1-3) 미디어 자동 축소 (업로드 전 브라우저에서) ──────────────
     사진은 올리기 전에 자동으로 줄여서 용량을 아낍니다(영상은 미적용 —
     영상은 Cloudinary 프리셋의 incoming transformation으로 서버 축소 권장). */
  media: {
    resizeImages: true,   // false면 원본 그대로 업로드
    maxImageDim: 2048,    // 사진 긴 변 최대 px
    imageQuality: 0.82    // JPEG 품질 (0~1)
  },

  /* ── 2) 여행 정보 ─────────────────────────────────────────── */
  trip: {
    title:    "슈퍼리치키드 하계 MT",
    subtitle: "",
    carCapacity: 5,
    startDate: "2026-06-27",
    endDate:   "2026-06-28",
    location: "일영랜드",
    address:  "경기 양주시 장흥면 일영로502번길 222-68",
    lodging:  "양주전원주택체험 (별장·침실 3개·★4.74) · 기준 16인 / 참석 16명",
    note:     "",
    poolFee:  17000,
    heroImage: "",   /* 홈 히어로 배경 이미지 URL — 앱 안에서 운영진이 변경(Cloudinary 연결 시) */
    airbnbUrl: "https://www.airbnb.co.kr/rooms/13856178"
  },

  /* ── 2-2) 일정 목록 — 상위(허브) 페이지의 카드 ───────────────────
     상위 페이지에서 카드로 보여줄 우리 크루의 일정들.
       kind: "app"  → 카드를 누르면 실시간 MT 앱(홈/투표/카풀/앨범/마이)으로 입장
       kind: "info" → 카드를 누르면 읽기전용 일정 상세 페이지로 이동
     크루가 앱 안에서 '일정 추가하기'로 만든 카드는 DB(sessions)에 따로 저장돼요.
     accent: red / blue / green / purple / orange (카드·배너 색) */
  clubs: [
    { id: "srk", name: "슈퍼리치키드", sport: "climbing", emoji: "🧗", accent: "red", desc: "클라이밍 크루 — MT·원정·정기 모임" },
    { id: "jrd", name: "지리아드", sport: "billiards", emoji: "🎱", accent: "blue", desc: "그린카 당구 크루",
      roster: [
        { id: "m17", name: "강민관", role: "manager" },
        { id: "jrd01", name: "정종욱" }, { id: "jrd02", name: "조민호" }, { id: "jrd03", name: "진익영" },
        { id: "jrd04", name: "김경호" }, { id: "jrd05", name: "김규식" }, { id: "jrd06", name: "김보성" },
        { id: "jrd07", name: "김성준" }, { id: "jrd08", name: "김유현" }, { id: "jrd09", name: "김정수" },
        { id: "jrd10", name: "문영건" }, { id: "jrd11", name: "박수홍" }, { id: "jrd12", name: "배지현" },
        { id: "jrd13", name: "서지유" }, { id: "jrd14", name: "왕건모" }, { id: "jrd15", name: "이순란" },
        { id: "jrd16", name: "이정걸" }, { id: "jrd17", name: "이진주" }, { id: "jrd18", name: "장정우" }
      ] },
    { id: "gp", name: "그린 포인트", sport: "general", emoji: "🟢", accent: "green", desc: "그린카 그린 포인트 멤버",
      roster: [
        { id: "m17", name: "강민관", role: "manager" },
        { id: "jrd01", name: "정종욱" }, { id: "jrd02", name: "조민호" }, { id: "jrd05", name: "김규식" },
        { id: "jrd08", name: "김유현" }, { id: "jrd10", name: "문영건" }, { id: "jrd16", name: "이정걸" },
        { id: "gp01", name: "송태성" }, { id: "gp02", name: "이선진" }, { id: "gp03", name: "조연진" }, { id: "gp04", name: "추연덕" }
      ] }
  ],
  sessions: [
    {
      id: "summer-mt",
      clubId: "srk",
      kind: "app",
      category: "MT·여행",
      memberIds: ["m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08", "m09", "m10", "m12", "m13", "m14", "m15", "m16", "m17"],  // 정산 고정: 신규 멤버 추가해도 이 16명으로 분할 유지
      emoji: "🏖️",
      accent: "red",
      title: "슈퍼리치키드 하계 MT",
      subtitle: "수영장 · 바베큐 · 게임",
      startDate: "2026-06-27",
      endDate: "2026-06-28",
      location: "일영랜드",
      lodging: "양주전원주택체험",
      summary: "양주 1박 2일 — 수영장에서 놀고, 바베큐에 사회인 체육대회까지."
    },
    {
      id: "dws-2026",
      clubId: "srk",
      kind: "app",
      category: "대회·시합",
      memberIds: ["m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08", "m09", "m10", "m12", "m13", "m14", "m15", "m16", "m17"],  // 정산 고정
      emoji: "🧗",
      accent: "blue",
      title: "슈퍼리치키드 딥워터솔로잉 원정",
      subtitle: "DWS 클라이밍 + 강촌",
      startDate: "2026-07-25",
      endDate: "2026-07-26",
      location: "춘천 송암스포츠타운",
      address: "강원 춘천시 송암동 64-13",
      lodging: "엘리시안 강촌 리조트",
      summary: "춘천 1박 2일 — 로프 없이 물 위 암벽을 오르는 딥워터솔로잉 대회 원정.",
      app: { carCapacity: 7 },   // 카니발(운전자 포함 정원)
      /* 일정 콘텐츠 시드 — 카톡(2026.5.31~6.16)·노션 기반. s/dws-2026 가 비어 있을 때 1회만 심어짐 */
      seed: {
        participants: ["m13", "m07", "m09", "m10", "m14", "m17"], // 백성흠·이은산·이시윤·으네·박설·강민관 (6인)
        notices: [
          { by: "m13", pinned: true,
            text: "🧗 2026 딥워터솔로잉 원정 — 7/25(토)~26(일) 1박 2일!\n6명 전원 개인참가 신청·입금·확정 완료 🎉 뜨거운 도전 함께해요!",
            link: "https://mini-gwany.notion.site/2026-7-25-26-3804b2af4cf2816eaafafa94cfe49a29" },
          { by: "m17", pinned: true,
            text: "🏠 숙소: 엘리시안 강촌 리조트 예약 완료! (임직원 할인 적용)\n패밀리형[룸온리] 30평 1실 · 체크인 7/25 15:00 / 체크아웃 7/26 11:00. 패키지에 수영장 2인 포함이라고 하네요 ㅎㅋ",
            link: "https://kko.to/4VMlTQBiQs" },
          { by: "m17",
            text: "🚗 차량: 카니발 한 대로 다같이 이동(운전 교대)! 은산이 차는 예비예요.\n[할 일] 7월 임직원 쿠폰으로 카니발 예약 — 강민관" },
          { by: "m10",
            text: "🍫 간식은 제가 쏩니다! 먹고 싶은 거 있으면 편하게 말씀해주세요 ㅎㅎ" },
          { by: "m09",
            text: "🩱 워터레깅스·팬츠 필요하면 안다르 단품 40% 할인 중이에요! (저한테 떨어지는 건 없어요 ㅋㅋ)",
            link: "https://m.andar.co.kr/product/list.html?cate_no=3141" },
          { by: "m13",
            text: "🛟 대회 준비물·유의사항은 공식 안내 꼭 확인!\n우천/폭염/태풍 시 당일 07~10시 기상 기준 10:30 이전에 행사장 SNS로 진행/취소 공지 (폭우 30mm↑·태풍·강풍 시 취소)." }
        ],
        schedule: [
          { day: "2026-07-25", time: "10:00", title: "딥워터솔로잉 대회 (일반참가)", place: "송암스포츠타운", link: "https://www.csclimb.org/event/deep-water-soloing", desc: "주말 10:00~18:00 운영 · 현장 접수·신분확인 후 진행. 떨어지면 물로 입수!" },
          { day: "2026-07-25", time: "15:00", title: "엘리시안 강촌 체크인", place: "엘리시안 강촌 리조트", link: "https://kko.to/4VMlTQBiQs", desc: "패밀리[룸온리] 30평 · 체크인 전후 짐 보관 무료" },
          { day: "2026-07-25", time: "18:00", title: "저녁 & 다같이 놀기", desc: "간식 담당: 으네 🍫 / 수영장·비어가든은 현장 이용" },
          { day: "2026-07-26", time: "11:00", title: "체크아웃" },
          { day: "2026-07-26", time: "12:00", title: "강촌·춘천 둘러보기 (선택)", desc: "레고랜드/남이섬/강촌레일파크/제이드가든 등 — '26일 코스' 투표 참고" }
        ],
        packing: [
          { label: "카니발 렌트 예약 (7월 임직원 쿠폰)", type: "shared", assignee: "m17" },
          { label: "간식 🍫", type: "shared", assignee: "m10" },
          { label: "돗자리 / 캠핑의자 (그늘 휴식용)", type: "shared" },
          { label: "입수복(래쉬가드/워터레깅스) · 아쿠아슈즈", type: "personal" },
          { label: "수영복 (엘리시안 수영장 패키지 포함)", type: "personal" },
          { label: "수건 · 여벌 옷 · 방수백 · 선크림 · 슬리퍼", type: "personal" },
          { label: "칫솔 · 치약 (숙소 미제공)", type: "personal" }
        ],
        polls: [
          { title: "🏨 숙소 정하기 (임직원 할인)",
            desc: "임직원 할인 적용 후보 비교 — 결정: 엘리시안 강촌 ✅ (다같이 떠들고 놀 수 있고, 수영장 2인 포함)",
            type: "single", status: "closed", createdBy: "m17",
            options: ["엘리시안 강촌 (최대 6인 · 인당 약 1만 · 수영장 2인 포함)", "에스턴 호텔 춘천 (2인 객실 3 · 인당 2만)", "브라운도트 남춘천 (3인 객실 2 · 인당 1.5만)"],
            votesByOption: [["m13", "m17", "m10", "m14", "m09", "m07"], [], []] },
          { title: "🗺️ 26일 체크아웃 후 코스는?",
            desc: "대회·1박 끝나고 어디 들렀다 갈까요? 의견 주세요!",
            type: "single", status: "open", createdBy: "m13",
            options: ["레고랜드 코리아", "남이섬", "강촌레일파크 (레일바이크)", "제이드가든", "바로 귀가"] }
        ],
        expenses: [
          { title: "숙소 — 엘리시안 강촌 (지원금·인원추가비 반영 후)", amount: 120558, payer: "m17",
            splitType: "equal", participantsAll: true, category: "숙소",
            note: "숙박 320,558 − 임직원 지원금 250,000 + 인원추가비 50,000 = 120,558 / 6인 균등 = 20,093원" }
        ]
      }
    }
  ],

  /* ── 3) 크루 명단 (role: manager 관리자 / staff 운영진 / 미지정 크루원) ── */
  roster: [
    { id: "m01", name: "김찬우", role: "staff" },
    { id: "m02", name: "최수원", role: "staff" },
    { id: "m03", name: "천재준" },
    { id: "m04", name: "정윤철" },
    { id: "m05", name: "장기범" },
    { id: "m06", name: "이은진" },
    { id: "m07", name: "이은산", role: "staff" },
    { id: "m08", name: "이윤철" },
    { id: "m09", name: "이시윤" },
    { id: "m10", name: "으네" },
    { id: "m12", name: "서다정" },
    { id: "m13", name: "백성흠", role: "staff" },
    { id: "m14", name: "박설" },
    { id: "m15", name: "김태순" },
    { id: "m16", name: "김종민" },
    { id: "m17", name: "강민관", role: "manager" },
    { id: "m18", name: "세운" }, { id: "m19", name: "이창석" }, { id: "m20", name: "전민주" }, { id: "m21", name: "정윤" }
  ],

  /* ── 4) 지하철역 목록 (출발지 선택용) · c = 권역(인접 그룹) ────────
     같은 권역끼리 '인접'으로 보고 카풀 그룹을 추천합니다.
     목록에 없는 역은 인트로에서 직접 입력 가능(권역은 '기타'로 처리). */
  stations: [
    { n: "남영", c: "용산·이태원" }, { n: "이태원", c: "용산·이태원" }, { n: "삼각지", c: "용산·이태원" },
    { n: "숙대입구", c: "용산·이태원" }, { n: "신용산", c: "용산·이태원" }, { n: "용산", c: "용산·이태원" },
    { n: "한강진", c: "용산·이태원" }, { n: "녹사평", c: "용산·이태원" }, { n: "효창공원앞", c: "용산·이태원" },
    { n: "서울역", c: "용산·이태원" }, { n: "회현", c: "용산·이태원" },
    { n: "시청", c: "종로·시청" }, { n: "종각", c: "종로·시청" }, { n: "종로3가", c: "종로·시청" },
    { n: "광화문", c: "종로·시청" }, { n: "을지로입구", c: "종로·시청" }, { n: "안국", c: "종로·시청" }, { n: "충정로", c: "종로·시청" },
    { n: "강남", c: "강남" }, { n: "역삼", c: "강남" }, { n: "선릉", c: "강남" }, { n: "삼성", c: "강남" },
    { n: "논현", c: "강남" }, { n: "신논현", c: "강남" }, { n: "언주", c: "강남" },
    { n: "교대", c: "서초·사당" }, { n: "서초", c: "서초·사당" }, { n: "방배", c: "서초·사당" },
    { n: "사당", c: "서초·사당" }, { n: "이수", c: "서초·사당" }, { n: "양재", c: "서초·사당" },
    { n: "홍대입구", c: "홍대·신촌" }, { n: "합정", c: "홍대·신촌" }, { n: "상수", c: "홍대·신촌" },
    { n: "신촌", c: "홍대·신촌" }, { n: "이대", c: "홍대·신촌" }, { n: "망원", c: "홍대·신촌" },
    { n: "공덕", c: "마포·공덕" }, { n: "마포", c: "마포·공덕" }, { n: "대흥", c: "마포·공덕" }, { n: "디지털미디어시티", c: "마포·공덕" },
    { n: "성수", c: "성수·건대" }, { n: "건대입구", c: "성수·건대" }, { n: "뚝섬", c: "성수·건대" },
    { n: "왕십리", c: "성수·건대" }, { n: "구의", c: "성수·건대" },
    { n: "잠실", c: "잠실·송파" }, { n: "잠실새내", c: "잠실·송파" }, { n: "석촌", c: "잠실·송파" },
    { n: "송파", c: "잠실·송파" }, { n: "가락시장", c: "잠실·송파" }, { n: "문정", c: "잠실·송파" },
    { n: "여의도", c: "여의도·영등포" }, { n: "영등포", c: "여의도·영등포" }, { n: "당산", c: "여의도·영등포" },
    { n: "신길", c: "여의도·영등포" }, { n: "노량진", c: "여의도·영등포" }, { n: "대방", c: "여의도·영등포" },
    { n: "목동", c: "강서·목동" }, { n: "오목교", c: "강서·목동" }, { n: "발산", c: "강서·목동" },
    { n: "마곡", c: "강서·목동" }, { n: "화곡", c: "강서·목동" }, { n: "까치산", c: "강서·목동" },
    { n: "구로", c: "구로·금천" }, { n: "신도림", c: "구로·금천" }, { n: "가산디지털단지", c: "구로·금천" },
    { n: "구로디지털단지", c: "구로·금천" }, { n: "대림", c: "구로·금천" },
    { n: "봉천", c: "관악·신림" }, { n: "신림", c: "관악·신림" }, { n: "서울대입구", c: "관악·신림" }, { n: "낙성대", c: "관악·신림" },
    { n: "노원", c: "노원·도봉" }, { n: "창동", c: "노원·도봉" }, { n: "수유", c: "노원·도봉" },
    { n: "미아", c: "노원·도봉" }, { n: "쌍문", c: "노원·도봉" },
    { n: "성신여대입구", c: "성북·동대문" }, { n: "한성대입구", c: "성북·동대문" }, { n: "길음", c: "성북·동대문" },
    { n: "고려대", c: "성북·동대문" }, { n: "동대문", c: "성북·동대문" }, { n: "청량리", c: "성북·동대문" }, { n: "제기동", c: "성북·동대문" }
  ],

  /* ── 5) 초기 데이터 (DB가 비어 있을 때 1번만 심어집니다) ─────── */
  seed: {
    notices: [
      { by: "m01", pinned: true,
        text: "🏠 숙소: 양주전원주택체험 (별장·양주시·침실 3개·★4.74). 기준 16인 / 참석 16명이라 +1명만큼 아늑할 수 있어요 ❤️\nhttps://www.airbnb.co.kr/rooms/13856178" },
      { by: "m01",
        text: "🛟 수영장 이용 안전수칙\n• 머리 덮는 모자 필수 (야구모자·썬캡·두건 등)\n• 유리병 음료·주류 반입 금지 (캔 OK)\n• 혼잡 시 큰 튜브는 안전요원 판단에 따라 제한\n• 수영복·나일론 반바지/반팔/래쉬가드 OK (면 소재 불가)\n• 신장 120cm 이하는 성인풀 제한 / 가슴 넘는 물엔 구명조끼+보호자 동반\n• 우천시 정상영업, 천재지변 운영불가 시 전액 환불" },
      { by: "m01",
        text: "🏖️ 수영장 평상 3개 예약 완료 (1평상 6인). 입장권은 현장에서 인당 17,000원 별도 구매입니다!" },
      { by: "m01",
        text: "🎁 선물 증정식: 합계 1만원 내외로 '진짜 선물' + '쓸데없는 선물' 각 1개씩! 내용물 안 보이게 포장해오기." },
      { by: "m17",
        text: "🚩 현수막 주문 완료했습니다!" }
    ],
    schedule: [
      { day: "2026-06-27", time: "11:00", title: "식당 집결 · 식사", place: "카루소 (한식)", link: "https://naver.me/xM51htvp", desc: "양주시 장흥면 일영로 403 · 청국장·쭈삼 맛집 (09시 오픈)" },
      { day: "2026-06-27", time: "12:00", title: "간식·음료 구매 후 수영장 입장", place: "일영랜드 수영장", link: "https://naver.me/x0OO0Iri", desc: "입장권 현장 별도 (인당 17,000원)" },
      { day: "2026-06-27", time: "16:00", title: "수영 종료" },
      { day: "2026-06-27", time: "17:30", title: "마트 장보기 & 숙소 체크인", place: "양주전원주택체험 (펜션)", link: "https://www.airbnb.co.kr/rooms/13856178", desc: "별장·침실 3개·★4.74 / 기준 16인" },
      { day: "2026-06-27", time: "20:30", title: "저녁식사 마무리 후 본격적으로 놀기" },
      { day: "2026-06-28", time: "11:00", title: "체크아웃" },
      { day: "2026-06-28", time: "12:30", title: "아점 (순두부)", place: "연곡리 순두부", link: "https://naver.me/FHOoMk0T", desc: "" },
      { day: "2026-06-28", time: "13:00", title: "커피", place: "레드버치", link: "https://naver.me/IFE9m03O", desc: "" },
      { day: "2026-06-28", time: "13:30", title: "해산" }
    ],
    packing: [
      { label: "블루투스 마이크 / 스피커", type: "shared", assignee: "m17" },
      { label: "사회인 체육대회 게임 물품", type: "shared", assignee: "m03" },
      { label: "버물리 · 에프킬라 (벌레 대비)", type: "shared" },
      { label: "현수막", type: "shared", assignee: "m17", done: true },
      { label: "바베큐 소세지 (브라이 리퍼블릭)", type: "shared", assignee: "m13" },
      { label: "게임 · 놀이 준비", type: "shared", assignee: "m09" },
      { label: "🎁 진짜 선물 1개 (1만원 내외)", type: "personal" },
      { label: "🎁 쓸데없는 선물 1개", type: "personal" },
      { label: "수영복 · 수건", type: "personal" },
      { label: "세면도구 · 개인약", type: "personal" }
    ],
    polls: [
      { title: "🚗 차량 편성 — 운전 가능하신 분?",
        desc: "본인 차로 운전 가능하면 '운전 가능'을, 탑승만 하면 '탑승'을 골라주세요. 자세한 배차는 [카풀] 탭에서!",
        type: "single", status: "open", createdBy: "m07",
        options: ["운전 가능 🚗 (차 있음)", "탑승할게요 🙋"] },
      { title: "✅ 최종 참석 확인",
        desc: "예약 최종 확인 중이에요. 참석 여부가 바뀐 분은 오늘 중으로 알려주세요!",
        type: "single", status: "open", createdBy: "m01",
        options: ["참석합니다 🙆", "아쉽지만 불참 🙏"] }
    ],
    expenses: [
      { title: "수영장 평상 3개", amount: 90000, payer: "m01",
        splitType: "equal", participantsAll: true,
        category: "액티비티", note: "1평상 6인 × 3개" }
    ]
  }
};
