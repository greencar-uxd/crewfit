/* ============================================================
   슈퍼리치키드 하계 MT — 앱 로직 v2
   - 인트로: 이름 선택(선점 잠금) → 출발역 → 자차 여부
   - 역할: 운영진(admin) / 크루원. 투표·공지·일정·준비물 생성은 운영진만
   - 카풀: 인접 권역 기준으로 운전자 블록에 탑승자 그룹화
   - 데이터: Firebase 실시간 DB (없으면 데모 = localStorage)
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.SRK_CONFIG || {};
  var CATEGORIES = ["액티비티", "식비", "마트/장보기", "숙소", "교통", "기타"];

  /* ---------- 상태 ---------- */
  var DB = {};
  var me = localStorage.getItem("srk_me") || null;
  var MYTOKEN = localStorage.getItem("srk_token") || ("t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  localStorage.setItem("srk_token", MYTOKEN);
  var state = { screen: "clubs", clubId: null, sessionId: "summer-mt", tab: "home", pollId: null, alert: "notice", hubTab: "schedule", boardTab: "notice" };
  var viewHist = [], lastSig = null, backing = false; // 뒤로가기용 화면 히스토리
  var intro = { step: "name", pick: null, car: false, newName: null };
  var booted = false;
  var photoSel = {};      // 선택된 사진 key 맵
  var photoUploading = 0; // 업로드 중인 장수
  var avatarBusy = false; // 프로필 사진 변경 중
  var heroBusy = false;   // 히어로 배경 변경 중

  // 화면 모드: system(기본·OS설정 따름) / light / dark
  function applyTheme(t) { t = t || localStorage.getItem("srk_theme") || "system"; var r = document.documentElement; if (t === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t); }
  applyTheme();

  /* ============================================================
     유틸
     ============================================================ */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function won(n) { return (Math.round(Number(n) || 0)).toLocaleString("ko-KR") + "원"; }
  function clampStr(s, n) { s = String(s == null ? "" : s).trim(); return s.length > n ? s.slice(0, n) : s; }
  // 이미 esc()된 텍스트의 http(s) 링크를 클릭 가능하게 (escape 후 호출 → XSS 안전)
  function linkify(safe) { return String(safe).replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; }); }
  function obj(o) { return o && typeof o === "object" ? o : {}; }
  function entries(o) { return Object.keys(obj(o)).map(function (k) { return [k, o[k]]; }); }
  function bySort(arr, fn) { return arr.slice().sort(function (a, b) { return fn(a) - fn(b); }); }
  var _kc = 0;
  function key() { return "k" + Date.now().toString(36) + (_kc++).toString(36) + Math.random().toString(36).slice(2, 6); }

  function memberName(id) { if (id && intro.newName && id === intro.pick) return intro.newName; var m = obj(DB.members)[id]; if (m && m.name) return m.name; var r = rosterEntry(id); return r ? r.name : (id || "?"); }
  // 위계: manager(관리자) > staff(운영진) > crew(크루원). 레거시 admin:true → staff로 간주
  function roleOf(id) { var m = obj(DB.members)[id] || {}; if (m.role) return m.role; if (m.admin) return "staff"; var r = rosterEntry(id); return (r && r.role) || "crew"; }
  function isManager(id) { return roleOf(id) === "manager"; }
  function canManage(id) { return roleOf(id) !== "crew"; }   // 관리자·운영진 = 관리 권한
  function isAdmin(id) { return canManage(id); }              // (구코드 호환 — 관리권한 여부)
  function isMeAdmin() { return canManage(me); }              // 콘텐츠 생성/관리 가능 여부
  function roleLabel(id) { var r = roleOf(id); return r === "manager" ? "관리자" : r === "staff" ? "운영진" : "크루원"; }
  function roleBadge(id) { var r = roleOf(id); return '<span class="rbadge ' + (r === "manager" ? "mgr" : r === "staff" ? "admin" : "crew") + '">' + roleLabel(id) + "</span>"; }
  function roleTag(id) { return canManage(id) ? roleBadge(id) : ""; } // 운영진/관리자만 배지 표시(크루원은 생략)
  // 4자리 인증번호 해시 (평문 저장 방지용 — 오픈 규칙이라 강력 보안은 아니고 글랜스 방지 수준)
  function hashPin(p) { p = "srk!" + String(p || ""); var h = 5381; for (var i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) >>> 0; return "p" + h.toString(36); }
  function initials(name) {
    name = String(name || "").trim(); if (!name) return "?";
    return name.length >= 3 ? name.slice(-2) : name.slice(0, 2);
  }
  var AV_COLORS = ["#4a505a", "#5a616c", "#6b727d", "#3e444d", "#7a818c", "#545b65", "#656c77", "#474d57"];
  function avColor(id) { var s = String(id || ""), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
  function avText(hex) { var c = String(hex).replace("#", ""); if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2]; var r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16); return (r*299 + g*587 + b*114) / 1000 > 140 ? "#1a1613" : "#fff"; }
  function avatarThumb(u, size) { u = String(u || ""); var px = Math.round((size || 28) * 2); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/c_fill,g_auto,w_" + px + ",h_" + px + ",q_auto,f_auto/") : u; }
  function avatar(id, size) {
    size = size || 28;
    var m = obj(DB.members)[id] || {};
    var st = "width:" + size + "px;height:" + size + "px;";
    if (m.photoUrl) return '<span class="av av-img" style="' + st + '"><img loading="lazy" src="' + esc(avatarThumb(m.photoUrl, size)) + '" alt=""></span>';
    var avbg = avColor(id); return '<span class="av" style="' + st + "font-size:" + Math.round(size * 0.4) + "px;background:" + avbg + ";color:" + avText(avbg) + '">' + esc(initials(memberName(id))) + "</span>";
  }
  function chip(id) { return '<span class="mchip">' + avatar(id, 22) + "<span>" + esc(memberName(id)) + "</span></span>"; }

  /* 라인 스타일 아이콘 시스템 (이모지 대체) */
  function icon(name, size) {
    size = size || 20;
    var P = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
      ballot: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M7.5 12l3 3 6-6.5"/>',
      wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M16 13.5h2.5"/>',
      car: '<path d="M5 11l1.4-3.6A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.9 1.4L19 11"/><rect x="4" y="11" width="16" height="5.5" rx="1.2"/><circle cx="7.6" cy="16.5" r="1.4"/><circle cx="16.4" cy="16.5" r="1.4"/>',
      camera: '<path d="M4 8.5h3l1.4-2h7.2L18 8.5h2A1.5 1.5 0 0 1 21.5 10v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5z"/><circle cx="12" cy="13.5" r="3.3"/>',
      bag: '<path d="M6 8h12a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M9 12.5h6"/>',
      calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><path d="M8.5 3.5v4M15.5 3.5v4"/>',
      megaphone: '<path d="M5 10v4l9 3.5V6.5L5 10z"/><path d="M5 10H4a1.5 1.5 0 0 0 0 3h1"/><path d="M14 9a3.5 3.5 0 0 1 0 6"/>',
      key: '<circle cx="8" cy="14" r="3.2"/><path d="M10.3 11.7 19 3"/><path d="M16 6l2.2 2.2M14.2 7.8 16 9.6"/>',
      theme: '<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" fill="currentColor" stroke="none"/>',
      pin: '<path d="M12 21s6.5-5.2 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.8 12 21 12 21z"/><circle cx="12" cy="10.2" r="2.4"/>',
      user: '<circle cx="12" cy="8" r="3.6"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
      shield: '<path d="M12 3l7 2.5v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V5.5L12 3z"/><path d="M9 12l2 2 4-4.5"/>',
      plus: '<path d="M12 5.5v13M5.5 12h13"/>',
      logout: '<path d="M14.5 8V6.5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V16"/><path d="M19 12H9.5"/><path d="M16 9l3 3-3 3"/>',
      bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.8 5.6 1.8 5.6H4.2S6 14.5 6 10z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
      edit: '<path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
      link: '<path d="M9.5 14.5l5-5"/><path d="M11.5 7.5l1.2-1.2a3.6 3.6 0 0 1 5 5L17.5 12.5"/><path d="M12.5 16.5l-1.2 1.2a3.6 3.6 0 0 1-5-5L7.5 11.5"/>',
      check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
      back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
      mountain: '<path d="M3 19h18L14 6l-4 7-2.5-3L3 19z"/><path d="M14 6l3.5 6"/>',
      play: '<path d="M7 5l11 7-11 7z"/>',
      download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
      compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2z"/>',
      users: '<circle cx="9" cy="8" r="3.1"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.3a3.1 3.1 0 0 1 0 5.4"/><path d="M17.5 13.6a5.5 5.5 0 0 1 3 5.4"/>',
      ball: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6"/>',
      activity: '<path d="M3 12h3.6l2.4-6 4 13 2.4-7H21"/>',
      trophy: '<path d="M7 4.5h10v3.5a5 5 0 0 1-10 0V4.5z"/><path d="M7 6.5H4.6a2.4 2.4 0 0 0 2.6 2.4M17 6.5h2.4a2.4 2.4 0 0 1-2.6 2.4"/><path d="M9.5 19.5h5M12 14v5.5"/>',
      alert: '<path d="M12 4 2.6 20h18.8L12 4z"/><path d="M12 10.5v4"/><path d="M12 17.5h.01"/>',
      gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
    };
    return '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }

  function todayKST() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function parseDate(s) { var p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function dday() { var t = tripMeta().startDate; if (!t) return null; return Math.round((parseDate(t) - todayKST()) / 86400000); }
  function ddayLabel() { var d = dday(); if (d == null) return ""; return d > 0 ? "D-" + d : d === 0 ? "D-DAY" : "D+" + (-d); }
  function dateKo(s) {
    if (!s) return "미정";
    var d = parseDate(s); if (isNaN(d.getTime()) || d.getFullYear() < 2000) return "미정";
    var wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + wk + ")";
  }
  function timeago(ts) {
    if (!ts) return ""; var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "방금 전"; if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전"; if (s < 604800) return Math.floor(s / 86400) + "일 전";
    var d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function isOnline(id) { var ls = (obj(DB.members)[id] || {}).lastSeen; return !!ls && (Date.now() - ls < 300000); }
  function presenceText(id) { var ls = (obj(DB.members)[id] || {}).lastSeen; if (!ls) return ""; return (Date.now() - ls < 300000) ? "접속 중" : (timeago(ls) + " 접속"); }

  /* ---------- 일정 헬퍼 ---------- */
  function ddayOf(s) { if (!s) return null; return Math.round((parseDate(s) - todayKST()) / 86400000); }
  function ddayLabelOf(s) { var d = ddayOf(s); if (d == null) return ""; return d > 0 ? "D-" + d : d === 0 ? "D-DAY" : "D+" + (-d); }
  function dateShort(s) { var d = parseDate(s); if (isNaN(d.getTime())) return "미정"; var wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()]; return (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + wk + ")"; }
  function dateRangeKo(a, b) {
    if (!a) return "미정";
    if (!b || b === a) return dateShort(a);
    var da = parseDate(a), db = parseDate(b);
    var wk = ["일", "월", "화", "수", "목", "금", "토"][db.getDay()];
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) return dateShort(a) + " → " + db.getDate() + "일(" + wk + ")";
    return dateShort(a) + " → " + dateShort(b);
  }
  function sessStatus(s) {
    var a = ddayOf(s.startDate), b = ddayOf(s.endDate || s.startDate);
    if (b != null && b < 0) return "past";
    if (a != null && a <= 0 && (b == null || b >= 0)) return "now";
    return "upcoming";
  }
  function sessStatusLabel(s) { var st = sessStatus(s); return st === "past" ? "지난 일정" : st === "now" ? "진행 중" : (ddayLabelOf(s.startDate) || "예정"); }
  function allSessions() {
    var built = (CFG.sessions || []).slice();
    var user = entries(DB.sessions).map(function (kv) { var s = Object.assign({}, kv[1]); s.id = "db:" + kv[0]; s._user = true; s._key = kv[0]; return s; });
    return bySort(built.concat(user), function (s) { var d = parseDate(s.startDate || "2999-01-01"); return isNaN(d.getTime()) ? 4102444800000 : d.getTime(); });
  }
  function sessionById(id) {
    if (id && id.indexOf("db:") === 0) { var k = id.slice(3), v = obj(DB.sessions)[k]; if (!v) return null; var s = Object.assign({}, v); s.id = id; s._user = true; s._key = k; return s; }
    var found = null; (CFG.sessions || []).forEach(function (x) { if (x.id === id) found = x; }); return found;
  }
  function currentSession() { return sessionById(state.sessionId) || (CFG.sessions || [])[0] || null; }
  function sportLabel(sp) { return ({ climbing: "클라이밍", billiards: "당구", running: "러닝", general: "일반" })[sp] || "크루"; }
  function sportIcon(sp) { return ({ climbing: "mountain", billiards: "ball", running: "activity", general: "users" })[sp] || "users"; }
  function sessionIcon(s) { if (s && s.match) return "ball"; var cat = { "정기 모임": "users", "외부 활동": "compass", "MT·여행": "bag", "대회·시합": "ballot", "번개": "activity" }; if (s && cat[s.category]) return cat[s.category]; var c = clubById(s && s.clubId) || {}; return sportIcon(c.sport); }
  function clubAvatar(c, size) { c = c || {}; size = size || 38; return '<span class="club-ic" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.5) + 'px">' + (c.emoji || "🏅") + '</span>'; }
  function allClubs() { var built = (CFG.clubs || []).map(function (x) { return Object.assign({}, x, obj((obj(DB.clubmeta) || {})[x.id])); }); var user = entries(obj(DB.clubs)).map(function (kv) { var c = Object.assign({}, kv[1]); c.id = "dbc:" + kv[0]; c._user = true; c._key = kv[0]; return c; }); return built.concat(user); }
  function clubById(id) { if (id && id.indexOf("dbc:") === 0) { var k = id.slice(4), v = obj(DB.clubs)[k]; if (!v) return null; var c = Object.assign({}, v); c.id = id; c._user = true; c._key = k; return c; } var f = null; (CFG.clubs || []).forEach(function (x) { if (x.id === id) f = x; }); if (f) { var ov = obj((obj(DB.clubmeta) || {})[id]); return Object.assign({}, f, ov); } return f; }
  function currentClub() { return clubById(state.clubId) || (CFG.clubs || [])[0] || null; }
  function sessionsOfClub(cid) { return allSessions().filter(function (s) { return (s.clubId || "srk") === (cid || "srk"); }); }
  function clubRoster(cid) {
    cid = cid || state.clubId || "srk";
    var c = clubById(cid), base = [];
    if (c && c.roster && c.roster.length) base = c.roster.slice();
    else if (cid === "srk") base = (CFG.roster || []).slice();
    var seen = {}; base.forEach(function (r) { seen[r.id] = 1; });
    var dyn = obj((obj(DB.roster) || {})[cid]);
    Object.keys(dyn).forEach(function (k) { if (!seen[k]) { var e = dyn[k] || {}; base.push({ id: k, name: e.name || k, role: e.role || "crew", self: true }); seen[k] = 1; } });
    return base;
  }
  function rosterEntry(id) { var f = (CFG.roster || []).filter(function (r) { return r.id === id; })[0]; if (f) return f; var cs = allClubs(); for (var i = 0; i < cs.length; i++) { var rs = cs[i].roster || []; for (var j = 0; j < rs.length; j++) { if (rs[j].id === id) return rs[j]; } } var dr = obj(DB.roster); for (var ck in dr) { if (dr[ck] && dr[ck][id]) return { id: id, name: (dr[ck][id].name || id), role: (dr[ck][id].role || "crew") }; } return null; }
  function clubHasRanking(c) { return !!(c && (c.sport === "billiards" || c.sport === "climbing" || c.sport === "running")); }
  function clubMatches(cid) { cid = cid || state.clubId; var m = obj((obj(DB.clubmatches) || {})[cid]); return Object.keys(m).map(function (k) { var x = Object.assign({}, m[k]); x._key = k; return x; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); }
  function billiardsStats(cid) {
    var agg = {};
    function ensure(id) { if (!agg[id]) agg[id] = { id: id, games: 0, wins: 0, score: 0, innings: 0, lastTarget: 0, ts: 0, coffeeBuy: 0, lunchBuy: 0 }; return agg[id]; }
    clubMatches(cid).forEach(function (m) {
      if (!m.p1 || !m.p2) return;
      [m.p1, m.p2].forEach(function (p) { if (!p || !p.id) return; var a = ensure(p.id); a.games++; a.score += (+p.score || 0); a.innings += (+p.innings || 0); if ((m.ts || 0) >= a.ts) { a.ts = m.ts || 0; a.lastTarget = +p.target || a.lastTarget; } });
      if (m.winner) { ensure(m.winner).wins++; if (m.bet) { var loserId = m.winner === m.p1.id ? m.p2.id : m.p1.id; var lb = ensure(loserId); if (m.bet.coffee) lb.coffeeBuy++; if (m.bet.lunch) lb.lunchBuy++; } }  // 진 사람이 커피/점심 삼
    });
    var ids = Object.keys(agg), TI = 0, TG = 0;
    ids.forEach(function (id) { TI += agg[id].innings; TG += agg[id].games; });
    var groupAvgInn = TG ? (TI / TG) : 25;  // 그룹 평균 이닝/게임 — 추천 수지 환산 기준
    return ids.map(function (id) {
      var a = agg[id]; a.avg = a.innings ? a.score / a.innings : 0; a.winRate = a.games ? a.wins / a.games : 0; a.name = memberName(id);
      a.recSuji = a.games >= 3 ? Math.max(1, Math.round(a.avg * groupAvgInn)) : null;  // 누적 평균 기준 추천 수지(3경기 이상부터)
      return a;
    }).sort(function (x, y) { return y.avg - x.avg || y.winRate - x.winRate || y.games - x.games; });
  }
  function fmtAvg(v) { return (Math.round((v || 0) * 1000) / 1000).toFixed(3); }
  function fmtGrade(g) { return "V" + (g || 0); }
  // 클라이밍 암장 색깔 난이도 (config의 climbGyms / climbGradeBase)
  function climbGymList() { return CFG.climbGyms || []; }
  function climbGymById(id) { var l = climbGymList(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function climbGymColors(g) { return (g && g.colors) ? g.colors : (CFG.climbGradeBase || []); }
  function climbColorLabel(gymId, colorKey) { var g = climbGymById(gymId); if (!g || !colorKey) return ""; var cs = climbGymColors(g); for (var i = 0; i < cs.length; i++) if (cs[i].key === colorKey) return cs[i].label; return ""; }
  function fmtPace(p) { if (!p || !isFinite(p)) return "-"; var m = Math.floor(p), sec = Math.round((p - m) * 60); if (sec === 60) { m++; sec = 0; } return m + "'" + (sec < 10 ? "0" + sec : sec) + '"'; }
  function clubRecords(cid, kind) { cid = cid || state.clubId; var m = obj((obj(DB.clubrecords) || {})[cid]); return Object.keys(m).map(function (k) { var x = Object.assign({}, m[k]); x._key = k; return x; }).filter(function (x) { return !kind || x.kind === kind; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); }
  function clubNotices(cid) { cid = cid || state.clubId; var m = obj((obj(DB.clubnotices) || {})[cid]); return Object.keys(m).map(function (k) { var x = Object.assign({}, m[k]); x._key = k; return x; }).sort(function (a, b) { return ((b.pinned ? 1e15 : 0) + (b.ts || 0)) - ((a.pinned ? 1e15 : 0) + (a.ts || 0)); }); }
  function clubPolls(cid) { cid = cid || state.clubId; var m = obj((obj(DB.clubpolls) || {})[cid]); return Object.keys(m).map(function (k) { var x = Object.assign({}, m[k]); x._key = k; return x; }).sort(function (a, b) { return ((a.closed ? 1 : 0) - (b.closed ? 1 : 0)) || (b.ts || 0) - (a.ts || 0); }); }
  function clubDues(cid) { cid = cid || state.clubId; var m = obj((obj(DB.clubdues) || {})[cid]); return Object.keys(m).map(function (k) { var x = Object.assign({}, m[k]); x._key = k; return x; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); }
  function climbStats(cid) {
    var agg = {};
    clubRecords(cid, "climb").forEach(function (r) { if (!r.member) return; var a = agg[r.member] || (agg[r.member] = { id: r.member, sends: 0, maxGrade: 0, ts: 0, grades: [] }); a.sends++; var g = +r.grade || 0; a.grades.push(g); if (g > a.maxGrade) a.maxGrade = g; if ((r.ts || 0) > a.ts) a.ts = r.ts || 0; });
    return Object.keys(agg).map(function (id) { var a = agg[id]; a.name = memberName(id); a.top = a.grades.slice().sort(function (x, y) { return y - x; }).slice(0, 10); a.score = a.top.reduce(function (s, g) { return s + g; }, 0); return a; }).sort(function (x, y) { return y.score - x.score || y.maxGrade - x.maxGrade || y.sends - x.sends; });
  }
  function runStats(cid) {
    var agg = {};
    clubRecords(cid, "run").forEach(function (r) { if (!r.member) return; var a = agg[r.member] || (agg[r.member] = { id: r.member, runs: 0, dist: 0, bestPace: Infinity }); a.runs++; a.dist += (+r.dist || 0); var pace = (+r.dist > 0 && +r.time > 0) ? (+r.time / +r.dist) : Infinity; if (pace < a.bestPace) a.bestPace = pace; });
    return Object.keys(agg).map(function (id) { var a = agg[id]; a.name = memberName(id); return a; }).sort(function (x, y) { return x.bestPace - y.bestPace || y.dist - x.dist; });
  }

  /* 역 → 권역 */
  var STN_MAP = {}; (CFG.stations || []).forEach(function (s) { STN_MAP[s.n] = s.c; });
  function normStation(s) { return String(s || "").trim().replace(/\s+/g, "").replace(/역+$/, ""); }
  function cleanStation(s) { return clampStr(String(s || "").replace(/\s+/g, "").replace(/역+$/, ""), 40); } // 저장용: 끝의 '역' 제거
  function clusterOf(id) { var st = normStation((obj(DB.members)[id] || {}).station); return st ? (STN_MAP[st] || "기타") : ""; }
  function stationLabel(id) { var st = normStation((obj(DB.members)[id] || {}).station); return st ? esc(st) + "역" : "출발지 미정"; }

  /* ============================================================
     스토어 (Firebase | 데모)
     ============================================================ */
  var _lastWErr = 0, pendingRetry = null, _retryTimer = 0;
  function captureDraft() { var r = document.getElementById("modal-root"), v = {}; if (r) Array.prototype.forEach.call(r.querySelectorAll("input,textarea,select"), function (el) { if (el.id) v[el.id] = (el.type === "checkbox" ? el.checked : el.value); }); return v; }
  function restoreDraft(v) { var r = document.getElementById("modal-root"); if (!r || !v) return; Object.keys(v).forEach(function (id) { var el = null; try { el = r.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(id) : id)); } catch (e) {} if (el) { if (el.type === "checkbox") el.checked = v[id]; else el.value = v[id]; } }); }
  function armRetry(reopen) { var draft = captureDraft(); pendingRetry = function () { try { reopen(); restoreDraft(draft); var m = document.querySelector("#modal-root .modal"); if (m && !m.querySelector(".retry-warn")) { var d = document.createElement("div"); d.className = "retry-warn"; d.textContent = "저장에 실패했어요. 입력값은 그대로 두었어요 — 연결을 확인하고 다시 시도해 주세요."; m.insertBefore(d, m.firstChild); } } catch (e) {} }; if (_retryTimer) clearTimeout(_retryTimer); _retryTimer = setTimeout(function () { pendingRetry = null; }, 8000); }
  function onWriteError(e) { try { console.warn("write fail", e); } catch (_) {} if (pendingRetry) { var r = pendingRetry; pendingRetry = null; try { r(); } catch (_) {} } var n = Date.now(); if (n - _lastWErr < 4000) return; _lastWErr = n; }
  // 루트 리스너가 권한오류(PERMISSION_DENIED)로 취소될 때 — 보안 규칙을 막 조였는데 이 탭은
  // 옛 코드(익명 인증 없음)를 캐시 중이거나, 콘솔에서 익명 인증을 안 켠 경우. 무음 블랙스크린
  // 대신 새로고침 안내 배너를 띄운다. (일시적 네트워크 끊김은 리스너를 취소하지 않아 여기 안 옴)
  function onReadDenied(err) {
    try {
      var code = String((err && (err.code || err.message)) || "").toUpperCase();
      if (code.indexOf("PERMISSION") < 0 && code.indexOf("DENIED") < 0) return;
      if (document.getElementById("perm-denied")) return;
      var d = document.createElement("div");
      d.id = "perm-denied";
      d.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:99999;background:#b91c1c;color:#fff;padding:12px 16px;font:600 14px/1.5 -apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)";
      d.innerHTML = '연결 권한이 만료됐어요. 새로고침하면 다시 연결돼요. <button id="perm-denied-btn" style="margin-left:8px;border:0;border-radius:6px;padding:6px 12px;background:#fff;color:#b91c1c;font-weight:700;cursor:pointer">새로고침</button>';
      document.body.appendChild(d);
      var b = document.getElementById("perm-denied-btn"); if (b) b.onclick = function () { location.reload(); };
    } catch (_) {}
  }
  var Store = (function () {
    var fb = CFG.firebase || {};
    /* 데이터 안전: 프로덕션(github.io)에서만 클라우드. 로컬·Codespaces·?demo=1 은 자동 데모(localStorage)라
       다른 기기에서 미리보기해도 라이브 크루 데이터를 건드리지 않음. 개발환경에서 클라우드를 봐야 하면 ?live=1. */
    var _host = location.hostname, _q = location.search;
    var _devHost = location.protocol === "file:" || _host === "localhost" || _host === "127.0.0.1" || _host === "0.0.0.0" || _host === "::1" || /\.app\.github\.dev$|\.githubpreview\.dev$|\.gitpod\.io$|\.csb\.app$/i.test(_host);
    var _forceDemo = /[?&]demo=1(&|$)/.test(_q), _forceLive = /[?&]live=1(&|$)/.test(_q);
    var useCloud = !!(fb.apiKey && fb.databaseURL && window.firebase) && !_forceDemo && (!_devHost || _forceLive);
    if (useCloud) { try { firebase.initializeApp({ apiKey: fb.apiKey, authDomain: fb.authDomain, databaseURL: fb.databaseURL, projectId: fb.projectId, appId: fb.appId }); } catch (e) {} }

    if (useCloud) {
      var db = firebase.database();
      // 익명 인증: DB 보안 규칙을 'auth != null'로 잠그기 위한 토큰을 받는다. 익명 로그인이
      // 실패해도(콘솔에서 익명 인증 미사용·오프라인 등) 리스너는 그대로 붙여 — 규칙이 아직
      // 열려 있으면 정상 동작하고, 규칙을 조인 뒤라면 권한오류가 콘솔에 찍혀 원인을 알 수 있다.
      var authReady = (window.firebase && firebase.auth)
        ? firebase.auth().signInAnonymously().catch(function (e) { try { console.warn("[crewfit] 익명 인증 실패:", e && e.code); } catch (_) {} })
        : Promise.resolve();
      return {
        mode: "cloud",
        onRoot: function (cb) { authReady.then(function () { db.ref("/").on("value", function (s) { cb(s.val() || {}); }, onReadDenied); }); },
        set: function (p, v) { return db.ref(p).set(v).catch(onWriteError); },
        update: function (p, v) { return db.ref(p).update(v).catch(onWriteError); },
        push: function (p, v) { var r = db.ref(p).push(); r.set(v).catch(onWriteError); return r.key; },
        remove: function (p) { return db.ref(p).remove().catch(onWriteError); },
        tx: function (p, fn) { return db.ref(p).transaction(fn).then(function (r) { return r.committed; }); },
        seedRoot: function (builder) { authReady.then(function () { db.ref("/").transaction(function (cur) { if (cur && cur.members && Object.keys(cur.members).length) return; return builder(); }); }); }
      };
    }

    var LKEY = "srk_mt_db", subs = [], bc = null;
    try { bc = new BroadcastChannel("srk_mt"); } catch (e) { bc = null; }
    function read() { try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { return {}; } }
    function writeAll(o) { localStorage.setItem(LKEY, JSON.stringify(o)); if (bc) try { bc.postMessage(Date.now()); } catch (e) {} notify(); }
    function notify() { var d = read(); subs.forEach(function (cb) { cb(d); }); }
    function navSet(o, path, val) {
      var ks = path.replace(/^\/|\/$/g, "").split("/"), cur = o;
      for (var i = 0; i < ks.length - 1; i++) { if (!cur[ks[i]] || typeof cur[ks[i]] !== "object") cur[ks[i]] = {}; cur = cur[ks[i]]; }
      var last = ks[ks.length - 1]; if (val === null) delete cur[last]; else cur[last] = val;
    }
    function navGet(o, path) { var ks = path.replace(/^\/|\/$/g, "").split("/"), cur = o; for (var i = 0; i < ks.length; i++) { if (cur == null) return undefined; cur = cur[ks[i]]; } return cur; }
    if (bc) bc.onmessage = function () { notify(); };
    window.addEventListener("storage", function (e) { if (e.key === LKEY) notify(); });
    return {
      mode: "demo",
      onRoot: function (cb) { subs.push(cb); cb(read()); },
      set: function (p, v) { var o = read(); if (p === "/" || p === "") writeAll(v); else { navSet(o, p, v); writeAll(o); } },
      update: function (p, v) { var o = read(); Object.keys(obj(v)).forEach(function (k) { navSet(o, p + "/" + k, v[k] === null ? null : v[k]); }); writeAll(o); }, // 키에 '/' 있으면 중첩 경로 (Firebase multi-path update와 동일)
      push: function (p, v) { var o = read(); var k = key(); navSet(o, p + "/" + k, v); writeAll(o); return k; },
      remove: function (p) { var o = read(); navSet(o, p, null); writeAll(o); },
      tx: function (p, fn) { var o = read(); var cur = navGet(o, p); var res = fn(cur === undefined ? null : JSON.parse(JSON.stringify(cur))); if (res === undefined) return Promise.resolve(false); navSet(o, p, res); writeAll(o); return Promise.resolve(true); },
      seedRoot: function (builder) { var o = read(); if (o && o.members && Object.keys(o.members).length) return; writeAll(builder()); }
    };
  })();

  /* ============================================================
     일정 네임스페이싱
     - members / notifications / sessions(허브 카드) 는 전역(root)
     - 콘텐츠(trip·notices·schedule·packing·polls·expenses·photos·participants·paid)는
       일정별. summer-mt는 레거시 호환으로 root에 그대로, 그 외는 s/{id}/ 아래.
     ============================================================ */
  var SESSION_COLLS = { trip: 1, notices: 1, schedule: 1, packing: 1, polls: 1, expenses: 1, photos: 1, participants: 1, paid: 1, received: 1, rides: 1 };
  function sessBase() { return state.sessionId === "summer-mt" ? "" : ("s/" + state.sessionId + "/"); }
  function P(path) { var first = String(path).split("/")[0]; return SESSION_COLLS[first] ? (sessBase() + path) : path; }
  var RawStore = Store;
  Store = {
    mode: RawStore.mode,
    onRoot: function (cb) { return RawStore.onRoot(cb); },
    set: function (p, v) { return RawStore.set(P(p), v); },
    update: function (p, v) { return RawStore.update(P(p), v); },
    push: function (p, v) { return RawStore.push(P(p), v); },
    remove: function (p) { return RawStore.remove(P(p)); },
    tx: function (p, fn) { return RawStore.tx(P(p), fn); },
    seedRoot: function (b) { return RawStore.seedRoot(b); }
  };

  var RAW = {};               // 전체 루트 스냅샷
  var sessSeeded = false;     // 일정 콘텐츠 시드 1회 보장 플래그
  function sessionData() { return state.sessionId === "summer-mt" ? RAW : ((RAW.s && RAW.s[state.sessionId]) || {}); }
  function rebuildDB() {
    var base = sessionData();
    DB = {
      members: RAW.members, notifications: RAW.notifications, sessions: RAW.sessions, clubs: RAW.clubs, roster: RAW.roster, clubmatches: RAW.clubmatches, clubrecords: RAW.clubrecords, clubmeta: RAW.clubmeta, clubnotices: RAW.clubnotices, clubpolls: RAW.clubpolls, clubdues: RAW.clubdues,  // 전역
      trip: base.trip, notices: base.notices, schedule: base.schedule, packing: base.packing,
      polls: base.polls, expenses: base.expenses, photos: base.photos,
      participants: base.participants, paid: base.paid, received: base.received, rides: base.rides
    };
  }
  // 현재 일정의 멤버 ID (participants 있으면 그 부분집합, 없으면 전체 = summer-mt 호환)
  function sessionMemberIds() {
    var s = currentSession() || {}, ids = clubRoster().map(function (r) { return r.id; });
    if (s.memberIds && s.memberIds.length) return s.memberIds.slice();  // 일정 고정 멤버(정산 안정)
    var p = DB.participants;
    if (p && Object.keys(p).length) return Object.keys(p).filter(function (id) { return ids.indexOf(id) >= 0; });
    return ids;
  }
  // 현재 일정의 여행 메타(제목·날짜·장소·정원…). summer-mt는 CFG.trip + DB.trip(heroImage 등)
  function tripMeta() {
    if (state.sessionId === "summer-mt") return Object.assign({}, CFG.trip, obj(DB.trip));
    var s = currentSession() || {}, app = s.app || {};
    return Object.assign({
      title: s.title || "MT", subtitle: s.subtitle || "", startDate: s.startDate || "", endDate: s.endDate || "",
      location: s.location || "", address: s.address || "", lodging: s.lodging || "",
      note: app.note || "", poolFee: app.poolFee || 0, airbnbUrl: app.airbnbUrl || "", carCapacity: app.carCapacity || 6, heroImage: ""
    }, obj(DB.trip));
  }
  // 정산 '완료' 표시 — summer-mt는 레거시(members/me/paid), 그 외는 일정의 paid/me
  function myPaidMap() { return state.sessionId === "summer-mt" ? obj((obj(DB.members)[me] || {}).paid) : obj(obj(DB.paid)[me]); }
  function paidWritePath(creditor) { return state.sessionId === "summer-mt" ? ("members/" + me + "/paid/" + creditor) : ("paid/" + me + "/" + creditor); }
  function myReceivedMap() { return state.sessionId === "summer-mt" ? obj((obj(DB.members)[me] || {}).received) : obj(obj(DB.received)[me]); }
  function receivedWritePath(debtor) { return state.sessionId === "summer-mt" ? ("members/" + me + "/received/" + debtor) : ("received/" + me + "/" + debtor); }
  function rideOf(id) { return state.sessionId === "summer-mt" ? (obj(DB.members)[id] || {}).rideWith : obj(DB.rides)[id]; }
  function rideWritePath(id) { return state.sessionId === "summer-mt" ? ("members/" + id + "/rideWith") : ("rides/" + id); }
  function debtorMarkedPaid(debtor) { var mp = state.sessionId === "summer-mt" ? obj((obj(DB.members)[debtor] || {}).paid) : obj(obj(DB.paid)[debtor]); return !!mp[me]; }
  function creditorConfirmed(creditor) { var rc = state.sessionId === "summer-mt" ? obj((obj(DB.members)[creditor] || {}).received) : obj(obj(DB.received)[creditor]); return !!rc[me]; }
  function mySettleHead() { var bal = computeBalances(), myNet = Math.round(bal[me] || 0); var trs = minimalTransfers(bal).filter(function (t) { return t.from === me || t.to === me; }); var pd = myPaidMap(), rc = myReceivedMap(), rem = 0; trs.forEach(function (t) { if (t.from === me && !pd[t.to]) rem += t.amount; else if (t.to === me && !rc[t.from]) rem += t.amount; }); if (myNet === 0 || rem === 0) return { text: "정산 완료", cls: "", done: true }; return { text: (myNet > 0 ? "받을 돈 " : "보낼 돈 ") + won(rem), cls: (myNet > 0 ? "pos" : "neg"), done: false }; }

  /* ============================================================
     초기 데이터
     ============================================================ */
  function buildSeed() {
    var s = CFG.seed || {}, root = { trip: Object.assign({}, CFG.trip), members: {}, notices: {}, schedule: {}, packing: {}, polls: {}, expenses: {} };
    (CFG.roster || []).forEach(function (m) { root.members[m.id] = { name: m.name, role: m.role || "crew" }; });
    var t = Date.now();
    (s.notices || []).forEach(function (n, i) { root.notices[key()] = { text: n.text, by: n.by || null, pinned: !!n.pinned, ts: t + i }; });
    (s.schedule || []).forEach(function (x, i) { root.schedule[key()] = { day: x.day, time: x.time, title: x.title, place: x.place || "", link: x.link || "", desc: x.desc || "", ts: t + i }; });
    (s.packing || []).forEach(function (p, i) { root.packing[key()] = { label: p.label, type: p.type || "shared", assignee: p.assignee || null, done: !!p.done, ready: {}, ts: t + i }; });
    (s.polls || []).forEach(function (p, i) {
      var opts = {}; (p.options || []).forEach(function (o) { opts[key()] = { label: o }; });
      root.polls[key()] = { title: p.title, desc: p.desc || "", type: p.type || "single", status: p.status || "open", createdBy: p.createdBy || null, allowAddOptions: !!p.allowAddOptions, options: opts, votes: {}, comments: {}, ts: t + i };
    });
    (s.expenses || []).forEach(function (e, i) {
      var ex = { title: e.title, amount: e.amount, payer: e.payer, splitType: e.splitType || "equal", category: e.category || "", note: e.note || "", ts: t + i };
      if (e.participantsAll) ex.participantsAll = true; else if (e.participants) ex.participants = e.participants;
      root.expenses[key()] = ex;
    });
    return root;
  }
  function seedIfEmpty(root) { if (root && root.members && Object.keys(root.members).length) return false; Store.seedRoot(buildSeed); return true; }

  /* 일정별 콘텐츠 시드 (s/{id}). config.sessions[].seed 기반. 비어 있을 때만(tx로 경합 안전). */
  function buildSessionSeed(s) {
    var seed = s.seed || {}, t = Date.now();
    var root = { trip: {}, participants: {}, notices: {}, schedule: {}, packing: {}, polls: {}, expenses: {} };
    root.trip = { title: s.title, subtitle: s.subtitle || "", startDate: s.startDate, endDate: s.endDate, location: s.location || "", address: s.address || "", lodging: s.lodging || "", heroImage: "" };
    (seed.participants || []).forEach(function (id) { root.participants[id] = true; });
    (seed.notices || []).forEach(function (n, i) { root.notices[key()] = { text: n.text, by: n.by || null, link: n.link || "", pinned: !!n.pinned, ts: t + i }; });
    (seed.schedule || []).forEach(function (x, i) { root.schedule[key()] = { day: x.day, time: x.time, title: x.title, place: x.place || "", link: x.link || "", desc: x.desc || "", ts: t + i }; });
    (seed.packing || []).forEach(function (p, i) { root.packing[key()] = { label: p.label, type: p.type || "shared", assignee: p.assignee || null, done: !!p.done, ready: {}, ts: t + i }; });
    (seed.polls || []).forEach(function (p, i) {
      var opts = {}, optKeys = []; (p.options || []).forEach(function (o) { var k = key(); opts[k] = { label: o }; optKeys.push(k); });
      var votes = {}; if (p.votesByOption) p.votesByOption.forEach(function (ids, oi) { (ids || []).forEach(function (uid) { votes[uid] = votes[uid] || {}; if (optKeys[oi]) votes[uid][optKeys[oi]] = true; }); });
      root.polls[key()] = { title: p.title, desc: p.desc || "", type: p.type || "single", status: p.status || "open", createdBy: p.createdBy || null, allowAddOptions: !!p.allowAddOptions, options: opts, votes: votes, comments: {}, ts: t + i };
    });
    (seed.expenses || []).forEach(function (e, i) {
      var ex = { title: e.title, amount: e.amount, payer: e.payer, splitType: e.splitType || "equal", category: e.category || "", note: e.note || "", ts: t + i };
      if (e.participantsAll) ex.participantsAll = true; else if (e.participants) ex.participants = e.participants;
      root.expenses[key()] = ex;
    });
    return root;
  }
  function ensureSessionSeeds() {
    (CFG.sessions || []).forEach(function (s) {
      if (s.kind !== "app" || s.id === "summer-mt" || !s.seed) return;
      RawStore.tx("s/" + s.id, function (cur) { if (cur && (cur.participants || cur.notices || cur.trip)) return; return buildSessionSeed(s); });
    });
  }

  /* ============================================================
     정산 엔진
     ============================================================ */
  function splitEqual(amount, n) {
    amount = Math.round(Number(amount) || 0); if (n <= 0) return [];
    var base = Math.floor(amount / n), rem = amount - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0)); return out;
  }
  function expandShares(e) {
    var members = obj(DB.members), out = {}, ids;
    if (e.participantsAll) ids = sessionMemberIds();
    else if (e.participants) ids = Object.keys(e.participants);
    else ids = sessionMemberIds();
    ids = ids.filter(function (id) { return members[id]; });
    if (e.splitType === "custom" && e.participants) { ids.forEach(function (id) { out[id] = Math.round(Number(e.participants[id]) || 0); }); return out; }
    var shares = splitEqual(e.amount, ids.length); ids.forEach(function (id, i) { out[id] = shares[i] || 0; }); return out;
  }
  function computeBalances() {
    var bal = {}; sessionMemberIds().forEach(function (id) { bal[id] = 0; });
    entries(DB.expenses).forEach(function (kv) {
      var e = kv[1]; if (!e || !(Number(e.amount) > 0) || !e.payer) return;
      if (bal[e.payer] == null) bal[e.payer] = 0; bal[e.payer] += Math.round(Number(e.amount) || 0);
      var sh = expandShares(e); Object.keys(sh).forEach(function (id) { if (bal[id] == null) bal[id] = 0; bal[id] -= sh[id]; });
    });
    return bal;
  }
  function minimalTransfers(bal) {
    var cred = [], deb = [];
    Object.keys(bal).forEach(function (id) { var v = Math.round(bal[id]); if (v > 0) cred.push({ id: id, amt: v }); else if (v < 0) deb.push({ id: id, amt: -v }); });
    cred.sort(function (a, b) { return b.amt - a.amt; }); deb.sort(function (a, b) { return b.amt - a.amt; });
    var tr = [], i = 0, j = 0, g = 0;
    while (i < deb.length && j < cred.length && g++ < 100000) {
      var pay = Math.min(deb[i].amt, cred[j].amt); if (pay > 0) tr.push({ from: deb[i].id, to: cred[j].id, amount: pay });
      deb[i].amt -= pay; cred[j].amt -= pay; if (deb[i].amt === 0) i++; if (cred[j].amt === 0) j++;
    }
    return tr;
  }
  function myPaid(id) { var t = 0; entries(DB.expenses).forEach(function (kv) { if (kv[1] && kv[1].payer === id && Number(kv[1].amount) > 0) t += Math.round(Number(kv[1].amount)); }); return t; }
  function myShare(id) { var t = 0; entries(DB.expenses).forEach(function (kv) { var e = kv[1]; if (e && Number(e.amount) > 0) { var sh = expandShares(e); if (sh[id]) t += sh[id]; } }); return t; }
  function totalSpent() { var t = 0; entries(DB.expenses).forEach(function (kv) { if (Number((kv[1] || {}).amount) > 0) t += Math.round(Number(kv[1].amount)); }); return t; }

  /* ============================================================
     카풀 헬퍼
     ============================================================ */
  function claimedMembers() { return sessionMemberIds().filter(function (id) { return DB.members[id] && DB.members[id].claimed; }); }
  function isValidDriver(id) { var m = obj(DB.members)[id]; return !!(m && m.claimed && m.hasCar); }
  function drivers() { return claimedMembers().filter(function (id) { return DB.members[id].hasCar; }); }
  function passengersOf(d) { return claimedMembers().filter(function (id) { var m = DB.members[id]; return !m.hasCar && rideOf(id) === d; }); }
  function carCap() { return tripMeta().carCapacity || 5; }       // 운전자 포함 총 정원
  function carFull(d) { return passengersOf(d).length >= carCap() - 1; } // 탑승자(운전자 제외) 최대 = 정원-1
  function unassignedPass() { return claimedMembers().filter(function (id) { var m = DB.members[id]; return !m.hasCar && (!rideOf(id) || !isValidDriver(rideOf(id))); }); }
  function memberCount() { return sessionMemberIds().length || 1; }
  function readyCount(p) { var mem = obj(DB.members); return Object.keys(obj(p.ready)).filter(function (id) { return mem[id]; }).length; }

  /* ---------- 알림 (notifications) ---------- */
  function myNotifs() { return bySort(entries(obj(DB.notifications)[me]), function (kv) { return -(kv[1].ts || 0); }); }
  function unreadNotifs() { return myNotifs().filter(function (kv) { return !kv[1].read; }); }
  function notify(toId, text, type, link) { if (!toId) return; var _ex = entries(obj(DB.notifications)[toId]).sort(function (a, b) { return (b[1].ts || 0) - (a[1].ts || 0); }); for (var _ci = 49; _ci < _ex.length; _ci++) Store.remove("notifications/" + toId + "/" + _ex[_ci][0]); var _n = { text: clampStr(text, 200), by: me || null, type: type || "", ts: Date.now(), read: false }; if (link) _n.link = link; Store.push("notifications/" + toId, _n); }
  function notifyCrew(text, type) { claimedMembers().forEach(function (id) { if (id !== me) notify(id, text, type); }); }
  function notifyClub(cid, text, type, link) { clubRoster(cid).forEach(function (r) { if (r.id !== me && (obj(DB.members)[r.id] || {}).claimed) notify(r.id, text, type, link); }); }
  function markNotifRead(k) { if (k) Store.update("notifications/" + me + "/" + k, { read: true }); }
  function markAllNotifsRead() { unreadNotifs().forEach(function (kv) { Store.update("notifications/" + me + "/" + kv[0], { read: true }); }); }

  /* ---------- 사진 (Cloudinary) ---------- */
  function cloudOn() { var c = CFG.cloudinary || {}; return !!(c.cloudName && c.uploadPreset); }
  function thumbUrl(u) { u = String(u || ""); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/c_fill,w_600,h_600,q_auto,f_auto/") : u; }
  function attachUrl(u) { u = String(u || ""); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/fl_attachment/") : u; }
  function heroBg(u) { u = String(u || ""); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/c_fill,w_1080,h_640,g_auto,q_auto,f_auto/") : u; }
  function mediaThumb(p) {
    p = p || {}; var u = String(p.url || "");
    if (p.resourceType === "video" && u.indexOf("/upload/") >= 0) {
      return u.replace("/upload/", "/upload/c_fill,w_600,h_600,q_auto,so_0/").replace(/\.(mp4|mov|webm|avi|m4v|mkv|3gp|ogv)$/i, ".jpg"); // 영상 첫 프레임 포스터
    }
    return thumbUrl(u);
  }
  function selectedPhotoKeys() { return Object.keys(photoSel).filter(function (k) { return photoSel[k] && obj(DB.photos)[k]; }); }

  /* ============================================================
     렌더
     ============================================================ */
  function setChrome(nonav) { var app = $("#app"); if (app) app.classList.toggle("nonav", !!nonav); }
  // 스코어보드 카운트업: [data-countup] 요소의 첫 텍스트노드(숫자)를 0→최종값으로.
  // animate=true(화면 진입=!_sameView)일 때만 1회 실행 — 데이터 새로고침 재렌더에선 정적.
  function fmtCount(v, dec) { return dec ? v.toFixed(dec) : String(Math.round(v)); }
  function runCountUps(animate) {
    var els = document.querySelectorAll("#app-main [data-countup]");
    if (!els.length) return;
    var reduce = false;
    try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    Array.prototype.forEach.call(els, function (el) {
      var node = el.firstChild;
      if (!node || node.nodeType !== 3) return;            // 첫 텍스트노드만 — <i>단위</i>는 보존
      var raw = String(node.nodeValue).replace(/,/g, "");
      var target = parseFloat(raw);
      if (isNaN(target)) return;
      if (!animate || reduce) return;                       // 정적: 이미 최종값이 렌더돼 있음
      var dot = raw.indexOf("."), dec = dot < 0 ? 0 : (raw.length - dot - 1);
      var dur = 620, t0 = null;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        node.nodeValue = fmtCount(target * e, dec);
        if (p < 1) requestAnimationFrame(tick); else node.nodeValue = fmtCount(target, dec);
      }
      node.nodeValue = fmtCount(0, dec);
      requestAnimationFrame(tick);
    });
  }
  function render() {
    rebuildDB();   // 현재 일정 기준으로 DB 뷰 재구성
    if (!(me && (obj(DB.members)[me] || {}).claimed)) { renderLogin(); return; }  // 앱 레벨 로그인 필요
    var sess = (state.screen === "hub" || state.screen === "clubs" || state.screen === "me" || state.screen === "explore" || state.screen === "crews") ? null : currentSession();
    var mode = (state.screen === "clubs" || state.screen === "me" || state.screen === "explore" || state.screen === "crews") ? "top" : state.screen === "hub" ? "hub" : (sess && sess.kind === "info" ? "info" : sess && sess.kind === "match" ? "match" : "app");
    // 뒤로가기 히스토리 기록 (화면·일정·탭 단위)
    var sig = state.screen + "|" + (state.clubId || "") + "|" + (state.sessionId || "") + "|" + state.tab + "|" + state.alert + "|" + (state.pollId || "");
    if (lastSig !== null && lastSig !== sig) { if (backing) backing = false; else { viewHist.push(lastSig); if (viewHist.length > 40) viewHist.shift(); } }
    var _sameView = (lastSig === sig);
    lastSig = sig;
    var main = $("#app-main");
    var appEl = $("#app");
    appEl.classList.remove("lvl-top", "club-themed", "acc-red", "acc-blue", "acc-green", "acc-purple", "acc-orange");
    if (mode !== "top") { var tclub = currentClub() || {}; if (tclub.accent) appEl.classList.add("club-themed", "acc-" + tclub.accent); }
    if (mode === "top") { appEl.classList.add("lvl-top"); $("#gate").classList.add("hidden"); renderTopHeader(); renderTopNav(); setChrome(false); main.innerHTML = state.screen === "me" ? viewMeTop() : state.screen === "crews" ? viewClubs() : state.screen === "explore" ? viewExplore() : viewFeed(); window.scrollTo(0, 0); return; }
    if (mode === "hub") { $("#gate").classList.add("hidden"); renderHubHeader(currentClub()); $("#app-nav").innerHTML = ""; setChrome(true); main.innerHTML = viewHub(); window.scrollTo(0, 0); return; }
    if (mode === "info") { $("#gate").classList.add("hidden"); renderHeader(sess); $("#app-nav").innerHTML = ""; setChrome(true); main.innerHTML = viewSessionInfo(sess); window.scrollTo(0, 0); return; }
    if (mode === "match") { $("#gate").classList.add("hidden"); renderHeader(sess); $("#app-nav").innerHTML = ""; setChrome(true); main.innerHTML = viewMatchSession(sess); window.scrollTo(0, 0); return; }
    $("#gate").classList.add("hidden");  // 앱 로그인만 하면 일정 자유 진입(추가 인증 없음)
    if (state.tab === "vote") { state.alert = "vote"; state.tab = "alert"; }
    if (state.tab === "settle") state.tab = "my";
    if (state.tab === "prep") state.tab = "my";
    if (state.tab === "carpool" && !sessHas("carpool")) state.tab = "home";
    if (state.tab === "my" && !sessHas("settle")) state.tab = "home";
    setChrome(false);
    renderHeader(sess); renderNav();
    if (state.tab === "home") main.innerHTML = viewHome();
    else if (state.tab === "alert") main.innerHTML = viewAlert();
    else if (state.tab === "carpool") main.innerHTML = viewCarpool();
    else if (state.tab === "photo") main.innerHTML = viewPhotos();
    else if (state.tab === "my") main.innerHTML = viewMy();
    else main.innerHTML = viewHome();
    runCountUps(!_sameView);
    if (!_sameView) window.scrollTo(0, 0);
  }
  function scheduleRender() { if (booted) render(); }
  function goBack() {
    if (viewHist.length) {
      var p = viewHist.pop().split("|");
      state.screen = p[0] || "clubs"; state.clubId = p[1] || null; state.sessionId = p[2] || "summer-mt";
      state.tab = p[3] || "home"; state.alert = p[4] || "notice"; state.pollId = p[5] || null;
      backing = true;
    } else if (state.screen === "session") { state.screen = "hub"; state.pollId = null; }
    else if (state.screen === "hub") { state.screen = "clubs"; state.clubId = null; state.pollId = null; }
    else { state.tab = "home"; state.pollId = null; }
    render();
  }

  function renderHeader(sess) {
    sess = sess || currentSession() || {};
    $("#app-header").innerHTML =
      '<button class="hd-back" data-action="go-hub" aria-label="일정 목록으로">' + icon("back", 22) + "</button>" +
      '<div class="hd-actions">' +
      ((canManage(me) && sess._user) ? '<button class="hd-gear" data-action="open-session-manage" aria-label="일정 관리">' + icon("gear", 22) + "</button>" : "") +
      "</div>";
  }
  function sessionManageSheet() {
    var s = currentSession() || {};
    if (!(canManage(me) && s._user)) return;
    var isMatch = s.kind === "match";
    openModal('<h2>' + (isMatch ? "대결 관리" : "일정 관리") + '</h2>' +
      (isMatch ? "" : '<button class="btn-line btn-block" data-action="edit-session" data-id="' + esc(s.id) + '">일정 정보 수정</button>') +
      '<button class="link-danger" data-action="del-session" data-id="' + esc(s.id) + '" style="display:block;width:100%;text-align:center;margin-top:' + (isMatch ? "4px" : "14px") + '">' + (isMatch ? "대결 삭제" : "일정 삭제") + '</button>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">닫기</button></div>');
  }
  function renderTopHeader() {
    var unread = unreadNotifs().length;
    $("#app-header").innerHTML =
      '<div class="hd-brand"><div class="hd-title">CREWFIT</div></div>' +
      '<button class="bell-btn" data-action="open-notifs" aria-label="알림">' + icon("bell", 22) + (unread ? '<span class="bell-badge">' + (unread > 9 ? "9+" : unread) + "</span>" : "") + "</button>";
  }
  function renderTopNav() {
    var tabs = [["clubs", "home", "홈"], ["crews", "users", "내 크루"], ["me", "user", "마이"]];
    $("#app-nav").innerHTML = tabs.map(function (t) {
      var on = state.screen === t[0] || (t[0] === "crews" && state.screen === "explore");
      return '<button class="navbtn' + (on ? " on" : "") + '" data-action="top-nav" data-screen="' + t[0] + '"><span class="nav-ic">' + icon(t[1], 22) + "</span><span>" + t[2] + "</span></button>";
    }).join("");
  }
  function viewMeTop() {
    var m = obj(DB.members)[me] || {}, h = '<div class="hub-wrap">';
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 입력 내용이 이 기기에만 저장돼요.</div>';
    h += '<div class="hub-head"><h1>마이</h1></div>';
    h += '<div class="card my-profile" data-action="open-profile"><div class="mp-top">' + avatar(me, 52) +
      '<div class="mp-info"><div class="mp-name">' + esc(memberName(me)) + " " + roleBadge(me) + '</div>' +
      '<div class="mp-sub">' + (m.bio ? esc(m.bio) : (m.pin ? "눌러서 프로필 설정" : '<span class="warn">인증번호 미설정 — 눌러서 설정</span>')) + '</div></div>' +
      '<span class="mp-go">' + icon("edit", 18) + '</span></div></div>';
    h += myUpcomingHtml();
    h += myClubsListHtml();
    h += mySkillStatsHtml();
    h += '<p class="pf-note" style="text-align:center;margin-top:18px">프로필 카드를 눌러 설정 · 로그아웃</p>';
    return h + "</div>";
  }
  function myUpcoming() {
    var out = [];
    myClubs().forEach(function (c) {
      sessionsOfClub(c.id).forEach(function (s) {
        if (!isSessionDone(s) && s.startDate) out.push({ s: s, club: c });
      });
    });
    return out.sort(function (a, b) { return parseDate(a.s.startDate) - parseDate(b.s.startDate); });
  }
  function myUpcomingHtml() {
    var ups = myUpcoming().slice(0, 4);
    if (!ups.length) return "";
    var h = '<h2 class="sec" style="margin-top:18px">다가오는 일정</h2><div class="me-list">';
    ups.forEach(function (u) {
      var s = u.s, c = u.club, dd = ddayLabelOf(s.startDate);
      var title = s.match ? (memberName((s.match.p1 || {}).id) + " vs " + memberName((s.match.p2 || {}).id)) : s.title;
      h += '<div class="card me-row" data-action="open-session" data-id="' + esc(s.id) + '">' +
        '<span class="me-em">' + (s.emoji || (s.match ? "🎱" : "📌")) + '</span>' +
        '<div class="me-mid"><div class="me-tt">' + esc(title) + '</div>' +
        '<div class="me-ss">' + (c.emoji ? esc(c.emoji) + " " : "") + esc(c.name) + ' · ' + esc(dateRangeKo(s.startDate, s.endDate)) + '</div></div>' +
        '<span class="me-dday">' + esc(dd || "예정") + '</span></div>';
    });
    return h + "</div>";
  }
  function myClubsListHtml() {
    var clubs = myClubs();
    var h = '<h2 class="sec" style="margin-top:18px">내 크루</h2>';
    if (!clubs.length) return h + '<div class="empty-msg">아직 속한 크루가 없어요.</div>';
    h += '<div class="me-list">';
    clubs.forEach(function (c) {
      var r = clubRoster(c.id).filter(function (x) { return x.id === me; })[0];
      var role = (r && r.role) || roleOf(me) || "crew";
      var cls = role === "manager" ? "mgr" : role === "staff" ? "admin" : "crew";
      var label = role === "manager" ? "관리자" : role === "staff" ? "운영진" : "크루원";
      var unpaid = clubDues(c.id).filter(function (d) { return !obj(d.paid)[me]; });
      var owe = unpaid.reduce(function (a, d) { return a + (+d.amount || 0); }, 0);
      h += '<div class="card me-row" data-action="open-club" data-id="' + esc(c.id) + '">' +
        clubAvatar(c, 30) +
        '<div class="me-mid"><div class="me-tt">' + esc(c.name) + '</div>' +
        '<div class="me-ss">' + esc(sportLabel(c.sport)) + (unpaid.length ? ' · <span class="me-due">미납 회비 ' + won(owe) + '</span>' : "") + '</div></div>' +
        '<span class="me-tr"><span class="rbadge ' + cls + '">' + label + '</span><span class="me-go">›</span></span></div>';
    });
    return h + "</div>";
  }
  function msStat(n, l) { return '<div class="ms-stat"><div class="ms-stat-n">' + n + '</div><div class="ms-stat-l">' + l + '</div></div>'; }
  function mySkillBlock(c) {
    if (c.sport === "billiards") {
      var stb = billiardsStats(c.id).filter(function (a) { return a.id === me; })[0];
      if (!stb || !stb.games) return "";
      var h = '<div class="card"><div class="mystat-head">' + (c.emoji || "🏅") + " " + esc(c.name) + '</div><div class="md-mystat">' +
        msStat(fmtAvg(stb.avg), "에버리지") + msStat(stb.games, "경기") + msStat(stb.wins, "승") + (stb.recSuji ? msStat(stb.recSuji, "추천 수지") : "") + "</div>";
      h += stb.recSuji
        ? '<div class="hint" style="margin-top:8px">최근 평균 기준 <b>추천 수지 ' + stb.recSuji + '</b>' + (stb.lastTarget ? " (현재 " + stb.lastTarget + ")" : "") + ' · 경기가 쌓일수록 정확해져요</div>'
        : '<div class="hint" style="margin-top:8px">3경기 이상 쌓이면 추천 수지를 알려드려요</div>';
      var recent = clubMatches(c.id).filter(function (mm) { return mm.p1 && mm.p2 && (mm.p1.id === me || mm.p2.id === me); }).slice(0, 5);
      if (recent.length) {
        h += '<div class="match-list" style="margin-top:12px">';
        recent.forEach(function (mm) {
          var meP = mm.p1.id === me ? mm.p1 : mm.p2, opP = mm.p1.id === me ? mm.p2 : mm.p1, win = mm.winner === me;
          h += '<div class="match-row"><span class="mt-p win">나 <b>' + (+meP.score || 0) + '</b></span><span class="mt-vs">' + (win ? "승" : "패") + '</span><span class="mt-p right"><b>' + (+opP.score || 0) + "</b> " + esc(memberName(opP.id)) + "</span></div>";
        });
        h += "</div>";
      }
      return h + "</div>";
    }
    if (c.sport === "climbing") {
      var stc = climbStats(c.id).filter(function (a) { return a.id === me; })[0];
      if (!stc || !stc.sends) return "";
      return '<div class="card"><div class="mystat-head">' + (c.emoji || "🏅") + " " + esc(c.name) + '</div><div class="md-mystat">' +
        msStat(fmtGrade(stc.maxGrade), "최고 난이도") + msStat(stc.sends, "완등") + "</div></div>";
    }
    if (c.sport === "running") {
      var str = runStats(c.id).filter(function (a) { return a.id === me; })[0];
      if (!str || !str.runs) return "";
      return '<div class="card"><div class="mystat-head">' + (c.emoji || "🏅") + " " + esc(c.name) + '</div><div class="md-mystat">' +
        msStat(fmtPace(str.bestPace), "베스트 페이스") + msStat(str.runs, "러닝") + msStat(Math.round(str.dist * 10) / 10, "총 km") + "</div></div>";
    }
    return "";
  }
  function mySkillStatsHtml() {
    var blocks = myClubs().map(mySkillBlock).filter(function (b) { return b; });
    if (!blocks.length) return "";
    return '<h2 class="sec" style="margin-top:18px">내 기록</h2>' + blocks.join("");
  }
  function renderHubHeader(club) {
    club = club || {};
    $("#app-header").innerHTML =
      '<button class="hd-back" data-action="go-clubs" aria-label="크루 목록으로">' + icon("back", 22) + "</button>" +
      '<div class="hd-actions">' +
      (canManage(me) ? '<button class="hd-gear" data-action="open-club-manage" aria-label="크루 관리">' + icon("gear", 22) + "</button>" : "") +
      "</div>";
  }
  function sessHas(f) { var sx = currentSession() || {}; return !sx.features || sx.features.indexOf(f) >= 0; }
  function renderNav() {
    var tabs = [["home", "home", "홈"], ["alert", "calendar", "일정"]];
    if (sessHas("carpool")) tabs.push(["carpool", "car", "카풀"]);
    tabs.push(["photo", "camera", "앨범"]);
    if (sessHas("settle")) tabs.push(["my", "wallet", "정산·준비"]);
    $("#app-nav").innerHTML = tabs.map(function (t) {
      return '<button class="navbtn' + (state.tab === t[0] ? " on" : "") + '" data-action="tab" data-tab="' + t[0] + '"><span class="nav-ic">' + icon(t[1], 22) + "</span><span>" + t[2] + "</span></button>";
    }).join("");
  }

  var pinReveal = false;  // 가입(첫 인증번호 설정) 모드에선 입력 숫자를 가리지 않고 보여줌(오타 방지)
  /* 인증번호 입력 — 입력 중인 숫자만 보이고 이전 숫자는 마스킹(•) · 가입 모드는 전체 노출 */
  function pinCellsHtml(inputId, cellsId) {
    var cells = ""; for (var i = 0; i < 4; i++) cells += '<div class="pin-cell"></div>';
    return '<div class="pin-wrap"><div class="pin-cells" id="' + cellsId + '">' + cells + "</div>" +
      '<input id="' + inputId + '" class="pin-real" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-label="인증번호 4자리"></div>';
  }
  function paintPinCells(cellsEl, val) {
    if (!cellsEl) return; var s = String(val || ""), kids = cellsEl.children;
    for (var i = 0; i < kids.length; i++) {
      var filled = i < s.length, active = i === s.length;
      kids[i].textContent = filled ? ((pinReveal || i === s.length - 1) ? s.charAt(i) : "•") : ""; // 마지막 한 자리(또는 가입 모드 전체) 노출
      kids[i].className = "pin-cell" + (filled ? " filled" : "") + (active ? " active" : "");
    }
  }
  function bindPin(input, cellsEl, errEl) {
    if (!input) return;
    pinReveal = false;  // 컨텍스트마다 기본은 마스킹(로그인 가입 모드에서만 updateLoginMode가 노출로 바꿈)
    function upd() { input.value = input.value.replace(/\D/g, "").slice(0, 4); paintPinCells(cellsEl, input.value); if (errEl) errEl.textContent = ""; }
    input.addEventListener("input", upd); input.addEventListener("focus", upd); upd();
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }

  /* ---------- 인트로 (이름 → 출발역 → 자차) ---------- */
  var LOGO_C = '<svg viewBox="0 0 512 512" width="76" height="76" aria-hidden="true"><defs><linearGradient id="lgc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4368ff"/><stop offset="1" stop-color="#2447e0"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#lgc)"/><path d="M361 332 A130 130 0 1 1 361 180" fill="none" stroke="#fff" stroke-width="64" stroke-linecap="round"/></svg>';
  function resolveMemberByName(name) {
    name = String(name || "").trim(); if (!name) return null;
    var cand = [];
    (CFG.roster || []).forEach(function (r) { if (r.name === name) cand.push(r.id); });
    allClubs().forEach(function (c) { (c.roster || []).forEach(function (r) { if (r.name === name) cand.push(r.id); }); });
    var dr = obj(DB.roster); for (var cid in dr) { var rs = dr[cid] || {}; for (var id in rs) { if (rs[id] && rs[id].name === name) cand.push(id); } }
    var mem = obj(DB.members); for (var mid in mem) { if (mem[mid] && mem[mid].name === name) cand.push(mid); }
    var uniq = cand.filter(function (v, i) { return cand.indexOf(v) === i; });
    if (!uniq.length) return null;
    var claimed = uniq.filter(function (id) { return (obj(DB.members)[id] || {}).pin; });
    return { id: claimed.length ? claimed[0] : uniq[0], name: name };
  }
  function myClubs() { return allClubs().filter(function (c) { return clubRoster(c.id).some(function (r) { return r.id === me; }); }); }
  function renderLogin() {
    $("#app-header").innerHTML = ""; $("#app-nav").innerHTML = ""; $("#app-main").innerHTML = ""; setChrome(true);
    var g = $("#gate"); g.classList.remove("hidden"); g.innerHTML = loginCard();
    bindPin($("#i-pin"), $("#pin-cells"), $("#pin-err"));
    var pf = $("#i-pin"); if (pf) pf.addEventListener("input", loginBtnState);
    var nf = $("#i-loginname"); if (nf) { nf.addEventListener("input", updateLoginMode); try { nf.focus(); } catch (e) {} }
    updateLoginMode();
  }
  // 이름 + 인증번호 4자리 다 입력돼야 로그인 버튼 활성화
  function loginBtnState() {
    var btn = $("#login-btn"); if (!btn) return;
    var nm = (($("#i-loginname") || {}).value || "").trim();
    var pin = (($("#i-pin") || {}).value || "").replace(/\D/g, "");
    btn.disabled = !(nm && pin.length === 4);
  }
  function loginCard() {
    return '<div class="gate-card login-card">' +
      '<header class="login-head">' + LOGO_C + "<span>CREWFIT</span></header>" +
      '<h1 class="login-title" id="login-title">로그인</h1>' +
      '<p class="login-sub" id="login-sub">이름과 인증번호를 입력하세요</p>' +
      '<div class="fld"><label>이름</label><input type="text" id="i-loginname" placeholder="이름을 입력하세요" autocomplete="off"></div>' +
      '<div class="fld"><label id="i-pin-label">인증번호 (4자리)</label>' + pinCellsHtml("i-pin", "pin-cells") + '</div>' +
      '<p class="login-foot" id="login-foot">인증번호를 잊었다면 운영진에게 초기화를 요청하세요</p>' +
      '<div id="login-err" class="pin-err"></div>' +
      '<button class="btn-pri btn-block" id="login-btn" data-action="login-submit">로그인</button>' +
      "</div>";
  }
  // 이름 입력에 따라 타이틀·서브타이틀·버튼을 '로그인(기존)' vs '가입(첫 입장)'으로 전환
  function updateLoginMode() {
    var nf = $("#i-loginname"); if (!nf) return;
    var nm = (nf.value || "").trim();
    var title = $("#login-title"), sub = $("#login-sub"), btn = $("#login-btn"), lab = $("#i-pin-label"), foot = $("#login-foot");
    var hit = nm ? resolveMemberByName(nm) : null;
    var dm = hit ? (obj(DB.members)[hit.id] || {}) : null;
    if (hit && dm && dm.pin) {            // 기존 회원 — 로그인
      pinReveal = false;
      if (title) title.textContent = "로그인";
      if (sub) sub.textContent = hit.name + "님, 인증번호 4자리를 입력하세요";
      if (lab) lab.textContent = "인증번호 (4자리)";
      if (btn) btn.textContent = "로그인";
    } else if (hit && dm && !dm.pin) {    // 첫 입장 — 인증번호 설정
      pinReveal = true;
      if (title) title.textContent = "최초 인증번호를 설정해주세요";
      if (sub) sub.textContent = "원하는 4자리 숫자를 정하면 가입돼요 · 꼭 기억하세요";
      if (lab) lab.textContent = "새 인증번호 (4자리)";
      if (btn) btn.textContent = "가입하기";
    } else {                              // 미입력 / 명단에 없는 이름
      pinReveal = false;
      if (title) title.textContent = "로그인";
      if (sub) sub.textContent = "이름과 인증번호를 입력하세요";
      if (lab) lab.textContent = "인증번호 (4자리)";
      if (btn) btn.textContent = "로그인";
    }
    if (foot) foot.style.display = (hit && dm && !dm.pin) ? "none" : "";  // 첫 입장(가입)엔 '초기화 요청' 안내 숨김
    paintPinCells($("#pin-cells"), (($("#i-pin") || {}).value) || "");
    loginBtnState();
  }
  function renderGate() {
    var g = $("#gate"); g.classList.remove("hidden");
    $("#app-header").innerHTML = ""; $("#app-nav").innerHTML = ""; setChrome(true);
    g.innerHTML = gateNotMember();
  }
  function gateNotMember() {
    var sess = currentSession() || {};
    return '<div class="gate-card">' +
      '<button class="gate-back" data-action="go-hub" aria-label="크루로">' + icon("back", 18) + "<span>크루</span></button>" +
      '<div class="gate-emoji"' + (sess.emoji ? ' style="font-size:44px"' : "") + ">" + (sess.emoji ? esc(sess.emoji) : icon("pin", 44)) + "</div>" +
      "<h1>" + esc(sess.title || "") + "</h1>" +
      '<p class="gate-p">이 일정은 참여 멤버만 입장할 수 있어요.<br>참여하려면 운영진에게 요청해 주세요.</p>' +
      '<div class="intro-foot"><button class="btn-pri btn-block" data-action="go-hub">크루로 돌아가기</button></div>' +
      "</div>";
  }
  function gateName() {
    var sess = currentSession() || {}, roster = sessionMemberIds().map(function (id) { var r = rosterEntry(id); return r || { id: id, name: memberName(id) }; });
    return '<div class="gate-card">' +
      '<button class="gate-back" data-action="go-hub" aria-label="일정 목록으로">' + icon("back", 18) + "<span>일정 목록</span></button>" +
      '<div class="gate-emoji"' + (sess.emoji ? ' style="font-size:44px"' : "") + '>' + (sess.emoji ? esc(sess.emoji) : icon("mountain", 48)) + '</div>' +
      "<h1>" + esc(sess.title || (CFG.trip || {}).title || "MT") + "</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot"></span></div>' +
      '<p class="gate-p">본인 이름을 선택하세요. 4자리 인증번호로 입장합니다.<br>어느 기기에서든 같은 인증번호로 들어올 수 있어요.</p>' +
      '<div class="gate-grid" id="gate-grid">' + roster.map(function (m) {
        var dm = obj(DB.members)[m.id] || {};
        var tag = dm.pin ? '<span class="lock-tag">' + icon("key", 16) + '</span>' : "";
        return '<button class="gate-name" data-action="pick-name" data-id="' + m.id + '">' +
          avatar(m.id, 34) + '<span class="nm-main"><span>' + esc(m.name) + "</span>" + roleTag(m.id) + "</span>" + tag + "</button>";
      }).join("") + "</div>" +
      '<button class="gate-add" data-action="self-join">' + icon("plus", 18) + "<span>명단에 없어요 · 직접 추가</span></button>" +
      "</div>";
  }
  function gateNewName() {
    var club = currentClub() || {};
    return '<div class="gate-card">' +
      '<button class="gate-back" data-action="self-join-back" aria-label="명단으로">' + icon("back", 18) + "<span>명단으로</span></button>" +
      '<div class="gate-emoji">' + icon("user", 44) + "</div>" +
      "<h1>이름 입력</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot"></span><span class="step-dot"></span></div>' +
      '<div class="gate-sess">' + esc(club.name || "") + "</div>" +
      '<p class="gate-p">' + esc(club.name || "크루") + " 명단에 없다면 직접 추가해 입장하세요.<br>운영진이 나중에 확인할 수 있어요.</p>" +
      '<div class="fld" style="text-align:left;margin-top:4px"><label>이름</label><input type="text" id="i-newname" maxlength="20" placeholder="본인 이름" autocomplete="off"></div>' +
      '<div id="newname-err" class="pin-err"></div>' +
      '<div class="intro-foot"><button class="btn-line" data-action="self-join-back">‹ 뒤로</button>' +
      '<button class="btn-pri" data-action="self-name-next">다음 →</button></div>' +
      "</div>";
  }
  function gatePin() {
    var id = intro.pick, dm = obj(DB.members)[id] || {}, verify = !!dm.pin, sess = currentSession() || {};
    return '<div class="gate-card"><div class="gate-emoji">' + icon("key", 48) + '</div>' +
      "<h1>" + (verify ? "인증번호 입력" : "인증번호 설정") + "</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot on"></span>' + (verify ? "" : '<span class="step-dot"></span>') + "</div>" +
      '<div class="gate-sess">' + (sess.emoji ? esc(sess.emoji) + " " : "") + esc(sess.title || "") + "</div>" +
      '<div class="profile-who" style="justify-content:center">' + avatar(id, 40) + "<span>" + esc(memberName(id)) + "</span>" + roleTag(id) + "</div>" +
      '<p class="gate-p">' + (verify ? "이 이름의 인증번호 4자리를 입력하세요." : "입장할 때 쓸 4자리 인증번호를 정하세요. 이 번호로 다른 기기에서도 '나'로 들어와요 · 1234·생일은 피해주세요.") + "</p>" +
      pinCellsHtml("i-pin", "pin-cells") +
      '<div id="pin-err" class="pin-err"></div>' +
      '<div class="intro-foot"><button class="btn-line" data-action="intro-back">‹ 뒤로</button>' +
      '<button class="btn-pri" data-action="pin-submit" data-id="' + id + '">' + (verify ? "입장" : "다음 →") + "</button></div>" +
      (verify ? '<p class="gate-p" style="margin-top:12px;font-size:12px">인증번호를 잊었다면 단톡방에서 운영진에게 초기화를 요청하세요.</p>' : "") +
      "</div>";
  }
  function gateProfile() {
    var id = intro.pick, dm = obj(DB.members)[id] || {};
    var st = dm.station || "";
    var car = intro.car;
    var dl = (CFG.stations || []).map(function (s) { return '<option value="' + esc(s.n) + '">'; }).join("");
    return '<div class="gate-card"><div class="gate-emoji">' + icon("pin", 48) + '</div>' +
      "<h1>거의 다 왔어요!</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot on"></span><span class="step-dot on"></span></div>' +
      '<div class="profile-box">' +
      '<div class="profile-who">' + avatar(id, 40) + "<span>" + esc(memberName(id)) + "</span>" + roleTag(id) + "</div>" +
      '<div class="fld"><label>출발지 (지하철역)</label>' +
      '<input type="text" id="i-station" list="stationlist" placeholder="예: 남영, 강남… (직접 입력 가능)" value="' + esc(st) + '" autocomplete="off">' +
      '<datalist id="stationlist">' + dl + "</datalist></div>" +
      '<div class="fld"><label>자차 보유</label><div class="toggle2">' +
      '<button id="car-no" class="' + (car ? "" : "on") + '" data-action="set-car" data-v="0">없음</button>' +
      '<button id="car-yes" class="' + (car ? "on" : "") + '" data-action="set-car" data-v="1">있음</button></div></div>' +
      '<div class="intro-foot"><button class="btn-line" data-action="intro-back">‹ 뒤로</button>' +
      '<button class="btn-pri" data-action="intro-submit">입장하기</button></div>' +
      '<p class="gate-p" style="margin-top:14px;font-size:12px">출발지·자차 정보는 나중에 프로필에서 바꿀 수 있어요.</p>' +
      "</div></div>";
  }

  /* ============================================================
     상위(허브) 페이지 — 일정 목록
     ============================================================ */
  function markFeedSeen() { try { localStorage.setItem("srk_feedseen", String(Date.now())); } catch (e) {} }
  function feedItems() {
    var out = [];
    myClubs().forEach(function (c) {
      clubNotices(c.id).forEach(function (n) { out.push({ kind: "notice", club: c, ts: n.ts || 0, text: n.text }); });
      clubPolls(c.id).forEach(function (p) { out.push({ kind: "poll", club: c, ts: p.ts || 0, q: p.q, closed: p.closed }); });
      clubDues(c.id).forEach(function (d) { out.push({ kind: "dues", club: c, ts: d.ts || 0, title: d.title, amount: d.amount }); });
      clubMatches(c.id).forEach(function (m) { if (m.p1 && m.p2) out.push({ kind: "match", club: c, ts: m.ts || 0, m: m }); });
      sessionsOfClub(c.id).forEach(function (sx) { if (sx._user && !sx.match && (sx.ts || 0) > 0) out.push({ kind: "session", club: c, ts: sx.ts || 0, s: sx }); });
    });
    return out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 30);
  }
  function feedCard(it, isNew) {
    var c = it.club, ic = "megaphone", lab = "소식", body = "", tab = "board", bt = "notice";
    if (it.kind === "notice") { ic = "megaphone"; lab = "새 소식"; body = it.text; tab = "board"; bt = "notice"; }
    else if (it.kind === "poll") { ic = "ballot"; lab = it.closed ? "투표 마감" : "새 투표"; body = it.q; tab = "board"; bt = "poll"; }
    else if (it.kind === "dues") { ic = "wallet"; lab = "회비 등록"; body = it.title + " · 1인 " + won(it.amount); tab = "board"; bt = "dues"; }
    else if (it.kind === "match") { var m = it.m; ic = "ballot"; lab = "대전 결과"; body = memberName(m.p1.id) + " " + (+m.p1.score || 0) + " : " + (+m.p2.score || 0) + " " + memberName(m.p2.id) + (m.winner ? " · " + memberName(m.winner) + " 승" : ""); tab = "ranking"; bt = "notice"; }
    else if (it.kind === "session") { ic = "calendar"; lab = "새 일정"; body = it.s.title + (it.s.startDate ? " · " + dateRangeKo(it.s.startDate, it.s.endDate) : ""); tab = "schedule"; bt = "notice"; }
    return '<div class="card feed-item' + (isNew ? " is-new" : "") + ' acc-' + esc(c.accent || "red") + '" data-action="go-club-tab" data-id="' + esc(c.id) + '" data-tab="' + tab + '" data-bt="' + bt + '">' +
      '<div class="fi-head"><span class="fi-club">' + (c.emoji ? esc(c.emoji) + " " : "") + esc(c.name) + '</span>' + (isNew ? '<span class="fi-new">NEW</span>' : "") + '<span class="fi-ago">' + timeago(it.ts) + '</span></div>' +
      '<div class="fi-body"><span class="fi-ic">' + icon(ic, 18) + '</span><div class="fi-main"><div class="fi-lab">' + lab + '</div><div class="fi-text">' + esc(body) + '</div></div></div>' +
      '</div>';
  }
  function viewFeed() {
    var items = feedItems(), h = '<div class="hub-wrap">';
    var seen = +(localStorage.getItem("srk_feedseen") || 0);
    var newCnt = items.filter(function (it) { return (it.ts || 0) > seen; }).length;
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 입력 내용이 이 기기에만 저장돼요.</div>';
    h += '<div class="hub-head"><h1>홈</h1><p class="hub-sub">내 크루 소식' + (newCnt ? ' · <b class="feed-newcnt">새 소식 ' + newCnt + '건</b>' : "") + '</p></div>';
    if (!items.length) return h + '<div class="empty-msg">아직 새 소식이 없어요.<br>\u2018내 크루\u2019 탭에서 크루 활동을 시작해보세요.</div></div>';
    h += '<div class="feed">';
    items.forEach(function (it) { h += feedCard(it, (it.ts || 0) > seen); });
    return h + "</div></div>";
  }
  function viewClubs() {
    var list = myClubs(), h = "";
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 입력 내용이 이 기기에만 저장돼요. <button class="link" data-action="reload-app">새로고침</button> 후 다시 시도해 주세요.</div>';
    h += '<div class="hub-head hub-head-row"><h1>내 크루</h1>' + (isMeAdmin() ? '<button class="btn-pri" data-action="create-club">+ 크루 개설</button>' : "") + '</div>';
    h += '<div class="list-grid sess-grid">';
    list.forEach(function (c) { h += clubCard(c); });
    h += "</div>";
    if (!list.length) h += '<div class="empty-msg">아직 가입한 크루가 없어요.<br>크루 운영진에게 초대를 요청하세요.</div>';
    return '<div class="hub-wrap">' + h + "</div>";
  }
  function clubCard(c) {
    var n = sessionsOfClub(c.id).length;
    var mine = !!(me && clubRoster(c.id).some(function (r) { return r.id === me; }));
    var role = mine ? roleOf(me) : null;
    var label = mine ? (role === "manager" ? "관리자" : role === "staff" ? "운영진" : "크루원") : "미가입";
    var cls = mine ? (role === "manager" ? "mgr" : role === "staff" ? "admin" : "crew") : "guest";
    return '<div class="card sess-card acc-' + esc(c.accent || "red") + '" data-action="open-club" data-id="' + esc(c.id) + '">' +
      '<div class="sc-top">' + clubAvatar(c, 40) + '<span class="sc-badge now">' + esc(sportLabel(c.sport)) + "</span></div>" +
      '<div class="sc-title">' + esc(c.name) + "</div>" +
      (c.desc ? '<div class="sc-subtitle">' + esc(c.desc) + "</div>" : "") +
      '<div class="sc-foot"><span class="sc-tag role-' + cls + '">' + label + '</span><span class="sc-go">' + (n > 0 ? "일정 " + n + "개" : "둘러보기") + " ›</span></div>" +
      "</div>";
  }
  function viewExplore() {
    var meClubs = {}; myClubs().forEach(function (c) { meClubs[c.id] = 1; });
    var list = allClubs().filter(function (c) { return (c.visibility !== "private") || meClubs[c.id]; });
    var h = '<div class="hub-wrap">';
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 입력 내용이 이 기기에만 저장돼요.</div>';
    h += '<div class="page-head" style="margin-bottom:8px"><button class="back" data-action="go-crews">' + icon("back", 18) + ' 내 크루</button></div>';
    h += '<div class="hub-head"><h1>크루 둘러보기</h1><p class="hub-sub">관심 있는 크루를 찾아 가입해보세요</p></div>';
    if (!list.length) return h + '<div class="empty-msg">아직 공개된 크루가 없어요.</div></div>';
    h += '<div class="list-grid sess-grid">';
    list.forEach(function (c) { h += exploreCard(c); });
    return h + "</div></div>";
  }
  function exploreCard(c) {
    var mine = clubRoster(c.id).some(function (r) { return r.id === me; });
    var memCount = clubRoster(c.id).length;
    return '<div class="card sess-card acc-' + esc(c.accent || "red") + '"' + (mine ? ' data-action="open-club" data-id="' + esc(c.id) + '"' : "") + '>' +
      '<div class="sc-top">' + clubAvatar(c, 40) + '<span class="sc-badge now">' + esc(sportLabel(c.sport)) + "</span></div>" +
      '<div class="sc-title">' + esc(c.name) + "</div>" +
      (c.desc ? '<div class="sc-subtitle">' + esc(c.desc) + "</div>" : "") +
      '<div class="sc-foot"><span class="sc-tag cat">' + icon("user", 12) + " " + memCount + '명</span>' +
      (mine ? '<span class="sc-go">입장 ›</span>' : '<button class="btn-pri btn-sm" data-action="join-club" data-id="' + esc(c.id) + '">가입하기</button>') +
      "</div></div>";
  }
  function viewHub() {
    var club = currentClub() || {}, h = "";
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 지금 입력한 내용은 이 기기에만 저장되고 다른 크루원에겐 안 보여요. <button class="link" data-action="reload-app">새로고침</button> 후 다시 시도해 주세요.</div>';
    h += '<div class="hub-head"><h1>' + esc(club.name || "일정") + '</h1><p class="hub-sub">' + esc(club.desc || sportLabel(club.sport)) + '</p></div>';
    var ranking = clubHasRanking(club);
    var tabs = [["schedule", "일정"]]; if (ranking) tabs.push(["ranking", "순위"]); tabs.push(["board", "게시판"]); tabs.push(["members", "멤버"]);
    var cur = state.hubTab || "schedule"; if (cur === "ranking" && !ranking) cur = "schedule";
    h += '<div class="hub-subnav">' + tabs.map(function (t) { return '<button class="hsub' + (cur === t[0] ? " on" : "") + '" data-action="hub-tab" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (cur === "members") h += hubMembers(club);
    else if (cur === "ranking") h += hubRanking(club);
    else if (cur === "board") h += hubBoard(club);
    else h += hubSchedule(club);
    return '<div class="hub-wrap">' + h + "</div>";
  }
  function isSessionDone(s) {
    if (s && s.match) return s.match.status === "done";
    return sessStatus(s) === "past";
  }
  function hubSchedule(club) {
    var list = sessionsOfClub(club.id);
    var active = list.filter(function (s) { return !isSessionDone(s); });
    var done = list.filter(function (s) { return isSessionDone(s); }).reverse();
    var h = '<div class="list-grid sess-grid">';
    active.forEach(function (s) { h += sessionCard(s); });
    if (isMeAdmin()) h += '<button class="card sess-add" data-action="add-session">' + icon("plus", 24) + "<span>일정 추가하기</span></button>";
    if (club.sport === "billiards" && rankCanRec(club.id)) h += '<button class="card sess-add" data-action="add-match-session">' + icon("ballot", 24) + "<span>1:1 대결 만들기</span></button>";
    h += "</div>";
    if (!active.length && !done.length && !isMeAdmin()) h += '<div class="empty-msg">아직 등록된 일정이 없어요.</div>';
    if (done.length) {
      h += '<h2 class="sec sec-done" style="margin-top:24px">완료된 일정 <span class="sec-count">' + done.length + '</span></h2>';
      h += '<div class="list-grid sess-grid">';
      done.forEach(function (s) { h += sessionCard(s, true); });
      h += "</div>";
    }
    return h;
  }
  function hubMembers(club) {
    var roster = clubRoster(club.id);
    var canMng = canManage(me), meMgr = isManager(me);
    var h = "";
    if (canMng) h += '<p class="hint" style="margin-bottom:10px">멤버 권한 관리 — <b>운영진 지정</b>·<b>크루원 삭제</b>·<b>인증번호 초기화</b>(분실 시). 운영진 해제는 관리자만.</p>';
    h += '<div class="mem-list-club">';
    roster.forEach(function (r) {
      var dm = obj(DB.members)[r.id] || {}, self = (r.id === me), tr = roleOf(r.id), acts = "";
      var bio = clampStr(dm.bio || "", 60), pres = presenceText(r.id);
      var subHtml = pres ? ('<span class="pres' + (isOnline(r.id) ? " on" : "") + '">' + pres + "</span>" + (bio ? " \u00B7 " + esc(bio) : "")) : esc(bio);
      var av = '<span class="av-wrap">' + avatar(r.id, 32) + (isOnline(r.id) ? '<span class="av-dot"></span>' : "") + "</span>";
      if (canMng && !self) {
        if (tr === "manager") { acts = ""; }
        else if (tr === "staff") {
          if (meMgr) acts += '<button class="link" data-action="set-role" data-id="' + r.id + '" data-role="crew">운영진 해제</button>';
          if (meMgr && dm.claimed) acts += '<button class="link-muted" data-action="release-claim" data-id="' + r.id + '">인증번호 초기화</button>';
        } else {
          acts += '<button class="link" data-action="set-role" data-id="' + r.id + '" data-role="staff">운영진 지정</button>';
          if (dm.claimed) acts += '<button class="link-muted" data-action="release-claim" data-id="' + r.id + '">인증번호 초기화</button>';
          acts += '<button class="link-danger" data-action="del-member" data-id="' + r.id + '">삭제</button>';
        }
      }
      h += '<div class="mem-row">' + av + '<div style="flex:1;min-width:0"><div class="mr-name">' + esc(r.name) + " " + roleTag(r.id) + (self ? ' <span class="rbadge crew">나</span>' : "") + '</div>' + (subHtml ? '<div class="mr-sub">' + subHtml + '</div>' : "") + '</div>' + (acts ? '<div class="mr-act">' + acts + '</div>' : "") + '</div>';
    });
    h += "</div>";
    h += '<div class="hint" style="margin-top:12px">멤버 ' + roster.length + '명 · 게이트의 "직접 추가"로 누구나 합류할 수 있어요.</div>';
    return h;
  }
  function hubRanking(club) {
    if (club.sport === "climbing") return climbingRanking(club);
    if (club.sport === "running") return runningRanking(club);
    return billiardsRanking(club);
  }
  function rankCanRec(cid) { return !!(me && (obj(DB.members)[me] || {}).claimed && clubRoster(cid).some(function (r) { return r.id === me; })); }
  function climbingRanking(club) {
    var cid = club.id, rows = climbStats(cid), canRec = rankCanRec(cid);
    var h = '<div class="rank-head"><div><h2 class="sec" style="margin:0">클라이밍 순위</h2><div class="hint" style="margin-top:2px">가장 어려운 완등 10개의 V 합산 점수 · 볼더링</div></div>' +
      (canRec ? '<button class="btn-pri btn-sm" data-action="add-climb">완등 기록</button>' : "") + "</div>";
    if (!rows.length) { h += '<div class="empty-msg">아직 기록된 완등이 없어요.' + (canRec ? ' 위 <b>완등 기록</b>으로 첫 완등을 남겨보세요.' : ' 크루원으로 입장하면 완등을 기록할 수 있어요.') + "</div>"; }
    else {
      h += '<div class="rank-list">';
      rows.forEach(function (a, i) { h += '<div class="rank-row"><span class="rk-no rk-' + (i < 3 ? (i + 1) : "n") + '">' + (i + 1) + "</span>" + avatar(a.id, 30) + '<div class="rk-name"><div>' + esc(a.name) + '</div><div class="rk-sub">완등 ' + a.sends + '개 · 최고 ' + fmtGrade(a.maxGrade) + '</div></div><div class="rk-avg"><div class="rk-avg-n">' + a.score + 'pt</div><div class="rk-avg-l">상위 10 점수</div></div></div>'; });
      h += "</div>";
    }
    var recs = clubRecords(cid, "climb");
    if (recs.length) {
      h += '<h2 class="sec" style="margin-top:24px">최근 완등</h2><div class="match-list">';
      recs.slice(0, 12).forEach(function (r) { var canDel = (r.by === me || canManage(me)); var cl = r.color ? climbColorLabel(r.gymId, r.color) : ""; var rt = (cl ? cl + " · " : "") + (r.gym || ""); h += '<div class="match-row"><span class="mt-p win">' + esc(memberName(r.member)) + '</span><span class="mt-vs">' + (cl ? '<span class="cc-dot ' + r.color + '"></span>' : "") + fmtGrade(r.grade) + '</span><span class="mt-p right">' + esc(rt) + '</span>' + (canDel ? '<button class="tl-del" data-action="del-record" data-id="' + r._key + '" aria-label="삭제">×</button>' : "") + "</div>"; });
      h += "</div>";
    }
    return h;
  }
  function runningRanking(club) {
    var cid = club.id, rows = runStats(cid).filter(function (a) { return a.runs > 0; }), canRec = rankCanRec(cid);
    var h = '<div class="rank-head"><div><h2 class="sec" style="margin:0">러닝 순위</h2><div class="hint" style="margin-top:2px">베스트 페이스(분/km) 기준 · 총거리 표기</div></div>' +
      (canRec ? '<button class="btn-pri btn-sm" data-action="add-run">러닝 기록</button>' : "") + "</div>";
    if (!rows.length) { h += '<div class="empty-msg">아직 기록된 러닝이 없어요.' + (canRec ? ' 위 <b>러닝 기록</b>으로 첫 러닝을 남겨보세요.' : ' 크루원으로 입장하면 러닝을 기록할 수 있어요.') + "</div>"; }
    else {
      h += '<div class="rank-list">';
      rows.forEach(function (a, i) { h += '<div class="rank-row"><span class="rk-no rk-' + (i < 3 ? (i + 1) : "n") + '">' + (i + 1) + "</span>" + avatar(a.id, 30) + '<div class="rk-name"><div>' + esc(a.name) + '</div><div class="rk-sub">' + a.runs + '회 · 총 ' + (Math.round(a.dist * 10) / 10) + 'km</div></div><div class="rk-avg"><div class="rk-avg-n">' + fmtPace(a.bestPace) + '</div><div class="rk-avg-l">베스트 페이스</div></div></div>'; });
      h += "</div>";
    }
    var recs = clubRecords(cid, "run");
    if (recs.length) {
      h += '<h2 class="sec" style="margin-top:24px">최근 러닝</h2><div class="match-list">';
      recs.slice(0, 12).forEach(function (r) { var canDel = (r.by === me || canManage(me)); var pace = (+r.dist > 0 && +r.time > 0) ? (+r.time / +r.dist) : 0; h += '<div class="match-row"><span class="mt-p win">' + esc(memberName(r.member)) + '</span><span class="mt-vs">' + (Math.round((+r.dist || 0) * 10) / 10) + 'km</span><span class="mt-p right">' + fmtPace(pace) + '/km</span>' + (canDel ? '<button class="tl-del" data-action="del-record" data-id="' + r._key + '" aria-label="삭제">×</button>' : "") + "</div>"; });
      h += "</div>";
    }
    return h;
  }
  // 순위표엔 현재 수지만 표시(추천 수지는 마이페이지에서)
  function sujiHint(a) { return "수지 " + (a.lastTarget || "-"); }
  function billiardsRanking(club) {
    var cid = club.id, rows = billiardsStats(cid).filter(function (a) { return a.games > 0; });
    var canRec = !!(me && (obj(DB.members)[me] || {}).claimed && clubRoster(cid).some(function (r) { return r.id === me; }));
    var top1 = rows.length ? rows[0].id : null, ck = null, lk = null, ckN = 0, lkN = 0;
    rows.forEach(function (a) { if (a.coffeeBuy > ckN) { ckN = a.coffeeBuy; ck = a.id; } if (a.lunchBuy > lkN) { lkN = a.lunchBuy; lk = a.id; } });
    function kb(id) { var s = (id === top1 ? "🏆" : "") + (id === ck ? "☕" : "") + (id === lk ? "🍚" : ""); return s ? ' <span class="king-badge">' + s + "</span>" : ""; }
    function betTally(a) { var s = ""; if (a.coffeeBuy) s += " ☕" + a.coffeeBuy; if (a.lunchBuy) s += " 🍚" + a.lunchBuy; return s; }
    var h = '<div class="rank-head"><div><h2 class="sec" style="margin:0">3쿠션 순위</h2><div class="hint" style="margin-top:2px">누적 에버리지(득점÷이닝) · 대대 기준</div></div>' +
      (canRec ? '<button class="btn-pri btn-sm" data-action="add-match">대전 기록</button>' : "") + "</div>";
    if (ck || lk) {
      var kp = [];
      if (ck) kp.push("☕ 커피왕 <b>" + esc(memberName(ck)) + "</b> " + ckN + "잔 삼");
      if (lk) kp.push("🍚 점심왕 <b>" + esc(memberName(lk)) + "</b> " + lkN + "번 삼");
      h += '<div class="kings-bar">' + kp.join(" · ") + "</div>";
    }
    if (!rows.length) {
      h += '<div class="empty-msg">아직 기록된 대전이 없어요.' + (canRec ? ' 위 <b>대전 기록</b>으로 첫 경기를 남겨보세요.' : ' 크루원으로 입장하면 대전을 기록할 수 있어요.') + '</div>';
    } else {
      h += '<div class="rank-list">';
      rows.forEach(function (a, i) {
        h += '<div class="rank-row">' +
          '<span class="rk-no rk-' + (i < 3 ? (i + 1) : "n") + '">' + (i + 1) + "</span>" +
          avatar(a.id, 30) +
          '<div class="rk-name"><div>' + esc(a.name) + kb(a.id) + '</div><div class="rk-sub">' + a.games + '전 ' + a.wins + '승 · ' + sujiHint(a) + betTally(a) + '</div></div>' +
          '<div class="rk-avg"><div class="rk-avg-n">' + fmtAvg(a.avg) + '</div><div class="rk-avg-l">에버리지</div></div>' +
          "</div>";
      });
      h += "</div>";
    }
    var ms = clubMatches(cid);
    if (ms.length) {
      h += '<h2 class="sec" style="margin-top:24px">최근 대전</h2><div class="match-list">';
      ms.slice(0, 12).forEach(function (m) {
        if (!m.p1 || !m.p2) return;
        var w = m.winner, canDel = (m.by === me || canManage(me));
        h += '<div class="match-row">' +
          '<span class="mt-p' + (w === m.p1.id ? " win" : "") + '">' + esc(memberName(m.p1.id)) + ' <b>' + (+m.p1.score || 0) + '</b></span>' +
          '<span class="mt-vs">' + (+m.p1.innings || 0) + '이닝' + (m.bet ? " " + (m.bet.coffee ? "☕" : "") + (m.bet.lunch ? "🍚" : "") : "") + '</span>' +
          '<span class="mt-p right' + (w === m.p2.id ? " win" : "") + '"><b>' + (+m.p2.score || 0) + '</b> ' + esc(memberName(m.p2.id)) + '</span>' +
          (canDel ? '<button class="mt-edit" data-action="edit-match" data-id="' + m._key + '" aria-label="수정">' + icon("edit", 14) + '</button><button class="tl-del" data-action="del-match" data-id="' + m._key + '" aria-label="삭제">×</button>' : "") +
          "</div>";
      });
      h += "</div>";
    }
    return h;
  }
  /* ===== 크루 게시판: 공지 / 투표 / 회비 ===== */
  function hubBoard(club) {
    var sub = state.boardTab || "notice";
    var segs = [["notice", "소식"], ["poll", "투표"], ["dues", "회비"]];
    var h = '<div class="board-seg">' + segs.map(function (t) { return '<button class="bseg' + (sub === t[0] ? " on" : "") + '" data-action="board-tab" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (sub === "poll") h += boardPolls(club);
    else if (sub === "dues") h += boardDues(club);
    else h += boardNotices(club);
    return h;
  }
  function boardNotices(club) {
    var cid = club.id, list = clubNotices(cid), mng = canManage(me), h = "";
    if (mng) h += '<button class="btn-pri btn-block" data-action="add-club-notice" style="margin-bottom:12px">' + icon("plus", 16) + " 소식 쓰기</button>";
    if (!list.length) return h + '<div class="empty-msg">아직 소식이 없어요.' + (mng ? "" : " 운영진이 글을 올리면 여기 표시돼요.") + "</div>";
    h += '<div class="list-grid">';
    list.forEach(function (n) {
      var canDel = (n.by === me || mng), rx = n.reactions || {}, rxN = Object.keys(rx).length, rxMine = !!rx[me];
      h += '<div class="card notice' + (n.pinned ? " pin" : "") + '">' + (n.pinned ? '<span class="pin-tag">' + icon("pin", 13) + ' 고정</span>' : "") +
        '<div class="notice-text">' + linkify(esc(n.text)) + "</div>" +
        '<div class="notice-by">' + (n.by ? chip(n.by) : "") + '<span class="ago">' + timeago(n.ts) + "</span>" +
        '<span class="notice-acts"><button class="react-btn' + (rxMine ? " on" : "") + '" data-action="react-notice" data-id="' + n._key + '">👍 ' + rxN + '</button>' +
        (canDel ? '<button class="tl-del" data-action="del-club-notice" data-id="' + n._key + '" aria-label="삭제">×</button>' : "") + "</span></div></div>";
    });
    return h + "</div>";
  }
  function formClubNotice() {
    openModal('<h2>소식 쓰기</h2><label>내용</label><textarea id="cn-text" rows="6" placeholder="크루에 알릴 소식·읽을거리를 자유롭게 — 링크는 자동으로 걸려요."></textarea>' +
      '<label class="chk"><input type="checkbox" id="cn-pin"> 상단 고정</label>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-club-notice">올리기</button></div>');
  }
  function boardPolls(club) {
    var cid = club.id, list = clubPolls(cid), mng = canManage(me), h = "";
    if (mng) h += '<button class="btn-pri btn-block" data-action="add-club-poll" style="margin-bottom:12px">' + icon("plus", 16) + " 투표 만들기</button>";
    if (!list.length) return h + '<div class="empty-msg">아직 투표가 없어요.' + (mng ? "" : " 운영진이 투표를 열면 여기 표시돼요.") + "</div>";
    h += '<div class="list-grid">';
    list.forEach(function (p) { h += clubPollCard(cid, p); });
    return h + "</div>";
  }
  function clubPollCard(cid, p) {
    var opts = obj(p.opts), votes = obj(p.votes), keys = Object.keys(opts);
    var total = Object.keys(votes).length, mine = votes[me], closed = !!p.closed, mng = canManage(me), canVote = !closed && rankCanRec(cid);
    var h = '<div class="card poll-card"><div class="poll-q">' + esc(p.q) + (closed ? ' <span class="sc-tag">마감</span>' : "") + "</div>";
    keys.forEach(function (k) {
      var cnt = 0; Object.keys(votes).forEach(function (mid) { if (votes[mid] === k) cnt++; });
      var pct = total ? Math.round(cnt / total * 100) : 0, sel = (mine === k);
      h += '<button class="poll-opt' + (sel ? " sel" : "") + '"' + (canVote ? ' data-action="club-vote" data-poll="' + p._key + '" data-opt="' + k + '"' : " disabled") + '>' +
        '<span class="po-bar" style="width:' + pct + '%"></span>' +
        '<span class="po-label">' + esc(opts[k]) + (sel ? " " + icon("check", 13) : "") + "</span>" +
        '<span class="po-pct">' + pct + "% · " + cnt + "</span></button>";
    });
    h += '<div class="poll-foot"><span>' + total + "명 참여</span>" + (p.by ? chip(p.by) : "");
    if (mng) h += '<span class="poll-acts">' + (closed ? "" : '<button class="link" data-action="close-club-poll" data-id="' + p._key + '">마감</button>') + '<button class="link-danger" data-action="del-club-poll" data-id="' + p._key + '">삭제</button></span>';
    return h + "</div></div>";
  }
  function clubOptInput() { return '<input class="cp-opt" placeholder="선택지" maxlength="120">'; }
  function formClubPoll() {
    openModal('<h2>새 투표</h2><label>질문</label><input id="cp-q" placeholder="예: 다음 정기모임 날짜는?" maxlength="200">' +
      '<label>선택지</label><div id="cp-opts">' + clubOptInput() + clubOptInput() + '</div>' +
      '<button class="btn-ghost sm" data-action="add-club-opt-field">+ 선택지 추가</button>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-club-poll">만들기</button></div>');
  }
  function boardDues(club) {
    var cid = club.id, list = clubDues(cid), mng = canManage(me), roster = clubRoster(cid), n = roster.length, h = "";
    if (mng) h += '<button class="btn-pri btn-block" data-action="add-club-dues" style="margin-bottom:12px">' + icon("plus", 16) + " 회비 항목 추가</button>";
    if (!list.length) return h + '<div class="empty-msg">아직 회비 항목이 없어요.' + (mng ? "" : " 운영진이 회비를 등록하면 여기 표시돼요.") + "</div>";
    h += '<div class="list-grid">';
    list.forEach(function (d) {
      var paid = obj(d.paid), paidCnt = roster.filter(function (r) { return paid[r.id]; }).length;
      var amt = +d.amount || 0, collected = paidCnt * amt, goal = n * amt, iPaid = !!paid[me], pct = n ? Math.round(paidCnt / n * 100) : 0;
      h += '<div class="card dues-card"><div class="dues-top"><div style="min-width:0"><div class="dues-title">' + esc(d.title) + "</div>" +
        '<div class="dues-amt">1인 ' + won(amt) + (d.note ? " · " + esc(d.note) : "") + "</div></div>" +
        (mng ? '<button class="tl-del" data-action="del-club-dues" data-id="' + d._key + '" aria-label="삭제">×</button>'
             : (rankCanRec(cid) ? '<span class="rbadge ' + (iPaid ? "mgr" : "crew") + '">' + (iPaid ? "납부완료" : "미납") + "</span>" : "")) + "</div>" +
        '<div class="dues-prog"><div class="dues-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="dues-stat">' + paidCnt + "/" + n + "명 납부 · " + won(collected) + " / " + won(goal) + "</div>";
      if (mng) {
        h += '<div class="dues-members">';
        roster.forEach(function (r) {
          var on = !!paid[r.id];
          h += '<button class="dues-mem' + (on ? " on" : "") + '" data-action="toggle-due-paid" data-id="' + d._key + '" data-mid="' + r.id + '">' + avatar(r.id, 22) + "<span>" + esc(r.name) + '</span><span class="dm-state">' + (on ? "납부" : "미납") + "</span></button>";
        });
        h += "</div>";
      }
      h += "</div>";
    });
    return h + "</div>";
  }
  function formClubDues() {
    openModal('<h2>회비 항목 추가</h2><label>항목명</label><input id="cd-title" placeholder="예: 2026년 상반기 회비" maxlength="100">' +
      '<label>1인당 금액 (원)</label><input id="cd-amt" type="number" inputmode="numeric" placeholder="0">' +
      '<label>메모 (선택)</label><input id="cd-note" placeholder="예: 6월 말까지" maxlength="100">' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-club-dues">등록</button></div>');
  }
  // 내기 입력 필드(커피/점심 체크 — 둘 다 = 둘다, 진 사람이 삼)
  function betField(prefix, bet) {
    bet = bet || {};
    return '<label>내기 (선택 · 진 사람이 삼)</label><div class="bet-row">' +
      '<label class="bet-chk"><input type="checkbox" id="' + prefix + '-coffee"' + (bet.coffee ? " checked" : "") + "> ☕ 커피</label>" +
      '<label class="bet-chk"><input type="checkbox" id="' + prefix + '-lunch"' + (bet.lunch ? " checked" : "") + "> 🍚 점심</label></div>";
  }
  function readBet(prefix) {
    var c = $("#" + prefix + "-coffee"), l = $("#" + prefix + "-lunch"), bet = {};
    if (c && c.checked) bet.coffee = true; if (l && l.checked) bet.lunch = true;
    return (bet.coffee || bet.lunch) ? bet : null;
  }
  function formMatch(sessionId, editKey) {
    var cid = state.clubId, roster = clubRoster(cid);
    if (!(me && (obj(DB.members)[me] || {}).claimed && roster.some(function (r) { return r.id === me; }))) { alert("크루원으로 입장한 뒤 기록할 수 있어요."); return; }
    var ed = editKey ? (obj(obj(DB.clubmatches)[cid])[editKey]) : null;
    var ep1 = ed ? (ed.p1 || {}) : {}, ep2 = ed ? (ed.p2 || {}) : {};
    var opt = function (sel) { return roster.map(function (r) { return '<option value="' + r.id + '"' + (sel === r.id ? " selected" : "") + ">" + esc(r.name) + "</option>"; }).join(""); };
    var p1def = ed ? ep1.id : me, p2def = ed ? ep2.id : "";
    var myRec = (billiardsStats(cid).filter(function (a) { return a.id === me; })[0] || {}).recSuji;
    var v = function (x) { return (x || x === 0) ? ' value="' + x + '"' : ""; };
    openModal("<h2>" + (ed ? "대전 수정" : "3쿠션 대전 기록") + "</h2>" +
      '<p class="hint" style="margin:-4px 0 10px">대대(큰 테이블) 기준' + "</p>" +
      '<div class="mt-form">' +
      '<div class="mt-col"><label>선수 1</label><select id="m-p1">' + opt(p1def) + "</select>" +
        '<div class="mt-3"><span><label>목표(수지)</label><input id="m-t1" type="number" inputmode="numeric" min="1" placeholder="' + (myRec ? "추천 " + myRec : "예 20") + '"' + v(ep1.target) + "></span><span><label>득점</label><input id=\"m-s1\" type=\"number\" inputmode=\"numeric\" min=\"0\"" + v(ep1.score) + "></span></div></div>" +
      '<div class="mt-col"><label>선수 2</label><select id="m-p2"><option value="">상대 선수 선택…</option>' + opt(p2def) + "</select>" +
        '<div class="mt-3"><span><label>목표(수지)</label><input id="m-t2" type="number" inputmode="numeric" min="1" placeholder="예 15"' + v(ep2.target) + "></span><span><label>득점</label><input id=\"m-s2\" type=\"number\" inputmode=\"numeric\" min=\"0\"" + v(ep2.score) + "></span></div></div>" +
      '<label>이닝 수 (공통)</label><input id="m-inn" type="number" inputmode="numeric" min="1" placeholder="예: 25"' + v(ep1.innings) + ">" +
      betField("m-bet", ed ? ed.bet : null) +
      '<input type="hidden" id="m-session" value="' + esc(ed ? (ed.sessionId || "") : (sessionId || "")) + '">' +
      '<input type="hidden" id="m-edit" value="' + esc(editKey || "") + '">' +
      "</div>" +
      '<div id="m-err" class="pin-err"></div>' +
      '<div class="modal-foot">' + (ed ? '<button class="link-danger" data-action="del-match" data-id="' + esc(editKey) + '">삭제</button>' : "") + '<button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-match">' + (ed ? "저장" : "기록") + "</button></div>");
  }
  function saveMatch() {
    var cid = state.clubId, roster = clubRoster(cid);
    if (!(me && (obj(DB.members)[me] || {}).claimed && roster.some(function (r) { return r.id === me; }))) return;
    var err = $("#m-err");
    var p1 = ($("#m-p1") || {}).value, p2 = ($("#m-p2") || {}).value;
    if (!p1 || !p2 || p1 === p2) { if (err) err.textContent = "서로 다른 두 선수를 골라주세요."; return; }
    var t1 = +(($("#m-t1") || {}).value) || 0, s1 = +(($("#m-s1") || {}).value) || 0;
    var t2 = +(($("#m-t2") || {}).value) || 0, s2 = +(($("#m-s2") || {}).value) || 0;
    var inn = +(($("#m-inn") || {}).value) || 0;
    if (inn < 1) { if (err) err.textContent = "이닝 수를 입력해주세요."; return; }
    if (s1 < 0 || s2 < 0) { if (err) err.textContent = "득점을 확인해주세요."; return; }
    var r1 = t1 > 0 && s1 >= t1, r2 = t2 > 0 && s2 >= t2, winner;
    if (r1 && !r2) winner = p1; else if (r2 && !r1) winner = p2; else winner = (s1 === s2) ? "" : (s1 > s2 ? p1 : p2);
    var editKey = (($("#m-edit") || {}).value) || "";
    var prev = editKey ? (obj(obj(DB.clubmatches)[cid])[editKey]) : null;
    var sid = (($("#m-session") || {}).value) || null;
    var match = { ts: (prev ? prev.ts : Date.now()), by: (prev ? prev.by : me), sessionId: sid, p1: { id: p1, target: t1, score: s1, innings: inn }, p2: { id: p2, target: t2, score: s2, innings: inn }, winner: winner };
    var bet = readBet("m-bet"); if (bet) match.bet = bet;
    var mk = editKey || key();
    armRetry(function () { formMatch(sid, editKey || null); });
    Store.set("clubmatches/" + cid + "/" + mk, match);
    DB.clubmatches = DB.clubmatches || {}; DB.clubmatches[cid] = DB.clubmatches[cid] || {}; DB.clubmatches[cid][mk] = match;
    closeModal(); render();
  }
  function rankMemberOpt(cid, sel) { return clubRoster(cid).map(function (r) { return '<option value="' + r.id + '"' + (sel === r.id ? " selected" : "") + ">" + esc(r.name) + "</option>"; }).join(""); }
  function saveRecord(rec) { var cid = state.clubId; if (!rankCanRec(cid)) return; var rk = key(); Store.set("clubrecords/" + cid + "/" + rk, rec); DB.clubrecords = DB.clubrecords || {}; DB.clubrecords[cid] = DB.clubrecords[cid] || {}; DB.clubrecords[cid][rk] = rec; closeModal(); render(); }
  function formClimb(sessionId) {
    var cid = state.clubId; if (!rankCanRec(cid)) { alert("크루원으로 입장한 뒤 기록할 수 있어요."); return; }
    var sid = sessionId || "";
    var gymOpts = climbGymList().map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("");
    openModal("<h2>완등 기록</h2>" +
      '<p class="hint" style="margin:-4px 0 10px">암장을 고르고 색깔을 누르면 V등급으로 환산돼요</p>' +
      '<label>멤버</label><select id="c-member">' + rankMemberOpt(cid, me) + "</select>" +
      '<label>암장</label><select id="c-gym-sel">' + gymOpts + "</select>" +
      '<div id="c-color-wrap"></div>' +
      '<input type="hidden" id="c-grade" value="0"><input type="hidden" id="c-color" value="">' +
      '<input type="hidden" id="c-session" value="' + esc(sid) + '">' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-climb">기록</button></div>');
    var sel = $("#c-gym-sel");
    if (sel) { sel.addEventListener("change", function () { renderClimbColors(this.value); }); renderClimbColors(sel.value); }
  }
  function renderClimbColors(gymId) {
    var wrap = $("#c-color-wrap"); if (!wrap) return;
    var cg = $("#c-grade"), cc = $("#c-color"); if (cg) cg.value = "0"; if (cc) cc.value = "";
    var g = climbGymById(gymId);
    if (!g || g.manual) {  // 직접 입력(기타) — 색표 없는 암장
      var grades = ""; for (var i = 0; i <= 12; i++) grades += '<option value="' + i + '">V' + i + "</option>";
      wrap.innerHTML = '<label>난이도 (V스케일)</label><select id="c-grade-manual">' + grades + "</select>" +
        '<label>암장명 (선택)</label><input id="c-gym-name" maxlength="30" placeholder="예: 비블럭 연남">';
      return;
    }
    var chips = climbGymColors(g).map(function (c) {
      return '<button type="button" class="climb-color" data-action="pick-climb-color" data-v="' + c.v + '" data-color="' + c.key + '"><span class="cc-dot ' + c.key + '"></span>' + esc(c.label) + ' <i>V' + c.v + "</i></button>";
    }).join("");
    wrap.innerHTML = '<label>색깔 난이도</label><div class="climb-colors">' + chips + "</div>" +
      '<div class="climb-pick" id="c-pick-label">색을 누르면 V등급으로 환산돼요</div>';
  }
  function saveClimb() {
    var member = ($("#c-member") || {}).value; if (!member) return;
    var sid = (($("#c-session") || {}).value) || null;
    var g = climbGymById((($("#c-gym-sel") || {}).value) || "");
    var grade, gymName, color = "", gymId = g ? g.id : "";
    if (!g || g.manual) {  // 직접 입력
      grade = +(($("#c-grade-manual") || {}).value) || 0;
      gymName = clampStr(($("#c-gym-name") || {}).value, 30);
    } else {               // 암장 색 → V 환산
      color = (($("#c-color") || {}).value) || "";
      if (!color) { alert("색깔(난이도)을 선택하세요"); return; }
      grade = +(($("#c-grade") || {}).value) || 0;
      gymName = g.name;
    }
    armRetry(function () { formClimb(sid); });
    saveRecord({ ts: Date.now(), by: me, kind: "climb", member: member, grade: grade, gym: gymName, gymId: gymId, color: color, sessionId: sid });
  }
  function formRun(sessionId) {
    var cid = state.clubId; if (!rankCanRec(cid)) { alert("크루원으로 입장한 뒤 기록할 수 있어요."); return; }
    var sid = sessionId || "";
    openModal("<h2>러닝 기록</h2>" +
      '<label>멤버</label><select id="r-member">' + rankMemberOpt(cid, me) + "</select>" +
      '<div class="mt-3"><span><label>거리 (km)</label><input id="r-dist" type="number" inputmode="decimal" min="0" step="0.1" placeholder="예 5"></span><span><label>시간 (분)</label><input id="r-time" type="number" inputmode="decimal" min="0" step="0.1" placeholder="예 27.5"></span></div>' +
      '<input type="hidden" id="r-session" value="' + esc(sid) + '">' +
      '<div id="r-err" class="pin-err"></div>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-run">기록</button></div>');
  }
  function saveRun() {
    var member = ($("#r-member") || {}).value, dist = +(($("#r-dist") || {}).value) || 0, time = +(($("#r-time") || {}).value) || 0, err = $("#r-err");
    if (!member) return;
    if (dist <= 0 || time <= 0) { if (err) err.textContent = "거리와 시간을 입력해주세요."; return; }
    var sid = (($("#r-session") || {}).value) || null;
    armRetry(function () { formRun(sid); });
    saveRecord({ ts: Date.now(), by: me, kind: "run", member: member, dist: dist, time: time, sessionId: sid });
  }
  function matchCard(s, completed) {
    var m = s.match || {}, done = m.status === "done", p1 = m.p1 || {}, p2 = m.p2 || {};
    var clickable = !completed || canManage(me);
    return '<div class="card sess-card acc-' + esc((clubById(s.clubId) || {}).accent || s.accent || "blue") + (completed ? " done" : "") + '"' + (clickable ? ' data-action="open-session" data-id="' + esc(s.id) + '"' : "") + '>' +
      '<div class="sc-top"><span class="sc-emoji">' + icon("ball", 21) + '</span><span class="sc-badge ' + (done ? "past" : "now") + '">' + (done ? "종료" : "진행 중") + "</span></div>" +
      '<div class="sc-title">' + esc(memberName(p1.id)) + " vs " + esc(memberName(p2.id)) + "</div>" +
      '<div class="sc-meta"><div>' + icon("ballot", 14) + " 3쿠션 대결 · 수지 " + (p1.target || "-") + ":" + (p2.target || "-") + "</div>" + (s.startDate ? "<div>" + icon("calendar", 14) + " " + esc(dateRangeKo(s.startDate, s.endDate)) + "</div>" : "") + "</div>" +
      (done ? '<div class="sc-summary">' + (m.p1score || 0) + " : " + (m.p2score || 0) + " · " + icon("trophy", 13) + " " + esc(memberName(m.winner)) + "</div>" : "") +
      '<div class="sc-foot"><span class="sc-tag cat">1:1 대결</span><span class="sc-go">' + (clickable ? ((done ? "결과 보기" : "결과 입력") + " ›") : "완료") + "</span></div></div>";
  }
  function formMatchSession() {
    var cid = state.clubId, roster = clubRoster(cid);
    if (!rankCanRec(cid)) { alert("크루원으로 입장한 뒤 만들 수 있어요."); return; }
    var p2def = "";
    var opt = function (sel) { return roster.map(function (r) { return '<option value="' + r.id + '"' + (sel === r.id ? " selected" : "") + ">" + esc(r.name) + "</option>"; }).join(""); };
    openModal("<h2>1:1 대결 일정</h2>" +
      '<p class="hint" style="margin:-4px 0 10px">대대(큰 테이블) 3쿠션. 각자 수지를 미리 정해두고, 대결 후 결과를 입력하면 순위에 반영돼요.</p>' +
      '<div class="mt-form">' +
      '<div class="mt-col"><label>선수 1</label><select id="ms-p1">' + opt(me) + "</select>" +
        '<div class="mt-3"><span><label>수지(목표)</label><input id="ms-t1" type="number" inputmode="numeric" min="1" placeholder="예 20"></span></div></div>' +
      '<div class="mt-col"><label>선수 2</label><select id="ms-p2"><option value="">상대 선수 선택…</option>' + opt(p2def) + "</select>" +
        '<div class="mt-3"><span><label>수지(목표)</label><input id="ms-t2" type="number" inputmode="numeric" min="1" placeholder="예 15"></span></div></div>' +
      '<label>날짜 (선택)</label><input id="ms-date" type="date">' +
      "</div>" +
      '<div id="ms-err" class="pin-err"></div>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-match-session">대결 만들기</button></div>');
  }
  function viewMatchSession(s) {
    var m = s.match || {}, cid = s.clubId, done = m.status === "done", p1 = m.p1 || {}, p2 = m.p2 || {}, canFin = rankCanRec(cid);
    var h = '<div class="hub-wrap"><div class="match-detail">';
    h += '<div class="md-vs">' +
      '<div class="md-player">' + avatar(p1.id, 56) + '<div class="md-name">' + esc(memberName(p1.id)) + '</div><div class="md-suji">수지 ' + (p1.target || "-") + '</div></div>' +
      '<div class="md-mid">' + (done ? '<div class="md-score">' + (m.p1score || 0) + " : " + (m.p2score || 0) + "</div>" : '<div class="md-vs-txt">VS</div>') + "</div>" +
      '<div class="md-player">' + avatar(p2.id, 56) + '<div class="md-name">' + esc(memberName(p2.id)) + '</div><div class="md-suji">수지 ' + (p2.target || "-") + "</div></div></div>";
    if (done) {
      h += '<div class="md-result">' + icon("trophy", 16) + ' <b>' + esc(memberName(m.winner)) + "</b> 승 · 순위에 반영됐어요</div>";
      h += '<button class="btn-line btn-block" data-action="go-club-ranking" style="margin-top:12px">크루 순위 보기 ›</button>';
    } else if (canFin) {
      h += '<h2 class="sec" style="margin-top:20px">대결 결과 입력</h2>' +
        '<label>승자</label><div class="toggle2"><button type="button" id="md-w1" class="on" data-action="md-pick-winner" data-w="p1">' + esc(memberName(p1.id)) + '</button><button type="button" id="md-w2" data-action="md-pick-winner" data-w="p2">' + esc(memberName(p2.id)) + '</button></div>' +
        '<input type="hidden" id="md-winner" value="p1">' +
        '<div class="mt-3"><span><label>' + esc(memberName(p1.id)) + ' 득점</label><input id="md-s1" type="number" inputmode="numeric" min="0"></span><span><label>' + esc(memberName(p2.id)) + ' 득점</label><input id="md-s2" type="number" inputmode="numeric" min="0"></span></div>' +
        '<label>이닝 수 (공통)</label><input id="md-inn" type="number" inputmode="numeric" min="1" placeholder="예 25">' +
        betField("md-bet", null) +
        '<div id="md-err" class="pin-err"></div>' +
        '<button class="btn-pri btn-block" data-action="finish-match" data-sid="' + esc(s.id) + '" style="margin-top:14px">대결 종료 · 순위 반영</button>';
    } else {
      h += '<div class="empty-msg" style="margin-top:16px">진행 중인 대결이에요. 멤버가 결과를 입력하면 순위에 반영돼요.</div>';
    }
    return h + "</div></div>";
  }
  function sessionCard(s, completed) {
    if (s.match) return matchCard(s, completed);
    var st = sessStatus(s), isApp = s.kind === "app";
    var clickable = !completed || canManage(me);
    return '<div class="card sess-card acc-' + esc((clubById(s.clubId) || {}).accent || s.accent || "red") + " st-" + st + (completed ? " done" : "") + '"' + (clickable ? ' data-action="open-session" data-id="' + esc(s.id) + '"' : "") + '>' +
      '<div class="sc-top"><span class="sc-emoji">' + (s.emoji || "📌") + '</span><span class="sc-badge ' + st + '">' + esc(sessStatusLabel(s)) + "</span></div>" +
      '<div class="sc-title">' + esc(s.title) + "</div>" +
      (s.subtitle ? '<div class="sc-subtitle">' + esc(s.subtitle) + "</div>" : "") +
      '<div class="sc-meta">' +
        "<div>" + icon("calendar", 14) + " " + esc(dateRangeKo(s.startDate, s.endDate)) + "</div>" +
        (s.location ? "<div>" + icon("pin", 14) + " " + esc(s.location) + "</div>" : "") +
        (s.lodging ? "<div>" + icon("home", 14) + " " + esc(s.lodging) + "</div>" : "") +
      "</div>" +
      (s.summary ? '<div class="sc-summary">' + esc(s.summary) + "</div>" : "") +
      '<div class="sc-foot"><span class="sc-tag cat">' + esc(s.category || "모임") + '</span><span class="sc-go">' + (clickable ? ((isApp ? "입장" : "자세히") + " ›") : "완료") + "</span></div>" +
      "" +
      "</div>";
  }

  /* 읽기전용 일정 상세 (info 카드) */
  function viewSessionInfo(s) {
    var d = (s && s.detail) || {}, h = '<div class="sinfo acc-' + esc((clubById(s.clubId) || {}).accent || s.accent || "red") + '">';
    h += '<div class="sinfo-hero"><span class="sih-emoji">' + (s.emoji || "📌") + "</span>" +
      '<div class="sih-badge">' + esc(sessStatusLabel(s)) + "</div>" +
      '<div class="sih-title">' + esc(s.title) + "</div>" +
      (s.subtitle ? '<div class="sih-sub">' + esc(s.subtitle) + "</div>" : "") +
      '<div class="sih-meta">' +
        "<div>" + icon("calendar", 14) + " " + esc(dateRangeKo(s.startDate, s.endDate)) + "</div>" +
        (s.location ? "<div>" + icon("pin", 14) + " " + esc(s.location) + (s.address ? " · " + esc(s.address) : "") + "</div>" : "") +
        (s.lodging ? "<div>" + icon("home", 14) + " " + esc(s.lodging) + "</div>" : "") +
      "</div></div>";
    if (d.intro && d.intro.length) { h += '<div class="sinfo-intro">'; d.intro.forEach(function (line) { h += '<div class="sii">' + linkify(esc(line)) + "</div>"; }); h += "</div>"; }
    (d.sections || []).forEach(function (sec) {
      h += '<div class="card sinfo-sec"><h2 class="sis-title">' + (sec.icon ? '<span class="sis-ic">' + icon(sec.icon, 16) + "</span>" : "") + esc(sec.title) + "</h2>";
      if (sec.rows && sec.rows.length) { h += '<div class="sis-rows">'; sec.rows.forEach(function (r) { h += '<div class="sir"><div class="sir-k">' + esc(r[0]) + '</div><div class="sir-v">' + linkify(esc(r[1])) + "</div></div>"; }); h += "</div>"; }
      if (sec.bullets && sec.bullets.length) { h += '<ul class="sis-bul">'; sec.bullets.forEach(function (b) { h += "<li>" + linkify(esc(b)) + "</li>"; }); h += "</ul>"; }
      if (sec.checklist && sec.checklist.length) { h += '<ul class="sis-chk">'; sec.checklist.forEach(function (c) { h += "<li>" + icon("check", 15) + "<span>" + linkify(esc(c)) + "</span></li>"; }); h += "</ul>"; }
      if (sec.note) h += '<div class="sis-note">' + linkify(esc(sec.note)) + "</div>";
      if (sec.foot) h += '<div class="sis-foot">' + linkify(esc(sec.foot)) + "</div>";
      if (sec.link) h += '<a class="sis-link" href="' + esc(sec.link.url) + '" target="_blank" rel="noopener">' + icon("link", 14) + " " + esc(sec.link.label) + "</a>";
      h += "</div>";
    });
    if (!(d.intro && d.intro.length) && !(d.sections && d.sections.length)) h += '<div class="empty">아직 상세 정보가 없는 일정이에요.<br>운영진이 노션·공지에서 내용을 채워줄 거예요.</div>';
    if (s.notionUrl) h += '<a class="sinfo-notion" href="' + esc(s.notionUrl) + '" target="_blank" rel="noopener">' + icon("link", 15) + " 노션에서 원본 일정 보기</a>";
    return h + "</div>";
  }

  function clubManageSheet() {
    if (!canManage(me)) return;
    var club = currentClub() || {};
    openModal('<h2>크루 관리</h2>' +
      '<p class="hint" style="margin:-4px 0 14px">' + esc(club.name || "크루") + ' 정보를 수정하거나, 크루를 삭제할 수 있어요.</p>' +
      '<button class="btn-line btn-block" data-action="edit-club" data-id="' + esc(club.id) + '">크루 정보 수정</button>' +
      (club._user ? '<button class="link-danger" data-action="del-club" data-id="' + esc(club.id) + '" style="display:block;width:100%;text-align:center;margin-top:14px">크루 삭제</button>' : "") +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">닫기</button></div>');
  }
  /* 크루 개설/수정 폼 (운영진) */
  function formAddClub(editId) {
    if (!isMeAdmin()) return;
    var ed = editId ? clubById(editId) : null;
    var sports = [["climbing", "클라이밍"], ["billiards", "당구"], ["running", "러닝"], ["general", "일반"]];
    var emojis = ["🧗", "🎱", "🏃", "🏅", "⚽", "🏀", "🏸", "🎾", "🚴", "🧘", "🥾", "🏊"];
    var accents = [["red", "레드"], ["blue", "블루"], ["green", "그린"], ["purple", "퍼플"], ["orange", "오렌지"]];
    var curEmoji = ed && ed.emoji ? ed.emoji : emojis[0], curAcc = ed && ed.accent ? ed.accent : "red", curSport = ed && ed.sport ? ed.sport : "climbing";
    var curVis = (ed && ed.visibility === "private") ? "private" : "public";
    if (emojis.indexOf(curEmoji) < 0) emojis.unshift(curEmoji);
    openModal("<h2>" + (ed ? "크루 수정" : "크루 개설") + "</h2>" +
      '<label>종목</label><div class="seg">' + sports.map(function (sp) { return '<button type="button" class="seg-b' + (sp[0] === curSport ? " on" : "") + '" data-action="pick-sport" data-s="' + sp[0] + '">' + sp[1] + "</button>"; }).join("") + '<input type="hidden" id="f-csport" value="' + curSport + '"></div>' +
      '<label>이모지</label><div class="emoji-pick" id="f-cemoji-wrap">' + emojis.map(function (e) { return '<button type="button" class="emoji-b' + (e === curEmoji ? " on" : "") + '" data-action="pick-cemoji" data-e="' + e + '">' + e + "</button>"; }).join("") + '<input type="hidden" id="f-cemoji" value="' + esc(curEmoji) + '"></div>' +
      '<label>크루 이름</label><input id="f-cname" placeholder="예: 강남 3구 당구 크루" value="' + (ed ? esc(ed.name || "") : "") + '">' +
      '<label>한 줄 소개 (선택)</label><input id="f-cdesc" placeholder="예: 매주 수요일 저녁 모임" value="' + (ed ? esc(ed.desc || "") : "") + '">' +
      '<label>색상</label><div class="seg">' + accents.map(function (a) { return '<button type="button" class="seg-b' + (a[0] === curAcc ? " on" : "") + '" data-action="pick-accent" data-a="' + a[0] + '">' + a[1] + "</button>"; }).join("") + '<input type="hidden" id="f-saccent" value="' + curAcc + '"></div>' +
      '<label>공개 설정</label><div class="seg">' + [["public", "공개"], ["private", "비공개"]].map(function (v) { return '<button type="button" class="seg-b' + (v[0] === curVis ? " on" : "") + '" data-action="pick-vis" data-v="' + v[0] + '">' + v[1] + "</button>"; }).join("") + '<input type="hidden" id="f-cvis" value="' + curVis + '"></div>' +
      '<p class="pf-note" style="margin:-8px 0 4px">공개=탐색에 노출되어 누구나 가입 · 비공개=직접 추가(초대)로만</p>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-club"' + (ed ? ' data-edit="' + esc(editId) + '"' : "") + '>' + (ed ? "저장" : "개설") + "</button></div>");
  }
  /* 일정 추가 폼 (운영진) */
  function formAddSession(editId) {
    if (!isMeAdmin()) return;
    var ed = editId ? sessionById(editId) : null;
    var emojis = ["\uD83C\uDFD6\uFE0F", "\uD83E\uDDD7", "\u26FA", "\uD83C\uDFD4\uFE0F", "\uD83C\uDFBF", "\uD83C\uDFD5\uFE0F", "\uD83C\uDF7B", "\uD83C\uDF89", "\uD83D\uDE97", "\uD83C\uDF0A", "\uD83C\uDF41", "\u2744\uFE0F"];
    var accents = [["red", "\uB808\uB4DC"], ["blue", "\uBE14\uB8E8"], ["green", "\uADF8\uB9B0"], ["purple", "\uD37C\uD50C"], ["orange", "\uC624\uB80C\uC9C0"]];
    var curEmoji = ed && ed.emoji ? ed.emoji : emojis[0], curAcc = ed && ed.accent ? ed.accent : "red";
    if (emojis.indexOf(curEmoji) < 0) emojis.unshift(curEmoji);
    var sparts = ed ? obj(DB.participants) : null;
    var spOn = function (mid) { return (ed && sparts && Object.keys(sparts).length) ? !!sparts[mid] : false; };
    openModal("<h2>" + (ed ? "\uC138\uC158 \uC218\uC815" : "\uC138\uC158 \uCD94\uAC00\uD558\uAE30") + "</h2>" +
      '<p class="pf-note" style="margin:0 0 12px">' + (ed ? "\uC138\uC158 \uC815\uBCF4\uB97C \uC218\uC815\uD574\uC694." : "\uC0C8 \uC138\uC158\uC744 \uCD94\uAC00\uD574\uC694. \uCD94\uAC00\uD558\uBA74 \uD648\u00B7\uC815\uC0B0\u00B7\uCE74\uD480\u00B7\uC568\uBC94\u00B7\uC900\uBE44\uBB3C\uC774 \uC788\uB294 \uC2E4\uC2DC\uAC04 \uC138\uC158\uC73C\uB85C \uC5F4\uB824\uC694.") + '</p>' +
      '<label>이모지</label><div class="emoji-pick" id="f-emoji-wrap">' + emojis.map(function (e) { return '<button type="button" class="emoji-b' + (e === curEmoji ? " on" : "") + '" data-action="pick-emoji" data-e="' + e + '">' + e + "</button>"; }).join("") + '<input type="hidden" id="f-emoji" value="' + esc(curEmoji) + '"></div>' +
      '<label>\uC81C\uBAA9</label><input id="f-stitle" placeholder="\uC608: \uC288\uD37C\uB9AC\uCE58\uD0A4\uB4DC \uB3D9\uACC4 MT" value="' + (ed ? esc(ed.title || "") : "") + '">' +
      '<label>\uD55C \uC904 \uC124\uBA85 (\uC120\uD0DD)</label><input id="f-ssub" placeholder="\uC608: \uC2A4\uD0A4 + \uC628\uCC9C" value="' + (ed ? esc(ed.subtitle || "") : "") + '">' +
      '<div class="row2"><div><label>\uC2DC\uC791\uC77C</label><input id="f-sstart" type="date" value="' + (ed ? esc(ed.startDate || "") : "") + '"></div>' +
      '<div><label>\uC885\uB8CC\uC77C</label><input id="f-send" type="date" value="' + (ed ? esc(ed.endDate || "") : "") + '"></div></div>' +
      '<label>\uC7A5\uC18C (\uC120\uD0DD)</label><input id="f-sloc" placeholder="\uC608: \uBE44\uBC1C\uB514\uD30C\uD06C" value="' + (ed ? esc(ed.location || "") : "") + '">' +
      '<label>\uC0C9\uC0C1</label><div class="seg">' + accents.map(function (a) { return '<button type="button" class="seg-b' + (a[0] === curAcc ? " on" : "") + '" data-action="pick-accent" data-a="' + a[0] + '">' + a[1] + "</button>"; }).join("") + '<input type="hidden" id="f-saccent" value="' + esc(curAcc) + '"></div>' +
      '<label>분류</label><select id="f-scat">' + ["정기 모임", "외부 활동", "MT·여행", "대회·시합", "번개", "기타"].map(function (cc) { var curC = (ed && ed.category) || "정기 모임"; return '<option' + (cc === curC ? " selected" : "") + ">" + cc + "</option>"; }).join("") + '</select>' +
      '<label>기능</label><div class="feat-row"><label class="chk"><input type="checkbox" class="f-feat" value="carpool"' + (((ed && ed.features) ? ed.features.indexOf("carpool") >= 0 : !!ed) ? " checked" : "") + '> 카풀</label><label class="chk"><input type="checkbox" class="f-feat" value="settle"' + (((ed && ed.features) ? ed.features.indexOf("settle") >= 0 : !!ed) ? " checked" : "") + '> 정산·준비물</label></div>' +
      '<p class="pf-note" style="margin:-4px 0 6px">단순 모임은 꺼두면 카풀·정산 탭이 숨겨져요. MT·여행이면 켜두세요.</p>' +
      '<label>\uCC38\uAC00 \uD06C\uB8E8\uC6D0 <button class="mini" data-action="sess-part-all">\uC804\uCCB4</button><button class="mini" data-action="sess-part-none">\uD574\uC81C</button></label>' +
      '<p class="pf-note" style="margin:0 0 8px">\uC774 \uC138\uC158\uC5D0 \uCC38\uAC00\uD560 \uC0AC\uB78C\uB9CC \uACE8\uB77C\uC694. \uC815\uC0B0\u00B7\uCE74\uD480\u00B7\uD22C\uD45C\uAC00 \uC120\uD0DD\uD55C \uC0AC\uB78C \uAE30\uC900\uC73C\uB85C \uAD6C\uC131\uB3FC\uC694.</p>' +
      '<div class="part-grid">' + clubRoster().map(function (m) { return '<label class="pchk"><input type="checkbox" class="f-sess-part" value="' + m.id + '"' + (spOn(m.id) ? " checked" : "") + ">" + avatar(m.id, 24) + "<span>" + esc(m.name) + "</span></label>"; }).join("") + '</div>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">\uCDE8\uC18C</button><button class="btn-pri" data-action="save-session"' + (ed ? ' data-edit="' + esc(editId) + '"' : "") + '>' + (ed ? "\uC800\uC7A5" : "\uCD94\uAC00") + "</button></div>");
  }
  function sessionSkillCard(club) {
    var sid = state.sessionId, cid = club.id, sport = club.sport, canRec = rankCanRec(cid);
    var label = sport === "billiards" ? "3쿠션 대전" : sport === "climbing" ? "완등" : "러닝";
    var act = sport === "billiards" ? "add-match" : sport === "climbing" ? "add-climb" : "add-run";
    var n = sport === "billiards"
      ? clubMatches(cid).filter(function (m) { return m.sessionId === sid; }).length
      : clubRecords(cid, sport === "climbing" ? "climb" : "run").filter(function (r) { return r.sessionId === sid; }).length;
    var h = '<div class="card col"><div class="ms-row"><span>' + icon("ballot", 16) + ' 이 일정 ' + esc(label) + ' 기록</span>' + (n ? '<span class="ms-amt" style="font-size:12px">' + n + '건</span>' : '') + "</div>";
    if (canRec) h += '<button class="btn-line btn-block" data-action="' + act + '" data-session="' + esc(sid) + '" style="margin-top:10px">' + esc(label) + ' 기록하기</button>';
    h += '<button class="link" data-action="go-club-ranking" style="display:block;width:100%;text-align:center;margin-top:10px">크루 순위 보기 ›</button>';
    return h + "</div>";
  }
  function viewHome() {
    var t = tripMeta();
    var openPolls = entries(DB.polls).filter(function (kv) { return (kv[1] || {}).status !== "closed"; });
    var packArr = entries(DB.packing);
    var packDone = packArr.filter(function (kv) { var p = kv[1] || {}; return p.type === "personal" ? readyCount(p) >= memberCount() : p.done; }).length;
    var bal = computeBalances(), myNet = Math.round(bal[me] || 0);
    var mapUrl = "https://map.naver.com/v5/search/" + encodeURIComponent(t.address || t.location || "");
    var h = "";
    if (Store.mode === "demo") h += '<div class="demo-note">' + icon("alert", 14) + ' <b>오프라인 임시 모드</b> — 실시간 연결이 안 돼, 지금 입력한 투표·정산·공지는 이 기기에만 저장되고 다른 크루원에겐 안 보여요. <button class="link" data-action="reload-app">새로고침</button> 후 다시 시도해 주세요.</div>';
    h += notifBanners();
    var heroImg = obj(DB.trip).heroImage || t.heroImage || "";
    var heroStyle = heroImg ? ' style="background-image:linear-gradient(180deg, rgba(0,0,0,.34) 0%, rgba(0,0,0,.68) 100%), url(' + esc(heroBg(heroImg)) + ')"' : "";
    h += '<div class="hero' + (heroImg ? " has-img" : "") + '"' + heroStyle + ">" +
      (isMeAdmin() ? '<button class="hero-edit" data-action="pick-hero" aria-label="배경 변경"' + (heroBusy ? " disabled" : "") + ">" + icon("camera", 15) + (heroBusy ? '<span class="he-busy"></span>' : "") + "</button>" : "") +
      '<div class="hero-dday">' + ddayLabel() + "</div>" +
      '<div class="hero-title">' + esc(t.title || "") + "</div>" + (t.subtitle ? '<div class="hero-sub">' + esc(t.subtitle) + "</div>" : '<div style="height:10px"></div>') +
      '<div class="hero-meta"><div>' + icon("calendar", 14) + " " + dateKo(t.startDate) + " → " + dateKo(t.endDate) + "</div>" +
      '<div>' + icon("pin", 14) + ' <a href="' + mapUrl + '" target="_blank" rel="noopener">' + esc(t.location || "") + "</a> · " + esc(t.address || "") + "</div>" +
      '<div>' + icon("home", 14) + " " + esc(t.lodging || "") + (t.airbnbUrl ? ' · <a href="' + esc(t.airbnbUrl) + '" target="_blank" rel="noopener">숙소 보기</a>' : "") + "</div>" +
      (t.note ? '<div class="hero-note">' + esc(t.note) + "</div>" : "") + "</div></div>";

    // 이 일정 공지/안내 — 일정 정보는 일정 안에서 (v37서 빠졌던 표시 복구, 세션 스코프)
    var _nl = bySort(entries(DB.notices), function (kv) { return -((kv[1].pinned ? 1e15 : 0) + (kv[1].ts || 0)); });
    if (_nl.length || canManage(me)) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px"><h2 class="sec" style="margin:0">공지</h2>' + (canManage(me) ? '<button class="btn-ghost sm" data-action="new-notice" style="margin:0">' + icon("plus", 14) + ' 공지\</button>' : "") + "</div>";
      if (!_nl.length) h += '<div class="empty-msg">아직 공지가 없어요. 이 일정 관련 안내를 여기에 올려요.</div>';
      else { h += '<div class="list-grid">'; _nl.forEach(function (kv) { var n = kv[1], _ce = (n.by === me || canManage(me)); h += '<div class="card notice' + (n.pinned ? " pin" : "") + '">' + (n.pinned ? '<span class="pin-tag">' + icon("pin", 13) + ' 고정</span>' : "") + '<div class="notice-text">' + linkify(esc(n.text)) + "</div>" + (n.link ? '<a class="tl-link" href="' + esc(n.link) + '" target="_blank" rel="noopener">' + icon("link", 13) + " 링크 바로가기</a>" : "") + '<div class="notice-by">' + (n.by ? chip(n.by) : "") + '<span class="ago">' + timeago(n.ts) + "</span>" + (_ce ? '<span class="notice-acts"><button class="link" data-action="edit-notice" data-id="' + kv[0] + '">' + icon("edit", 14) + " 수정</button><button class=\"cmt-del\" data-action=\"del-notice\" data-id=\"" + kv[0] + '">×</button></span>' : "") + "</div></div>"; }); h += "</div>"; }
    }

    // 결정(투표) — 숙소·코스 등 함께 정하기 (옛 세션 투표 복구, 진행 중인 것만 노출)
    if (openPolls.length || isMeAdmin()) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px"><h2 class="sec" style="margin:0">결정</h2>' + (isMeAdmin() ? '<button class="btn-ghost sm" data-action="new-poll" style="margin:0">' + icon("plus", 14) + ' 투표</button>' : "") + "</div>";
      if (!openPolls.length) h += '<div class="empty-msg">진행 중인 투표가 없어요. 숙소·코스 같은 결정을 투표로 함께 정해요.</div>';
      else { h += '<div class="list-grid">'; openPolls.forEach(function (kv) { h += pollMiniCard(kv[0], kv[1]); }); h += "</div>"; }
    }

    h += '<div class="stat-row">' +
      '<button class="stat" data-action="tab" data-tab="alert"><div class="stat-n" data-countup>' + entries(DB.schedule).length + '</div><div class="stat-l">일정</div></button>' +
      (sessHas("settle")
        ? '<button class="stat" data-action="tab" data-tab="my"><div class="stat-n" data-countup>' + (totalSpent() / 10000).toFixed(totalSpent() % 10000 ? 1 : 0) + '<i>만원</i></div><div class="stat-l">총 지출</div></button>' +
          '<button class="stat" data-action="tab" data-tab="my"><div class="stat-n">' + packDone + "/" + packArr.length + '</div><div class="stat-l">준비물</div></button>'
        : '<button class="stat" data-action="tab" data-tab="photo"><div class="stat-n" data-countup>' + entries(DB.photos).length + '</div><div class="stat-l">사진</div></button>' +
          '<button class="stat"><div class="stat-n" data-countup>' + memberCount() + '</div><div class="stat-l">멤버</div></button>') +
      "</div>";
    var club0 = currentClub() || {};
    if (clubHasRanking(club0)) h += sessionSkillCard(club0);

    // 내 이동(카풀)
    if (sessHas("carpool")) h += '<div class="card col" data-action="tab" data-tab="carpool"><div class="ms-row"><span>' + icon("car", 16) + ' 내 이동</span><span class="ms-amt" style="font-size:12px">' + myRideLabel() + "</span></div></div>";

    // 내 정산
    if (sessHas("settle")) { var shH = mySettleHead();
    h += '<div class="card my-settle col ' + shH.cls + '" data-action="tab" data-tab="my">' +
      '<div class="ms-row"><span>' + avatar(me, 26) + " <b>" + esc(memberName(me)) + "</b>님 정산</span><span class=\"ms-amt\">" + shH.text + "</span></div>" +
      '<div class="ms-sub">낸 돈 ' + won(myPaid(me)) + " · 내 몫 " + won(myShare(me)) + "</div></div>"; }

    return h;
  }
  function myRideLabel() {
    var m = obj(DB.members)[me] || {};
    if (m.hasCar) return "운전자 · 탑승 " + passengersOf(me).length + "명";
    var rw = rideOf(me); if (rw && isValidDriver(rw)) return memberName(rw) + "님 차 탑승";
    return "아직 차 미정 — 눌러서 정하기";
  }

  function pollMiniCard(id, p) {
    var opts = entries(p.options), voters = voterCount(p), myVote = obj(p.votes)[me] || {};
    var h = '<div class="card poll-mini" data-action="open-poll" data-id="' + id + '"><div class="pm-title">' + esc(p.title) + "</div>";
    opts.forEach(function (o) {
      var oid = o[0], cnt = countVotes(p, oid), pct = voters ? Math.round(cnt / voters * 100) : 0;
      h += '<button class="opt' + (myVote[oid] ? " mine" : "") + '" data-action="vote" data-poll="' + id + '" data-opt="' + oid + '">' +
        '<span class="opt-bar" style="width:' + pct + '%"></span><span class="opt-l">' + esc(o[1].label) + (myVote[oid] ? " " + icon("check", 13) : "") + "</span><span class=\"opt-c\">" + cnt + "</span></button>";
    });
    h += '<div class="pm-foot">' + voters + "/" + memberCount() + "명 참여 · 눌러서 자세히</div></div>";
    return h;
  }
  function countVotes(p, oid) { var c = 0; entries(p.votes).forEach(function (kv) { if (kv[1] && kv[1][oid]) c++; }); return c; }
  function voterCount(p) { return Object.keys(obj(p.votes)).filter(function (u) { return Object.keys(obj(p.votes[u])).length; }).length; }

  /* ---------- 투표 ---------- */
  function viewVote() {
    var polls = bySort(entries(DB.polls), function (kv) { return ((kv[1].status === "closed") ? 1e15 : 0) - (kv[1].ts || 0); });
    var h = '<div class="page-head"><h1>의사결정</h1>' + (isMeAdmin() ? '<button class="btn-pri" data-action="new-poll">+ 새 투표</button>' : "") + "</div>";
    if (!isMeAdmin()) h += '<div class="admin-only-note">투표 생성은 운영진만 가능해요. 올라온 투표에 참여해주세요!</div>';
    if (!polls.length) h += '<div class="empty">아직 투표가 없어요.</div>';
    h += '<div class="list-grid">';
    polls.forEach(function (kv) { h += pollMiniCard(kv[0], kv[1]); });
    h += "</div>";
    return h;
  }
  function viewPollDetail(id) {
    var p = obj(DB.polls)[id]; if (!p) { state.pollId = null; return viewVote(); }
    var opts = entries(p.options), voters = voterCount(p), myVote = obj(p.votes)[me] || {}, closed = p.status === "closed";
    var maxCnt = -1; if (closed) opts.forEach(function (o) { var c = countVotes(p, o[0]); if (c > maxCnt) maxCnt = c; });
    var canEdit = isMeAdmin() || p.createdBy === me;
    var h = '<div class="page-head"><button class="back" data-action="back-vote">‹ 투표</button>' +
      (canEdit ? '<button class="link-danger" data-action="del-poll" data-id="' + id + '">삭제</button>' : "") + "</div>";
    h += '<div class="card poll-detail"><div class="pd-type">' + (p.type === "multi" ? "여러 개 선택 가능" : "하나만 선택" + (closed ? "" : " · 다시 누르면 취소")) + (closed ? ' · <span class="closed-tag">마감됨</span>' : "") + "</div>" +
      '<h1 class="pd-title">' + esc(p.title) + "</h1>" + (p.desc ? '<p class="pd-desc">' + esc(p.desc) + "</p>" : "") + (closed && maxCnt > 0 ? '<div class="pd-result">' + icon("check", 15) + " 결정: " + opts.filter(function (o) { return countVotes(p, o[0]) === maxCnt; }).map(function (o) { return esc(o[1].label); }).join(" · ") + " (" + maxCnt + "표)</div>" : "");
    opts.forEach(function (o) {
      var oid = o[0], cnt = countVotes(p, oid), pct = voters ? Math.round(cnt / voters * 100) : 0;
      var who = entries(p.votes).filter(function (kv) { return kv[1] && kv[1][oid]; }).map(function (kv) { return kv[0]; });
      h += '<div class="opt-row' + (closed && maxCnt > 0 && cnt === maxCnt ? " win" : "") + '"><button class="opt big' + (myVote[oid] ? " mine" : "") + (closed ? " dis" : "") + '" ' + (closed ? "disabled" : 'data-action="vote" data-poll="' + id + '" data-opt="' + oid + '"') + ">" +
        '<span class="opt-bar" style="width:' + pct + '%"></span><span class="opt-l">' + (myVote[oid] ? icon("check", 13) + " " : "") + esc(o[1].label) + "</span><span class=\"opt-c\">" + cnt + " · " + pct + "%</span></button>" +
        (who.length ? '<div class="opt-who">' + who.map(function (w) { return avatar(w, 22); }).join("") + "</div>" : "") + "</div>";
    });
    if (p.allowAddOptions && !closed) h += '<button class="add-opt" data-action="add-opt" data-id="' + id + '">+ 선택지 추가</button>';
    h += '<div class="pd-foot"><span>' + voters + "/" + memberCount() + "명 참여</span>" +
      (canEdit ? '<button class="link" data-action="toggle-poll" data-id="' + id + '">' + (closed ? "다시 열기 (표 유지)" : "투표 마감") + "</button>" : "") + "</div></div>";
    var comments = bySort(entries(p.comments), function (kv) { return (kv[1].ts || 0); });
    h += '<h2 class="sec">댓글 ' + comments.length + "</h2><div class=\"comments\">";
    if (!comments.length) h += '<div class="empty sm">첫 댓글을 남겨보세요</div>';
    comments.forEach(function (kv) {
      var c = kv[1];
      h += '<div class="cmt">' + avatar(c.by, 28) + '<div class="cmt-body"><div class="cmt-head"><b>' + esc(memberName(c.by)) + "</b><span class=\"ago\">" + timeago(c.ts) + "</span>" +
        (c.by === me ? ' <button class="cmt-del" data-action="del-cmt" data-poll="' + id + '" data-cmt="' + kv[0] + '">×</button>' : "") + '</div><div class="cmt-text">' + esc(c.text) + "</div></div></div>";
    });
    h += '</div><div class="cmt-input"><input id="cmt-' + id + '" placeholder="댓글 달기…" maxlength="500"><button class="btn-pri" data-action="send-cmt" data-id="' + id + '">등록</button></div>';
    return h;
  }

  /* ---------- 정산 ---------- */
  // 내 정산 카드 (본인 것만 — 송금정리·전체잔액은 비공개). 정산/마이 탭 공용
  function mySettleCard(full) {
    var bal = computeBalances();
    var transfers = minimalTransfers(bal).filter(function (t) { return t.from === me || t.to === me; });
    var paid = myPaidMap(), recv = myReceivedMap(), sh = mySettleHead();
    var h = '<div class="card my-settle big ' + (full ? "" : "col ") + sh.cls + '"><div class="ms-row"><span>' + avatar(me, 28) + " <b>" + esc(memberName(me)) + "</b>님 정산</span><span class=\"ms-amt\">" + sh.text + "</span></div><div class=\"ms-sub\">낸 돈 " + won(myPaid(me)) + " · 내 몫 " + won(myShare(me)) + (tripMeta().poolFee ? ' · <span class="ms-onsite">현장 별도 ' + won(tripMeta().poolFee) + "</span>" : "") + "</div>";
    if (transfers.length) {
      h += '<div class="ms-actions">';
      transfers.forEach(function (t) {
        if (t.from === me) {
          var marked = !!paid[t.to], confirmed = creditorConfirmed(t.to);
          h += '<div class="pay-line out"><div class="pl-head">' + chip(t.to) + " 에게 <b>" + won(t.amount) + "</b></div>" +
            (!marked ? '<button class="btn-pri pay-btn" data-action="settle-done" data-to="' + t.to + '" data-amt="' + t.amount + '">보냈어요 · 정산 완료</button>'
              : confirmed ? '<span class="paid-done">' + icon("check", 14) + " 정산 완료</span>"
              : '<span class="paid-wait">상대 확인 대기 <button class="link" data-action="settle-undo" data-to="' + t.to + '" data-amt="' + t.amount + '">취소</button></span>') + "</div>";
        } else {
          var theyPaid = debtorMarkedPaid(t.from), iGot = !!recv[t.from];
          h += '<div class="pay-line in"><div class="pl-head">' + chip(t.from) + " 에게서 <b>" + won(t.amount) + "</b></div>" +
            (iGot ? '<span class="paid-done">' + icon("check", 14) + ' 받음 완료 <button class="link" data-action="settle-unconfirm" data-from="' + t.from + '">취소</button></span>'
              : theyPaid ? '<button class="btn-pri pay-btn" data-action="settle-confirm" data-from="' + t.from + '" data-amt="' + t.amount + '">' + esc(memberName(t.from)) + "님이 보냄 · 받음 확인</button>"
              : '<span class="pay-wait-in">받을 예정</span>') + "</div>";
        }
      });
      h += "</div>";
    }
    h += "</div>";
    return h;
  }
  function expenseCards() {
    var exps = bySort(entries(DB.expenses), function (kv) { return -(kv[1].ts || 0); });
    var h = '<h2 class="sec">지출 내역 ' + exps.length + " · 총 " + won(totalSpent()) + '</h2><div class="list-grid">';
    if (!exps.length) h += '<div class="empty sm">아직 지출이 없어요.</div>';
    exps.forEach(function (kv) {
      var e = kv[1], n = e.participantsAll ? memberCount() : (e.participants ? Object.keys(e.participants).length : memberCount());
      var per = e.splitType === "custom" ? "항목별" : won(Math.round((Number(e.amount) || 0) / (n || 1))) + " / 인";
      h += '<div class="card exp" data-action="edit-expense" data-id="' + kv[0] + '"><div class="exp-top"><span class="exp-title">' + esc(e.title) + "</span><span class=\"exp-amt\">" + won(e.amount) + "</span></div>" +
        '<div class="exp-meta">' + (e.category ? '<span class="cat">' + esc(e.category) + "</span>" : "") + " 결제 " + chip(e.payer) + " · " + n + "명 · " + per + (expandShares(e)[me] ? ' · <span class="exp-mine">내 몫 ' + won(expandShares(e)[me]) + "</span>" : "") + "</div>" + (e.note ? '<div class="exp-note">' + esc(e.note) + "</div>" : "") + "</div>";
    });
    h += "</div>";
    return h;
  }
  function viewSettle() {
    var h = '<div class="page-head"><h1>정산·준비</h1><button class="btn-pri" data-action="new-expense">+ 지출 추가</button></div>';
    h += mySettleCard(true);
    if (tripMeta().poolFee) h += '<div class="hint">정산 완료를 누르면 받을 분에게 알림이 가요. 현장 별도 결제(' + won(tripMeta().poolFee) + "/인)는 위 정산 금액에 안 들어가 있어요 — 각자 현장에서 내요.</div>";
    h += expenseCards();
    return h;
  }

  /* ---------- 마이 (프로필·내 차량·정산·준비물) ---------- */
  function viewMy() {
    var h = viewSettle();
    h += myCarSection();
    h += '<div style="height:6px"></div>' + prepPacking();
    return h;
  }
  function myCarSection() {
    var m = obj(DB.members)[me] || {};
    if (!m.hasCar) return "";
    var pax = passengersOf(me);
    var h = '<h2 class="sec">내 차량 탑승자 ' + pax.length + "/" + (carCap() - 1) + "</h2><div class=\"card\">";
    if (!pax.length) h += '<div class="empty sm">아직 탑승자가 없어요.<br>카풀 탭에서 주변 크루원을 모집해보세요.</div>';
    pax.forEach(function (pid) {
      h += '<div class="cp-pass">' + avatar(pid, 24) + "<span>" + esc(memberName(pid)) + '</span><span class="cp-stn">' + stationLabel(pid) + "</span>" +
        (sameCluster(me, pid) ? '<span class="cp-near">가까움</span>' : "") + '<button class="x" data-action="ride-leave" data-p="' + pid + '">×</button></div>';
    });
    h += '<button class="btn-ghost btn-block" data-action="tab" data-tab="carpool">카풀에서 관리 ›</button></div>';
    return h;
  }

  /* ---------- 알림 (notifications) UI ---------- */
  function openNotifs() {
    var list = myNotifs();
    var h = "<h2>알림</h2>";
    if (!list.length) h += '<div class="empty sm">새 알림이 없어요.</div>';
    else {
      h += '<div class="notif-list">';
      list.forEach(function (kv) {
        var n = kv[1];
        h += '<div class="notif-row' + (n.read ? "" : " unread") + '" data-action="open-notif" data-ntype="' + esc(n.type || "") + '"' + (n.link && n.link.cid ? ' data-cid="' + esc(n.link.cid) + '" data-bt="' + esc(n.link.bt || "notice") + '"' : "") + '><span class="notif-ic">' + icon(n.type === "settle" ? "wallet" : "bell", 16) + "</span>" +
          '<div class="notif-main"><div class="notif-text">' + linkify(esc(n.text)) + '</div><div class="notif-time">' + (n.by ? esc(memberName(n.by)) + " · " : "") + timeago(n.ts) + "</div></div>" +
          '<button class="notif-x" data-action="del-notif" data-id="' + kv[0] + '" aria-label="삭제">×</button></div>';
      });
      h += "</div>";
    }
    h += '<div class="modal-foot">' + (list.length ? '<button class="link-danger" data-action="clear-notifs">전체 삭제</button>' : "") + '<button class="btn-line" data-action="close-modal">닫기</button></div>';
    openModal(h);
    markAllNotifsRead();
  }
  function notifBanners() {
    var list = myNotifs().filter(function (kv) { return !kv[1].dismissed; });
    if (!list.length) return "";
    var h = '<div class="notif-carousel">';
    list.slice(0, 6).forEach(function (kv) {
      var n = kv[1];
      h += '<div class="notif-banner' + (n.read ? "" : " unread") + '" data-action="open-notif" data-ntype="' + esc(n.type || "") + '"><span class="nb-ic">' + icon(n.type === "settle" ? "wallet" : "bell", 16) + "</span>" +
        '<span class="nb-text">' + linkify(esc(n.text)) + "</span>" +
        '<button class="nb-x" data-action="dismiss-notif" data-id="' + kv[0] + '" aria-label="닫기">×</button></div>';
    });
    h += "</div>";
    return h;
  }

  /* ---------- 카풀 ---------- */
  function viewCarpool() {
    var drv = drivers(), unas = unassignedPass(), notReady = claimedMembers().length === 0;
    var h = '<div class="page-head"><h1>카풀</h1></div>';
    h += '<div class="cp-top"><div class="st-box"><div class="st-n">' + drv.length + '<i>대</i></div><div class="st-l">운전자</div></div>' +
      '<div class="st-box"><div class="st-n">' + claimedMembers().filter(function (id) { return !DB.members[id].hasCar; }).length + '<i>명</i></div><div class="st-l">탑승 인원</div></div>' +
      '<div class="st-box"><div class="st-n">' + unas.length + '<i>명</i></div><div class="st-l">차 미정</div></div></div>';
    h += '<div class="hint">같은 권역(예: 강남권·용산권)이거나 출발역이 같으면 <b>가까움</b>이 떠요. 안 떠도 직접 차를 고를 수 있어요.</div>';
    var meCar = !!(obj(DB.members)[me] || {}).hasCar;
    h += '<div class="cp-me"><span class="cp-me-lab">' + icon("car", 15) + ' 내 이동 수단\</span><div class="cp-me-seg"><button class="rsvp-chip in' + (meCar ? " on" : "") + '" data-action="set-mycar" data-v="1">운전 가능</button><button class="rsvp-chip maybe' + (meCar ? "" : " on") + '" data-action="set-mycar" data-v="0">탑승</button></div></div>';

    if (notReady) h += '<div class="empty">아직 입장한 크루원이 없어요.</div>';
    if (!drv.length && !notReady) h += '<div class="empty sm">아직 운전 가능한 분이 없어요. 인트로/프로필에서 <b>자차 있음</b>으로 설정하면 운전자 블록이 생겨요.</div>';

    h += '<div class="cp-board">';
    drv.forEach(function (d) {
      var pax = passengersOf(d), myCar = (d === me) || rideOf(me) === d;
      var canAdd = (d === me) || isMeAdmin();
      h += '<div class="cp-driver' + (myCar ? " cp-mine" : "") + '"><div class="cp-driver-head">' + avatar(d, 36) +
        '<div><div class="dh-name">' + esc(memberName(d)) + (canManage(d) ? " " + roleBadge(d) : "") + '</div><div class="dh-stn">' + icon("pin", 13) + " " + stationLabel(d) + "</div></div>" +
        '<span class="cp-cap' + (carFull(d) ? " full" : "") + '">탑승 ' + pax.length + "/" + (carCap() - 1) + (carFull(d) ? " · 꽉참" : "") + "</span></div><div class=\"cp-pass-list\">";
      if (!pax.length) h += '<div class="cp-pass empty-slot">아직 탑승자가 없어요</div>';
      pax.forEach(function (pid) {
        var canRemove = (pid === me) || (d === me) || isMeAdmin();
        h += '<div class="cp-pass">' + avatar(pid, 24) + "<span>" + esc(memberName(pid)) + "</span><span class=\"cp-stn\">" + stationLabel(pid) + "</span>" +
          (sameCluster(d, pid) ? '<span class="cp-near">가까움</span>' : "") + (canRemove ? '<button class="x" data-action="ride-leave" data-p="' + pid + '">×</button>' : "") + "</div>";
      });
      if (canAdd && unas.length && !carFull(d)) h += '<button class="btn-ghost btn-block" data-action="recruit" data-d="' + d + '">+ 주변 탑승자 모집</button>';
      h += "</div></div>";
    });
    h += "</div>";

    if (unas.length) {
      h += '<h2 class="cp-sub">아직 차를 못 정한 크루원</h2><div class="card cp-pool">';
      unas.forEach(function (pid) {
        var canPick = (pid === me) || isMeAdmin();
        h += '<div class="cp-pass">' + avatar(pid, 24) + "<span>" + esc(memberName(pid)) + "</span><span class=\"cp-stn\">" + stationLabel(pid) + "</span>" +
          (canPick && drv.length ? '<button class="btn-ghost cp-join" data-action="ride-pick" data-p="' + pid + '">타기</button>' : "") + "</div>";
      });
      h += "</div>";
    }
    return h;
  }
  function sameCluster(a, b) { var ca = clusterOf(a); if (ca && ca !== "기타" && ca === clusterOf(b)) return true; var sa = normStation((obj(DB.members)[a] || {}).station), sb = normStation((obj(DB.members)[b] || {}).station); return !!(sa && sa === sb); }
  function sortByProximity(ids, ref) {
    return ids.slice().sort(function (a, b) { return (sameCluster(ref, b) ? 1 : 0) - (sameCluster(ref, a) ? 1 : 0); });
  }

  /* ---------- 사진 ---------- */
  function viewPhotos() {
    var h = '<div class="page-head"><h1>앨범</h1>' + (cloudOn() ? '<button class="btn-pri" data-action="pick-photos">+ 올리기</button>' : "") + "</div>";
    if (!cloudOn()) {
      h += '<div class="demo-note">' + icon("camera", 14) + ' 사진·영상 기능을 켜려면 <b>Cloudinary 연결</b>이 필요해요. (config.js의 <code>cloudinary</code> 값) — 연결되면 앱 안에서 업로드 · 일부/전체 선택 · 일괄 다운로드가 켜집니다.</div>';
      return h;
    }
    var photos = bySort(entries(DB.photos), function (kv) { return -(kv[1].ts || 0); });
    h += '<div class="hint">올린 사진·영상은 <b>48시간 뒤 자동 삭제</b>돼요. 간직할 파일은 미리 다운로드하세요.</div>';
    if (photoUploading) h += '<div class="hint">⏳ ' + photoUploading + "개 올리는 중… (영상은 조금 걸려요)</div>";
    var sel = selectedPhotoKeys();
    var allSel = photos.length > 0 && sel.length === photos.length;
    h += '<div class="ph-bar"><label class="ph-all"><input type="checkbox" data-action="ph-all"' + (allSel ? " checked" : "") + "> 전체 선택</label>" +
      '<span class="ph-cnt">' + (sel.length ? sel.length + "장 선택" : photos.length + "장") + "</span>" +
      (sel.length ? '<button class="link-danger sm" data-action="ph-del">삭제</button><button class="btn-pri sm" data-action="ph-download">' + icon("download", 14) + ' 다운로드 ' + sel.length + "</button>" : "") + "</div>";
    if (!photos.length) { h += '<div class="empty">아직 올라온 게 없어요.<br>오른쪽 위 <b>+ 올리기</b>로 사진·영상을 모아봐요!</div>'; return h; }
    h += '<div class="ph-grid">';
    photos.forEach(function (kv) {
      var p = kv[1], on = !!photoSel[kv[0]], isVid = p.resourceType === "video";
      h += '<div class="ph-cell' + (on ? " sel" : "") + '" data-action="ph-toggle" data-id="' + kv[0] + '">' +
        '<img loading="lazy" src="' + esc(mediaThumb(p)) + '" alt="">' +
        (isVid ? '<span class="ph-vid">' + icon("play", 13) + '</span>' : "") +
        '<span class="ph-check">' + (on ? icon("check", 14) : "") + "</span>" +
        '<a class="ph-open" href="' + esc(p.url) + '" target="_blank" rel="noopener" data-action="ph-open" title="원본 보기">' + icon("expand", 14) + '</a>' +
        "</div>";
    });
    h += "</div>";
    return h;
  }

  /* ---------- 알림 (공지·일정·투표·정산 통합) ---------- */
  function viewAlert() {
    // 세션 투표(숙소·코스 결정) 복구 — 홈 '결정' 섹션에서 진입(open-poll → alert/vote).
    if (state.alert === "vote") return state.pollId ? viewPollDetail(state.pollId) : viewVote();
    return prepSchedule();
  }
  // ⑤ 변경 마감일 경과 여부(소프트 경고용)
  function rsvpLocked(s) { return !!(s && s.lockDate && ddayOf(s.lockDate) < 0); }
  function rsvpRow(id, s) {
    var rv = s.rsvp || {}, ids = sessionMemberIds(), ci = 0, cm = 0, co = 0;
    ids.forEach(function (mid) { var v = rv[mid]; if (v === "in") ci++; else if (v === "maybe") cm++; else if (v === "out") co++; });
    var noResp = Math.max(0, ids.length - ci - cm - co), mine = rv[me] || "", locked = rsvpLocked(s);
    function c(st, lab) { return '<button class="rsvp-chip ' + st + (mine === st ? " on" : "") + (locked ? " locked" : "") + '" data-action="rsvp" data-id="' + id + '" data-st="' + st + '">' + lab + "</button>"; }
    var tally = "참석 " + ci + (cm ? " · 미정 " + cm : "") + (co ? " · 불참 " + co : "") + (noResp ? " · 미응답 " + noResp : "");
    var h = '<div class="rsvp-row">' + c("in", "참석") + c("maybe", "미정") + c("out", "불참") + '<span class="rsvp-tally">' + tally + "</span></div>";
    // ④ 예약 정원 대조 경고 — 참석 인원 vs 예약 정원
    var meta = "";
    if (s.cap > 0) {
      var diff = ci - s.cap, capCls = diff === 0 ? "ok" : diff > 0 ? "over" : "under";
      var capTxt = s.cap + "명분 예약 · 참석 " + ci + " — " + (diff === 0 ? "정원 딱 맞음" : diff > 0 ? diff + "명 초과" : Math.abs(diff) + "자리 남음");
      meta += '<span class="cap-badge ' + capCls + '">' + icon(diff > 0 ? "alert" : "users", 12) + " " + capTxt + "</span>";
    }
    // ⑤ 변경 마감일 + 취소·예약금 정책
    if (s.lockDate) meta += '<span class="lock-badge' + (locked ? " past" : "") + '">' + icon("calendar", 12) + " 변경 " + (locked ? "마감됨" : "마감 " + ddayLabelOf(s.lockDate)) + "</span>";
    if (s.cancelNote) meta += '<span class="cancel-note">' + icon("alert", 12) + " " + esc(s.cancelNote) + "</span>";
    if (meta) h += '<div class="rsvp-meta">' + meta + "</div>";
    return h;
  }
  function prepSchedule() {
    var items = entries(DB.schedule).slice().sort(function (a, b) { var ka = (a[1].day || "") + (a[1].time || ""), kb = (b[1].day || "") + (b[1].time || ""); return ka < kb ? -1 : ka > kb ? 1 : 0; });
    var _resp = {}; items.forEach(function (kv) { var rv = kv[1].rsvp || {}; Object.keys(rv).forEach(function (id) { _resp[id] = 1; }); });
    var _pend = isMeAdmin() ? sessionMemberIds().filter(function (id) { return !_resp[id] && (obj(DB.members)[id] || {}).claimed && id !== me; }) : [];
    var h = '<div class="page-head"><h1>일정</h1>' + (isMeAdmin() ? ((_pend.length && items.length) ? '<button class="btn-ghost sm" data-action="nudge-rsvp">미응답 ' + _pend.length + '명 알림</button> ' : "") + '<button class="btn-pri" data-action="new-schedule">+ 추가</button>' : "") + "</div>";
    if (!items.length) h += '<div class="empty sm">일정이 없어요.</div>';
    var curDay = null;
    items.forEach(function (kv) {
      var s = kv[1]; if (s.day !== curDay) { curDay = s.day; h += '<div class="day-head">' + dateKo(s.day) + "</div>"; }
      var mapUrl = "https://map.naver.com/v5/search/" + encodeURIComponent(s.place || "");
      h += '<div class="tl-item"><div class="tl-time">' + esc(s.time) + '</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc(s.title) + "</div>" +
        (s.place ? '<a class="tl-place" href="' + mapUrl + '" target="_blank" rel="noopener">' + icon("pin", 13) + " " + esc(s.place) + "</a>" : "") +
        (s.link ? '<a class="tl-link" href="' + esc(s.link) + '" target="_blank" rel="noopener">' + icon("link", 13) + " 링크 바로가기</a>" : "") +
        (s.desc ? '<div class="tl-desc">' + linkify(esc(s.desc)) + "</div>" : "") +
        rsvpRow(kv[0], s) +
        "</div>" +
        (isMeAdmin() ? '<div class="tl-acts"><button class="tl-edit" data-action="edit-schedule" data-id="' + kv[0] + '">' + icon("edit", 16) + '</button><button class="tl-del" data-action="del-schedule" data-id="' + kv[0] + '">×</button></div>' : "") + "</div>";
    });
    return h;
  }
  function prepNotice() {
    var notices = bySort(entries(DB.notices), function (kv) { return -((kv[1].pinned ? 1e15 : 0) + (kv[1].ts || 0)); });
    var h = '<div class="page-head"><h1>공지</h1>' + (isMeAdmin() ? '<button class="btn-pri" data-action="new-notice">+ 추가</button>' : "") + "</div>";
    if (!notices.length) return h + '<div class="empty sm">공지가 없어요.</div>';
    h += '<div class="list-grid">';
    notices.forEach(function (kv) {
      var n = kv[1];
      var canEditN = (n.by === me || isMeAdmin());
      h += '<div class="card notice' + (n.pinned ? " pin" : "") + '">' + (n.pinned ? '<span class="pin-tag">' + icon("pin", 13) + ' 고정</span>' : "") + '<div class="notice-text">' + linkify(esc(n.text)) + "</div>" +
        (n.link ? '<a class="tl-link" href="' + esc(n.link) + '" target="_blank" rel="noopener">' + icon("link", 13) + " 링크 바로가기</a>" : "") +
        '<div class="notice-by">' + (n.by ? chip(n.by) : "") + '<span class="ago">' + timeago(n.ts) + "</span>" +
        (canEditN ? '<span class="notice-acts"><button class="link" data-action="edit-notice" data-id="' + kv[0] + '">' + icon("edit", 14) + " 수정</button><button class=\"cmt-del\" data-action=\"del-notice\" data-id=\"" + kv[0] + '">×</button></span>' : "") + "</div></div>";
    });
    h += "</div>";
    return h;
  }
  function prepPacking() {
    var shared = bySort(entries(DB.packing).filter(function (kv) { return (kv[1] || {}).type !== "personal"; }), function (kv) { return kv[1].ts || 0; });
    var personal = bySort(entries(DB.packing).filter(function (kv) { return (kv[1] || {}).type === "personal"; }), function (kv) { return kv[1].ts || 0; });
    var mgr = canManage(me);
    var h = '<div class="page-head"><h1>준비물</h1></div>';
    h += '<div class="pk-sec-head"><span class="pk-sub">공용 (담당자가 챙겨요 · 운영진 관리)</span>' + (mgr ? '<button class="btn-ghost sm" data-action="new-packing" data-type="shared">+ 추가</button>' : "") + "</div>";
    if (!shared.length) h += '<div class="empty sm">공용 준비물이 없어요.</div>';
    else {
      h += '<div class="list-grid">';
      shared.forEach(function (kv) {
        var p = kv[1];
        h += '<div class="pk-item' + (p.done ? " done" : "") + '"><button class="pk-check' + (mgr ? "" : " ro") + '"' + (mgr ? ' data-action="toggle-pack" data-id="' + kv[0] + '"' : "") + ">" + (p.done ? icon("check", 14) : "") + "</button>" +
          '<div class="pk-label">' + esc(p.label) + (p.assignee ? ' <span class="pk-who">' + chip(p.assignee) + "</span>" : ' <span class="pk-need">담당 미정</span>') + "</div>" +
          (mgr ? '<button class="tl-edit" data-action="edit-pack" data-id="' + kv[0] + '" aria-label="수정">' + icon("edit", 14) + '</button><button class="tl-del" data-action="del-pack" data-id="' + kv[0] + '">×</button>' : "") + "</div>";
      });
      h += "</div>";
    }
    h += '<div class="pk-sec-head"><span class="pk-sub">개인 (전원 각자 · 본인 이름 눌러 체크)</span><button class="btn-ghost sm" data-action="new-packing" data-type="personal">+ 추가</button></div>';
    if (!personal.length) h += '<div class="empty sm">개인 준비물이 없어요.</div>';
    else {
      h += '<div class="list-grid">';
      personal.forEach(function (kv) {
        var p = kv[1], iReady = !!obj(p.ready)[me], cnt = readyCount(p), canDel = (p.by === me || mgr);
        h += '<div class="pk-item personal"><button class="pk-check ' + (iReady ? "on" : "") + '" data-action="toggle-ready" data-id="' + kv[0] + '">' + (iReady ? icon("check", 14) : "") + "</button>" +
          '<div class="pk-label">' + esc(p.label) + '<span class="pk-prog">' + cnt + "/" + memberCount() + "명 준비완료</span></div>" + (canDel ? '<button class="tl-edit" data-action="edit-pack" data-id="' + kv[0] + '" aria-label="수정">' + icon("edit", 14) + '</button><button class="tl-del" data-action="del-pack" data-id="' + kv[0] + '">×</button>' : "") + "</div>";
      });
      h += "</div>";
    }
    return h;
  }

  /* ============================================================
     모달 & 폼
     ============================================================ */
  function openModal(html) { var r = $("#modal-root"); r.innerHTML = '<div class="modal-back" data-action="close-modal"></div><div class="modal">' + html + "</div>"; r.classList.add("open"); }
  function closeModal() { var r = $("#modal-root"); r.classList.remove("open"); r.innerHTML = ""; }
  function memberOptions(sel) { return clubRoster().map(function (m) { return '<option value="' + m.id + '"' + (sel === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join(""); }

  function formNewPoll() {
    openModal('<h2>새 투표</h2><label>질문</label><input id="f-title" placeholder="예: 27일 저녁 메뉴는?">' +
      '<label>설명 (선택)</label><textarea id="f-desc" rows="2"></textarea>' +
      '<label>선택 방식</label><select id="f-type"><option value="single">하나만 선택</option><option value="multi">여러 개 선택</option></select>' +
      '<label>선택지</label><div id="f-opts">' + optInput("") + optInput("") + '</div><button class="btn-ghost sm" data-action="add-opt-field">+ 선택지 추가</button>' +
      '<label class="chk"><input type="checkbox" id="f-add"> 크루원이 선택지를 추가할 수 있게</label>' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-poll">만들기</button></div>');
  }
  function optInput(v) { return '<input class="opt-field" placeholder="선택지" value="' + esc(v) + '">'; }

  function formNewExpense(editId) {
    var e = editId ? obj(DB.expenses)[editId] : null;
    var selPart = {}; if (e && e.participants) Object.keys(e.participants).forEach(function (k) { selPart[k] = e.participants[k]; });
    var all = !e || e.participantsAll || !e.participants;
    var rosterChecks = sessionMemberIds().map(function (id) {
      var on = all || selPart[id] != null;
      return '<label class="pchk"><input type="checkbox" class="f-part" value="' + id + '"' + (on ? " checked" : "") + ">" + avatar(id, 24) + "<span>" + esc(memberName(id)) + "</span></label>";
    }).join("");
    openModal("<h2>" + (editId ? "지출 수정" : "지출 추가") + "</h2>" +
      '<label>내용</label><input id="f-title" placeholder="예: 마트 장보기" value="' + (e ? esc(e.title) : "") + '">' +
      '<label>금액 (원)</label><input id="f-amt" type="number" inputmode="numeric" placeholder="0" value="' + (e ? e.amount : "") + '">' +
      '<div class="row2"><div><label>결제자</label><select id="f-payer">' + memberOptions(e ? e.payer : me) + "</select></div>" +
      '<div><label>분류</label><select id="f-cat">' + CATEGORIES.map(function (c) { return '<option' + (e && e.category === c ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></div></div>" +
      '<label>나누는 방식</label><select id="f-split"><option value="equal"' + (e && e.splitType === "custom" ? "" : " selected") + ">1/N (똑같이)</option><option value=\"custom\"" + (e && e.splitType === "custom" ? " selected" : "") + ">항목별 직접 입력</option></select>" +
      '<label>참여자 <button class="mini" data-action="part-all">전체</button><button class="mini" data-action="part-none">해제</button></label>' +
      '<div class="part-grid" id="f-parts">' + rosterChecks + '</div><div id="f-custom" class="hidden"></div><div id="f-preview" class="preview"></div>' +
      '<div class="modal-foot">' + (editId ? '<button class="link-danger" data-action="del-expense" data-id="' + editId + '">삭제</button>' : "") +
      '<button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-expense" data-edit="' + (editId || "") + '">저장</button></div>');
    bindExpenseForm(e);
  }
  function bindExpenseForm(e) {
    var split = $("#f-split"), amt = $("#f-amt");
    function checkedIds() { return Array.prototype.slice.call(document.querySelectorAll(".f-part:checked")).map(function (c) { return c.value; }); }
    function customRow(id, val) { return '<div class="custom-row">' + avatar(id, 22) + "<span>" + esc(memberName(id)) + '</span><input type="number" inputmode="numeric" class="f-cust" data-id="' + id + '" placeholder="0"' + (val != null && val !== "" ? ' value="' + val + '"' : "") + "></div>"; }
    function rebuildCustom() {
      var cont = $("#f-custom"); if (split.value !== "custom") { cont.classList.add("hidden"); cont.innerHTML = ""; return; }
      cont.classList.remove("hidden");
      var typed = {}; Array.prototype.forEach.call(document.querySelectorAll(".f-cust"), function (i) { typed[i.getAttribute("data-id")] = i.value; });
      cont.innerHTML = '<label>각자 금액</label>' + checkedIds().map(function (id) {
        var v = (typed[id] != null) ? typed[id] : (e && e.splitType === "custom" && e.participants && e.participants[id] != null) ? e.participants[id] : "";
        return customRow(id, v);
      }).join("");
    }
    function updatePreview() {
      var pv = $("#f-preview"), checks = checkedIds();
      if (split.value === "custom") {
        var sum = 0; Array.prototype.forEach.call(document.querySelectorAll(".f-cust"), function (i) { sum += Number(i.value) || 0; });
        var amtV = Number(amt.value) || 0; pv.innerHTML = "합계 " + won(sum) + " / 총액 " + won(amtV) + (sum !== amtV ? ' <b class="warn">차이 ' + won(amtV - sum) + "</b>" : " " + icon("check", 13));
      } else { var n = checks.length, per = n ? Math.floor((Number(amt.value) || 0) / n) : 0; pv.innerHTML = n ? (n + "명이 " + won(amt.value) + " → 인당 약 " + won(per)) : "참여자를 선택하세요"; }
    }
    split.onchange = function () { rebuildCustom(); updatePreview(); };
    amt.oninput = updatePreview;
    $("#f-parts").addEventListener("change", function () { rebuildCustom(); updatePreview(); });
    $("#f-custom").addEventListener("input", updatePreview);
    rebuildCustom(); updatePreview();
    window.__expRefresh = function () { rebuildCustom(); updatePreview(); };
  }
  function formNotice(editId) {
    var n = editId ? obj(DB.notices)[editId] : null;
    openModal("<h2>" + (editId ? "공지 수정" : "공지 등록") + "</h2><label>내용</label><textarea id=\"f-text\" rows=\"4\" placeholder=\"공지 내용\">" + (n ? esc(n.text) : "") + "</textarea>" +
      '<label>링크 (선택)</label><input id="f-nlink" type="url" inputmode="url" placeholder="https://… (지도·예약 등)" value="' + (n && n.link ? esc(n.link) : "") + '">' +
      '<label class="chk"><input type="checkbox" id="f-pin"' + (n && n.pinned ? " checked" : "") + "> 상단 고정</label>" +
      '<div class="modal-foot">' + (editId ? '<button class="link-danger" data-action="del-notice" data-id="' + editId + '">삭제</button>' : "") +
      '<button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-notice" data-edit="' + (editId || "") + '">' + (editId ? "수정" : "등록") + "</button></div>");
  }
  function formSchedule(editId) {
    var s = editId ? obj(DB.schedule)[editId] : null;
    var h = "<h2>" + (editId ? "일정 수정" : "일정 추가") + "</h2>" +
      '<div class="row2"><div><label>날짜</label><input id="f-day" type="date" value="' + ((s && s.day) || tripMeta().startDate || "") + '"></div>' +
      '<div><label>시간</label><input id="f-time" type="time" value="' + ((s && s.time) || "") + '"></div></div>' +
      '<label>제목</label><input id="f-title" placeholder="예: 바베큐 시작" value="' + (s ? esc(s.title) : "") + '">' +
      '<label>장소 (선택)</label><input id="f-place" placeholder="예: 카루소" value="' + (s && s.place ? esc(s.place) : "") + '">' +
      '<label>링크 (선택)</label><input id="f-link" type="url" inputmode="url" placeholder="https://naver.me/…" value="' + (s && s.link ? esc(s.link) : "") + '">' +
      '<label>내용 (선택)</label><textarea id="f-desc2" rows="2" placeholder="메모">' + (s && s.desc ? esc(s.desc) : "") + "</textarea>" +
      '<div class="sched-resv"><div class="sr-head">' + icon("calendar", 13) + ' 예약 관리 (선택)</div>' +
      '<div class="row2"><div><label>예약 정원</label><input id="f-cap" type="number" min="0" inputmode="numeric" placeholder="예: 16" value="' + (s && s.cap ? s.cap : "") + '"></div>' +
      '<div><label>변경 마감일</label><input id="f-lock" type="date" value="' + (s && s.lockDate ? esc(s.lockDate) : "") + '"></div></div>' +
      '<label>취소·예약금 정책</label><input id="f-cancel" placeholder="예: 마감 후 불참 시 예약금 1만원 환불 불가" value="' + (s && s.cancelNote ? esc(s.cancelNote) : "") + '" maxlength="120">' +
      '<p class="pf-note" style="margin:4px 0 0">정원을 넣으면 참석 인원과 자동 대조해요. 마감일이 지나면 참석 변경 시 정책 안내가 떠요.</p></div>' +
      '<div class="modal-foot">' + (editId ? '<button class="link-danger" data-action="del-schedule" data-id="' + editId + '">삭제</button>' : "") +
      '<button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-schedule" data-edit="' + (editId || "") + '">저장</button></div>';
    openModal(h);
  }
  function formNewPacking(type, editId) {
    var ed = editId ? obj(DB.packing)[editId] : null;
    var shared = ed ? ed.type === "shared" : (type === "shared");
    openModal("<h2>" + (shared ? "공용" : "개인") + " 준비물 " + (ed ? "수정" : "추가") + "</h2>" +
      '<label>준비물</label><input id="f-label" placeholder="예: ' + (shared ? "아이스박스" : "수영복·수건") + '" value="' + (ed ? esc(ed.label) : "") + '">' +
      (shared ? '<label>담당자 (선택)</label><select id="f-assignee"><option value="">미정</option>' + memberOptions(ed ? ed.assignee || "" : "") + "</select>" : "") +
      '<input type="hidden" id="f-ptype" value="' + (shared ? "shared" : "personal") + '">' +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-packing"' + (ed ? ' data-edit="' + esc(editId) + '"' : "") + '>' + (ed ? "저장" : "추가") + "</button></div>");
  }

  function formPin() {
    openModal('<h2>인증번호 설정</h2><p class="pf-note" style="margin-bottom:12px">다른 기기(PC 등)에서 같은 이름으로 입장할 때 쓰는 4자리 숫자예요.</p>' +
      '<label>새 인증번호 (숫자 4자리)</label>' + pinCellsHtml("np-pin", "np-cells") +
      '<div id="np-err" class="pin-err"></div>' +
      '<div class="modal-foot"><button class="btn-line" data-action="open-profile">취소</button><button class="btn-pri" data-action="save-pin">저장</button></div>');
    bindPin($("#np-pin"), $("#np-cells"), $("#np-err"));
  }
  /* 프로필 / 멤버 관리 시트 */
  function formProfile() {
    var m = obj(DB.members)[me] || {};
    var dl = (CFG.stations || []).map(function (s) { return '<option value="' + esc(s.n) + '">'; }).join("");
    var photoBtns = cloudOn()
      ? '<button class="btn-ghost sm" data-action="pick-avatar"' + (avatarBusy ? " disabled" : "") + ">" + (avatarBusy ? "변경 중…" : icon("camera", 14) + " 사진 변경") + "</button>" + (m.photoUrl && !avatarBusy ? ' <button class="link" data-action="remove-avatar">기본 이미지로</button>' : "")
      : '<div class="pf-note">프로필 사진은 사진 기능(Cloudinary) 연결 후 변경할 수 있어요</div>';
    var h = '<h2>내 프로필</h2>' +
      '<div class="pf-photo">' + avatar(me, 72) + '<div class="pf-photo-act"><div class="pf-name">' + esc(memberName(me)) + " " + roleBadge(me) + "</div>" + photoBtns + "</div></div>" +
      '<label>이름 (또는 닉네임)</label><input type="text" id="p-name" maxlength="20" value="' + esc(memberName(me)) + '" placeholder="이름 또는 닉네임">' +
      '<label>한줄 소개</label><input type="text" id="p-bio" maxlength="60" value="' + esc(m.bio || "") + '" placeholder="나를 한 줄로 소개해보세요 (선택)">' +
      '<label>인증번호</label><div class="pf-pin">' + (m.pin ? "설정됨 " : '<b class="warn">미설정 — 다른 기기 입장하려면 설정하세요 </b>') + '<button class="btn-ghost sm" data-action="set-pin">' + (m.pin ? "변경" : "설정") + "</button></div>" +
      '<label>화면 모드</label><div class="seg">' + [["system", "시스템"], ["light", "라이트"], ["dark", "다크"]].map(function (o) { return '<button class="seg-b' + ((localStorage.getItem("srk_theme") || "system") === o[0] ? " on" : "") + '" data-action="set-theme" data-theme="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">닫기</button><button class="btn-pri" data-action="save-profile">저장</button></div>';
    h += '<button class="btn-line btn-block logout-btn" data-action="switch-me" style="margin-top:16px">' + icon("logout", 18) + " 로그아웃</button>";
    openModal(h);
  }
  function chooserModal(title, ids, refForNear, action, extraData) {
    var sorted = sortByProximity(ids, refForNear);
    var rows = sorted.map(function (id) {
      return '<button class="cp-pass" style="width:100%;text-align:left;margin-bottom:6px" data-action="' + action + '" data-id="' + id + '"' + (extraData ? ' data-d="' + extraData + '"' : "") + ">" +
        avatar(id, 24) + "<span>" + esc(memberName(id)) + "</span><span class=\"cp-stn\">" + stationLabel(id) + "</span>" + (sameCluster(refForNear, id) ? '<span class="cp-near">가까움</span>' : "") + "</button>";
    }).join("");
    openModal("<h2>" + esc(title) + "</h2>" + (rows || '<div class="empty sm">대상이 없어요.</div>') + '<div class="modal-foot"><button class="btn-line" data-action="close-modal">닫기</button></div>');
  }

  /* ============================================================
     액션
     ============================================================ */
  // ── 접근성 후처리 (디자인 감사 a11y-1·2·4·5) ───────────────────────────────
  // 마크업을 화면마다 고치는 대신, DOM이 바뀔 때마다 한 번 훑어 보강한다.
  // 모두 '속성'만 변경 → childList만 관찰하는 옵저버와 무한루프 없음.
  function isNativeCtl(el) { var t = el.tagName; return t === "BUTTON" || t === "A" || t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; }
  function enhanceA11y(root) {
    if (!root) return;
    // a11y-1: 클릭 가능한 비네이티브 [data-action]를 키보드 포커스 가능하게(중첩 인터랙티브·백드롭 제외)
    Array.prototype.forEach.call(root.querySelectorAll("[data-action]"), function (el) {
      if (isNativeCtl(el) || el.hasAttribute("tabindex") || el.classList.contains("modal-back")) return;
      if (el.querySelector("button, a[href], input, select, textarea, [data-action]")) return;
      el.setAttribute("tabindex", "0"); el.setAttribute("role", "button");
    });
    // a11y-2: 인접 배치만 된 <label>을 다음 폼컨트롤의 id와 for로 연결(감싼 라벨은 이미 연결됨)
    Array.prototype.forEach.call(root.querySelectorAll("label:not([for])"), function (lb) {
      if (lb.querySelector("input, select, textarea")) return;
      var f = lb.nextElementSibling, hops = 0;
      while (f && hops < 4 && !/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) { if (f.tagName === "LABEL") { f = null; break; } f = f.nextElementSibling; hops++; }
      if (f && f.id) lb.setAttribute("for", f.id);
    });
    // a11y-5: 라벨 없는 placeholder 인풋에 접근 가능한 이름 부여
    Array.prototype.forEach.call(root.querySelectorAll("input, textarea"), function (el) {
      if (el.getAttribute("aria-label") || el.closest("label")) return;
      if (el.id) { try { if (root.querySelector('label[for="' + el.id + '"]')) return; } catch (e) {} }
      var ph = el.getAttribute("placeholder"); if (ph) el.setAttribute("aria-label", ph);
    });
    // a11y-4: 탭/세그먼트 선택 상태를 보조기술에 노출
    Array.prototype.forEach.call(root.querySelectorAll(".navbtn"), function (b) { b.setAttribute("aria-current", b.classList.contains("on") ? "page" : "false"); });
    Array.prototype.forEach.call(root.querySelectorAll(".seg-b, .bseg, .hsub, .toggle2 button, .board-seg button, .rsvp-chip, .react-btn, .climb-color, .emoji-b"), function (b) { b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false"); });
  }
  try {
    var _a11yQueued = false, _a11yRun = function () { _a11yQueued = false; enhanceA11y(document.body); };
    new MutationObserver(function () {   // 버스트를 프레임당 1회 스윕으로 합침(전체 바디 재스캔 디바운스)
      if (_a11yQueued) return; _a11yQueued = true;
      (window.requestAnimationFrame || window.setTimeout)(_a11yRun);
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
    var t = ev.target;
    if (!t || !t.getAttribute || !t.getAttribute("data-action") || isNativeCtl(t)) return;
    ev.preventDefault(); t.click();   // 기존 click 디스패처로 위임
  });
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]"); if (!t) return;
    var a = t.getAttribute("data-action");

    /* 인트로 */
    if (a === "login-submit") {
      var lerr = $("#login-err"), lnf = $("#i-loginname"), lpf = $("#i-pin");
      var lnm = ((lnf || {}).value || "").trim(), lpin = ((lpf || {}).value || "").replace(/\D/g, "");
      if (!lnm) { if (lerr) lerr.textContent = "이름을 입력하세요."; return; }
      if (lpin.length !== 4) { if (lerr) lerr.textContent = "인증번호 4자리를 입력하세요."; return; }
      var lhit = resolveMemberByName(lnm);
      if (!lhit) { if (lerr) lerr.textContent = "등록된 이름이 없어요. 크루 운영진에게 등록을 요청하세요."; return; }
      var ldm = obj(DB.members)[lhit.id] || {};
      if (ldm.pin) {
        if (hashPin(lpin) === ldm.pin) { me = lhit.id; localStorage.setItem("srk_me", me); render(); }
        else { if (lerr) lerr.textContent = "인증번호가 달라요. 다시 입력해주세요."; if (lpf) lpf.value = ""; paintPinCells($("#pin-cells"), ""); }
      } else {
        Store.update("members/" + lhit.id, { name: lhit.name, pin: hashPin(lpin), claimed: true, claimedAt: Date.now() });
        DB.members = DB.members || {}; DB.members[lhit.id] = Object.assign({}, ldm, { name: lhit.name, pin: hashPin(lpin), claimed: true });
        me = lhit.id; localStorage.setItem("srk_me", me); render();
      }
      return;
    }
    if (a === "pick-name") { intro.pick = t.getAttribute("data-id"); intro.car = !!(obj(DB.members)[intro.pick] || {}).hasCar; intro.step = "pin"; renderGate(); return; }
    if (a === "self-join") { intro.step = "newname"; intro.pick = null; intro.newName = null; renderGate(); var nf = $("#i-newname"); if (nf) nf.focus(); return; }
    if (a === "self-join-back") { intro.step = "name"; intro.pick = null; intro.newName = null; renderGate(); return; }
    if (a === "self-name-next") {
      var nn = (($("#i-newname") || {}).value || "").trim().replace(/\s+/g, " ");
      if (nn.length < 1) { $("#newname-err").textContent = "이름을 입력해주세요."; return; }
      if (nn.length > 20) nn = nn.slice(0, 20);
      if (clubRoster().some(function (r) { return r.name === nn; })) { $("#newname-err").textContent = "이미 명단에 있는 이름이에요. 뒤로 가서 목록에서 본인 이름을 선택해 주세요."; return; }
      intro.newName = nn; intro.pick = "u" + key(); intro.car = false; intro.pinValue = null; intro.step = "pin"; renderGate(); return;
    }
    if (a === "pin-submit") {
      var pinv = (($("#i-pin") || {}).value || "").replace(/\D/g, "");
      var pid0 = intro.pick, dmp = obj(DB.members)[pid0] || {};
      if (pinv.length !== 4) { $("#pin-err").textContent = "숫자 4자리를 입력하세요."; return; }
      if (dmp.pin) { // 검증
        if (hashPin(pinv) === dmp.pin) { me = pid0; localStorage.setItem("srk_me", me); intro.step = "name"; intro.pick = null; intro.newName = null; closeModal(); render(); }
        else { $("#pin-err").textContent = "인증번호가 달라요. 다시 입력해주세요."; var pe = $("#i-pin"); if (pe) { pe.value = ""; pe.focus(); } }
      } else { intro.pinValue = pinv; intro.step = "profile"; renderGate(); } // 신규 설정 → 프로필로
      return;
    }
    if (a === "intro-back") { intro.step = (intro.step === "profile") ? "pin" : (intro.newName ? "newname" : "name"); if (intro.step === "newname") intro.pick = null; renderGate(); return; }
    if (a === "set-car") { intro.car = t.getAttribute("data-v") === "1"; $("#car-yes").classList.toggle("on", intro.car); $("#car-no").classList.toggle("on", !intro.car); return; }
    if (a === "intro-submit") { submitIntro(); return; }

    /* 프로필/멤버 */
    if (a === "open-profile") { formProfile(); return; }
    if (a === "set-theme") { var th = t.getAttribute("data-theme"); localStorage.setItem("srk_theme", th); applyTheme(th); formProfile(); return; }
    if (a === "set-pin") { formPin(); return; }
    if (a === "save-pin") { var v = (($("#np-pin") || {}).value || "").replace(/\D/g, ""); if (v.length !== 4) { $("#np-err").textContent = "숫자 4자리를 입력하세요."; return; } Store.update("members/" + me, { pin: hashPin(v), claimed: true }); if (obj(DB.members)[me]) { DB.members[me].pin = hashPin(v); DB.members[me].claimed = true; } alert("인증번호가 설정됐어요. 다른 기기에서도 이 번호로 입장하세요."); formProfile(); return; }
    if (a === "pick-avatar") { var af = $("#avatar-file"); if (af) af.click(); return; }
    if (a === "remove-avatar") { Store.remove("members/" + me + "/photoUrl"); if (obj(DB.members)[me]) delete DB.members[me].photoUrl; formProfile(); return; }
    if (a === "pf-car") { var v = t.getAttribute("data-v") === "1"; $("#p-car-yes").classList.toggle("on", v); $("#p-car-no").classList.toggle("on", !v); return; }
    if (a === "save-profile") { var pnm = clampStr(($("#p-name") || {}).value, 20), pbio = clampStr(($("#p-bio") || {}).value, 60); var upd = { bio: pbio }; if (pnm) upd.name = pnm; Store.update("members/" + me, upd); if (obj(DB.members)[me]) Object.assign(DB.members[me], upd); closeModal(); render(); return; }
    if (a === "switch-me") {
      if (confirm("이 기기에서 로그아웃할까요?\n(이름·인증번호는 그대로 유지되고, 언제든 인증번호로 다시 입장할 수 있어요)")) {
        me = null; localStorage.removeItem("srk_me"); intro.step = "name"; intro.pick = null; intro.newName = null; state.screen = "clubs"; state.clubId = null; closeModal(); render();
      }
      return;
    }
    if (a === "set-role") {
      if (!canManage(me)) return;
      var aid = t.getAttribute("data-id"), nrole = t.getAttribute("data-role"), cur = roleOf(aid);
      if (cur === "manager") return; // 관리자는 변경 불가
      if (nrole === "staff") { if (cur !== "crew") return; }                 // 크루원 → 운영진 (관리자·운영진 모두)
      else if (nrole === "crew") { if (!isManager(me) || cur !== "staff") return; } // 운영진 → 크루원 (관리자만)
      else return;
      Store.update("members/" + aid, { role: nrole }); render(); return;
    }
    if (a === "del-member") {
      if (!canManage(me)) return;
      var did = t.getAttribute("data-id"); if (did === me) return;
      if (roleOf(did) !== "crew") { alert("크루원만 삭제할 수 있어요. (운영진은 먼저 해제하세요)"); return; }
      if (confirm(memberName(did) + "님을 명단에서 삭제할까요?\n입장·프로필 기록이 사라지고 명단에서 빠집니다.")) { Store.remove("members/" + did); render(); }
      return;
    }
    if (a === "release-claim") {
      if (!canManage(me)) return;
      var rcid = t.getAttribute("data-id"), rcr = roleOf(rcid);
      if (rcr === "manager" || (rcr === "staff" && !isManager(me))) return; // 관리자 보호, 운영진은 관리자만 초기화
      if (confirm(memberName(rcid) + "님의 인증번호를 초기화할까요?\n출발지·자차·카풀 배정은 그대로 유지되고, 다시 인증번호를 정해 입장할 수 있어요.")) { Store.update("members/" + rcid, { claimed: false, pin: null }); render(); }
      return;
    }

    /* 상위(허브) / 일정 */
    if (a === "go-hub") { state.screen = "hub"; state.pollId = null; render(); return; }
    if (a === "hub-tab") { state.hubTab = t.getAttribute("data-tab") || "schedule"; render(); return; }
    if (a === "board-tab") { state.boardTab = t.getAttribute("data-tab") || "notice"; render(); return; }
    if (a === "add-club-notice") { if (canManage(me)) formClubNotice(); return; }
    if (a === "save-club-notice") { var cnT = clampStr(($("#cn-text") || {}).value, 4000); if (!cnT) return; Store.set("clubnotices/" + state.clubId + "/" + key(), { text: cnT, by: me, pinned: !!($("#cn-pin") || {}).checked, ts: Date.now() }); notifyClub(state.clubId, memberName(me) + "님이 소식을 올렸어요: " + clampStr(cnT, 40), "notice", { cid: state.clubId, bt: "notice" }); closeModal(); render(); return; }
    if (a === "del-club-notice") { var cnk = t.getAttribute("data-id"), cno = (obj(DB.clubnotices)[state.clubId] || {})[cnk]; if (!cno || !(cno.by === me || canManage(me))) return; if (confirm("이 소식을 삭제할까요?")) { Store.remove("clubnotices/" + state.clubId + "/" + cnk); render(); } return; }
    if (a === "react-notice") { if (!rankCanRec(state.clubId)) return; var rnk = t.getAttribute("data-id"); var rno = (obj(DB.clubnotices)[state.clubId] || {})[rnk] || {}; var rnr = rno.reactions || {}; if (rnr[me]) Store.remove("clubnotices/" + state.clubId + "/" + rnk + "/reactions/" + me); else { Store.set("clubnotices/" + state.clubId + "/" + rnk + "/reactions/" + me, true); if (rno.by && rno.by !== me) notify(rno.by, memberName(me) + "님이 반응을 남겼습니다 👍", "notice", { cid: state.clubId, bt: "notice" }); } render(); return; }
    if (a === "add-club-poll") { if (canManage(me)) formClubPoll(); return; }
    if (a === "add-club-opt-field") { var cob = $("#cp-opts"); if (cob) cob.insertAdjacentHTML("beforeend", clubOptInput()); return; }
    if (a === "save-club-poll") { var cpq = clampStr(($("#cp-q") || {}).value, 200), cpo = {}; Array.prototype.slice.call(document.querySelectorAll(".cp-opt")).forEach(function (inp) { var v = clampStr(inp.value, 120); if (v) cpo[key()] = v; }); if (!cpq || Object.keys(cpo).length < 2) { alert("질문과 선택지 2개 이상을 입력해 주세요."); return; } Store.set("clubpolls/" + state.clubId + "/" + key(), { q: cpq, opts: cpo, votes: {}, by: me, closed: false, ts: Date.now() }); notifyClub(state.clubId, memberName(me) + "님이 새 투표를 올렸어요: " + clampStr(cpq, 40), "vote", { cid: state.clubId, bt: "poll" }); closeModal(); render(); return; }
    if (a === "club-vote") { var cvp = t.getAttribute("data-poll"), cvo = t.getAttribute("data-opt"); if (!rankCanRec(state.clubId)) return; var cvv = ((obj(DB.clubpolls)[state.clubId] || {})[cvp] || {}).votes || {}; if (cvv[me] === cvo) Store.remove("clubpolls/" + state.clubId + "/" + cvp + "/votes/" + me); else Store.set("clubpolls/" + state.clubId + "/" + cvp + "/votes/" + me, cvo); render(); return; }
    if (a === "close-club-poll") { if (!canManage(me)) return; Store.update("clubpolls/" + state.clubId + "/" + t.getAttribute("data-id"), { closed: true }); render(); return; }
    if (a === "del-club-poll") { if (!canManage(me)) return; var cdp = t.getAttribute("data-id"); if (confirm("이 투표를 삭제할까요?")) { Store.remove("clubpolls/" + state.clubId + "/" + cdp); render(); } return; }
    if (a === "add-club-dues") { if (canManage(me)) formClubDues(); return; }
    if (a === "save-club-dues") { var cdT = clampStr(($("#cd-title") || {}).value, 100), cdA = Math.max(0, Math.round(+(($("#cd-amt") || {}).value) || 0)), cdN = clampStr(($("#cd-note") || {}).value, 100); if (!cdT) { alert("항목명을 입력해 주세요."); return; } Store.set("clubdues/" + state.clubId + "/" + key(), { title: cdT, amount: cdA, note: cdN, paid: {}, by: me, ts: Date.now() }); notifyClub(state.clubId, memberName(me) + "님이 회비를 등록했어요: " + cdT + " · 1인 " + won(cdA), "dues", { cid: state.clubId, bt: "dues" }); closeModal(); render(); return; }
    if (a === "toggle-due-paid") { if (!canManage(me)) return; var tdk = t.getAttribute("data-id"), tdm = t.getAttribute("data-mid"); var tdp = ((obj(DB.clubdues)[state.clubId] || {})[tdk] || {}).paid || {}; if (tdp[tdm]) Store.remove("clubdues/" + state.clubId + "/" + tdk + "/paid/" + tdm); else Store.set("clubdues/" + state.clubId + "/" + tdk + "/paid/" + tdm, true); render(); return; }
    if (a === "del-club-dues") { if (!canManage(me)) return; var ddk = t.getAttribute("data-id"); if (confirm("이 회비 항목을 삭제할까요?")) { Store.remove("clubdues/" + state.clubId + "/" + ddk); render(); } return; }
    if (a === "go-club-ranking") { state.screen = "hub"; state.hubTab = "ranking"; state.pollId = null; render(); return; }
    if (a === "add-match") { formMatch(t.getAttribute("data-session") || null); return; }
    if (a === "save-match") { saveMatch(); return; }
    if (a === "edit-match") { var emk = t.getAttribute("data-id"), em = obj((obj(DB.clubmatches) || {})[state.clubId])[emk]; if (!em || !(em.by === me || canManage(me))) return; formMatch(em.sessionId || null, emk); return; }
    if (a === "del-match") { var mk2 = t.getAttribute("data-id"), mc = obj((obj(DB.clubmatches) || {})[state.clubId])[mk2]; if (!mc) return; if (!(mc.by === me || canManage(me))) return; if (confirm("이 대전 기록을 삭제할까요?")) { Store.remove("clubmatches/" + state.clubId + "/" + mk2); if (DB.clubmatches && DB.clubmatches[state.clubId]) delete DB.clubmatches[state.clubId][mk2]; closeModal(); render(); } return; }
    if (a === "add-climb") { formClimb(t.getAttribute("data-session") || null); return; }
    if (a === "save-climb") { saveClimb(); return; }
    if (a === "add-run") { formRun(t.getAttribute("data-session") || null); return; }
    if (a === "save-run") { saveRun(); return; }
    if (a === "del-record") { var rk2 = t.getAttribute("data-id"), rc = obj((obj(DB.clubrecords) || {})[state.clubId])[rk2]; if (!rc) return; if (!(rc.by === me || canManage(me))) return; if (confirm("이 기록을 삭제할까요?")) { Store.remove("clubrecords/" + state.clubId + "/" + rk2); if (DB.clubrecords && DB.clubrecords[state.clubId]) delete DB.clubrecords[state.clubId][rk2]; render(); } return; }
    if (a === "reload-app") { location.reload(); return; }
    if (a === "open-session") {
      var sid = t.getAttribute("data-id"), so = sessionById(sid);
      if (!so) return;
      state.screen = "session"; state.sessionId = sid; state.clubId = so.clubId || state.clubId; state.pollId = null;
      if (so.kind === "app") state.tab = "home";
      render(); return;
    }
    if (a === "add-session") { formAddSession(); return; }
    if (a === "add-match-session") { formMatchSession(); return; }
    if (a === "save-match-session") {
      var mcid = state.clubId; if (!rankCanRec(mcid)) return;
      var mp1 = ($("#ms-p1") || {}).value, mp2 = ($("#ms-p2") || {}).value, merr = $("#ms-err");
      if (!mp1 || !mp2 || mp1 === mp2) { if (merr) merr.textContent = "서로 다른 두 선수를 골라주세요."; return; }
      var mt1 = +(($("#ms-t1") || {}).value) || 0, mt2 = +(($("#ms-t2") || {}).value) || 0, mdate = ($("#ms-date") || {}).value || "";
      var msdata = { kind: "match", clubId: mcid, by: me, ts: Date.now(), emoji: "🎱", accent: (currentClub() || {}).accent || "blue", category: "1:1 대결", title: memberName(mp1) + " vs " + memberName(mp2), startDate: mdate, endDate: mdate, match: { p1: { id: mp1, target: mt1 }, p2: { id: mp2, target: mt2 }, status: "pending", winner: null, p1score: 0, p2score: 0 } };
      Store.push("sessions", msdata); closeModal(); render(); return;
    }
    if (a === "md-pick-winner") { var mw = t.getAttribute("data-w"); var mwi = $("#md-winner"); if (mwi) mwi.value = mw; var w1 = $("#md-w1"), w2 = $("#md-w2"); if (w1) w1.classList.toggle("on", mw === "p1"); if (w2) w2.classList.toggle("on", mw === "p2"); return; }
    if (a === "finish-match") {
      var fsid = t.getAttribute("data-sid"), fso = sessionById(fsid);
      if (!fso || !fso.match || !rankCanRec(fso.clubId)) return;
      var ferr = $("#md-err"), finn = +(($("#md-inn") || {}).value) || 0;
      if (finn < 1) { if (ferr) ferr.textContent = "이닝 수를 입력해주세요."; return; }
      var fwin = (($("#md-winner") || {}).value === "p2") ? fso.match.p2.id : fso.match.p1.id;
      var fs1 = +(($("#md-s1") || {}).value) || 0, fs2 = +(($("#md-s2") || {}).value) || 0, fcid = fso.clubId;
      var fmk = key();
      var fcm = { ts: Date.now(), by: me, sessionId: fsid, p1: { id: fso.match.p1.id, target: fso.match.p1.target, score: fs1, innings: finn }, p2: { id: fso.match.p2.id, target: fso.match.p2.target, score: fs2, innings: finn }, winner: fwin };
      var fbet = readBet("md-bet"); if (fbet) fcm.bet = fbet;
      Store.set("clubmatches/" + fcid + "/" + fmk, fcm);
      DB.clubmatches = DB.clubmatches || {}; DB.clubmatches[fcid] = DB.clubmatches[fcid] || {}; DB.clubmatches[fcid][fmk] = fcm;
      if (fsid.indexOf("db:") === 0) Store.update("sessions/" + fsid.slice(3), { match: Object.assign({}, fso.match, { status: "done", winner: fwin, p1score: fs1, p2score: fs2, matchKey: fmk }) });
      render(); return;
    }
    if (a === "open-club") { state.clubId = t.getAttribute("data-id"); state.screen = "hub"; state.hubTab = "schedule"; state.pollId = null; render(); return; }
    if (a === "join-club") { var jcid = t.getAttribute("data-id"); if (!jcid || !me) return; if (!clubRoster(jcid).some(function (r) { return r.id === me; })) { Store.set("roster/" + jcid + "/" + me, { name: memberName(me), role: "crew", self: true, ts: Date.now() }); if (!DB.roster) DB.roster = {}; if (!DB.roster[jcid]) DB.roster[jcid] = {}; DB.roster[jcid][me] = { name: memberName(me), role: "crew", self: true }; } state.clubId = jcid; state.screen = "hub"; state.hubTab = "schedule"; state.pollId = null; render(); return; }
    if (a === "go-clubs") { state.screen = "clubs"; state.clubId = null; state.pollId = null; render(); return; }
    if (a === "create-club") { formAddClub(); return; }
    if (a === "open-club-manage") { clubManageSheet(); return; }
    if (a === "open-session-manage") { sessionManageSheet(); return; }
    if (a === "edit-club") { formAddClub(t.getAttribute("data-id")); return; }
    if (a === "del-club") { if (!isMeAdmin()) return; var dcid = t.getAttribute("data-id"); if (!dcid || dcid.indexOf("dbc:") !== 0) return; if (sessionsOfClub(dcid).length) { alert("일정이 남아 있어요. 일정을 먼저 삭제한 뒤 크루를 삭제할 수 있어요."); return; } if (confirm("이 크루를 삭제할까요?")) { Store.remove("clubs/" + dcid.slice(4)); closeModal(); state.screen = "clubs"; state.clubId = null; render(); } return; }
    if (a === "pick-sport") { var spv = t.getAttribute("data-s"); var sw = $("#f-csport"); if (sw) sw.value = spv; Array.prototype.forEach.call(t.parentNode.querySelectorAll(".seg-b"), function (b) { b.classList.toggle("on", b.getAttribute("data-s") === spv); }); return; }
    if (a === "pick-cemoji") { var cem = t.getAttribute("data-e"); var cw = $("#f-cemoji"); if (cw) cw.value = cem; Array.prototype.forEach.call(document.querySelectorAll("#f-cemoji-wrap .emoji-b"), function (b) { b.classList.toggle("on", b.getAttribute("data-e") === cem); }); return; }
    if (a === "save-club") {
      if (!isMeAdmin()) return;
      var ceditId = t.getAttribute("data-edit");
      var cname = clampStr(($("#f-cname") || {}).value, 40); if (!cname) { alert("크루 이름을 입력해주세요."); return; }
      var cdata = { name: cname, sport: ($("#f-csport") || {}).value || "general", emoji: ($("#f-cemoji") || {}).value || "🏅", accent: ($("#f-saccent") || {}).value || "red", desc: clampStr(($("#f-cdesc") || {}).value, 60), visibility: ($("#f-cvis") || {}).value || "public" };
      if (ceditId && ceditId.indexOf("dbc:") === 0) { var ck = ceditId.slice(4); Store.update("clubs/" + ck, cdata); if (DB.clubs && DB.clubs[ck]) Object.assign(DB.clubs[ck], cdata); closeModal(); render(); return; }
      if (ceditId) { Store.set("clubmeta/" + ceditId, cdata); if (!DB.clubmeta) DB.clubmeta = {}; DB.clubmeta[ceditId] = cdata; closeModal(); render(); return; }  // 내장 크루 정보 수정
      cdata.by = me || null; cdata.ts = Date.now();
      var ckey = Store.push("clubs", cdata);
      if (ckey && me) { var rid = "dbc:" + ckey; Store.set("roster/" + rid + "/" + me, { name: memberName(me), role: "manager", self: true, ts: Date.now() }); if (!DB.roster) DB.roster = {}; if (!DB.roster[rid]) DB.roster[rid] = {}; DB.roster[rid][me] = { name: memberName(me), role: "manager", self: true }; }
      if (ckey) { state.clubId = "dbc:" + ckey; state.screen = "hub"; state.hubTab = "schedule"; }
      closeModal(); render(); return;
    }
    if (a === "edit-session") { formAddSession(t.getAttribute("data-id")); return; }
    if (a === "sess-part-all") { ev.preventDefault(); document.querySelectorAll(".f-sess-part").forEach(function (c) { c.checked = true; }); return; }
    if (a === "sess-part-none") { ev.preventDefault(); document.querySelectorAll(".f-sess-part").forEach(function (c) { c.checked = false; }); return; }
    if (a === "pick-emoji") { var em = t.getAttribute("data-e"); var ew = $("#f-emoji"); if (ew) ew.value = em; Array.prototype.forEach.call(document.querySelectorAll("#f-emoji-wrap .emoji-b"), function (b) { b.classList.toggle("on", b.getAttribute("data-e") === em); }); return; }
    if (a === "pick-accent") { var ac = t.getAttribute("data-a"); var aw = $("#f-saccent"); if (aw) aw.value = ac; Array.prototype.forEach.call(t.parentNode.querySelectorAll(".seg-b"), function (b) { b.classList.toggle("on", b.getAttribute("data-a") === ac); }); return; }
    if (a === "pick-climb-color") {
      var pv = t.getAttribute("data-v"), pc = t.getAttribute("data-color");
      var cg2 = $("#c-grade"), cc2 = $("#c-color"); if (cg2) cg2.value = pv; if (cc2) cc2.value = pc;
      Array.prototype.forEach.call(t.parentNode.querySelectorAll(".climb-color"), function (b) { b.classList.toggle("on", b === t); });
      var pl = $("#c-pick-label"); if (pl) pl.innerHTML = '선택: <b>' + esc(climbColorLabel((($("#c-gym-sel") || {}).value), pc)) + "</b> ≈ V" + pv;
      return;
    }
    if (a === "pick-vis") { var vv = t.getAttribute("data-v"); var vw = $("#f-cvis"); if (vw) vw.value = vv; Array.prototype.forEach.call(t.parentNode.querySelectorAll(".seg-b"), function (b) { b.classList.toggle("on", b.getAttribute("data-v") === vv); }); return; }
    if (a === "save-session") {
      if (!isMeAdmin()) return;
      var seditId = t.getAttribute("data-edit");
      var stitle = clampStr(($("#f-stitle") || {}).value, 60);
      if (!stitle) { alert("일정 제목을 입력해주세요."); return; }
      var sd = ($("#f-sstart") || {}).value || "", sed = ($("#f-send") || {}).value || "";
      var sdata = {
        emoji: ($("#f-emoji") || {}).value || "📌", accent: ($("#f-saccent") || {}).value || "red",
        title: stitle, subtitle: clampStr(($("#f-ssub") || {}).value, 40),
        startDate: sd, endDate: sed || sd,
        location: clampStr(($("#f-sloc") || {}).value, 60), lodging: clampStr(($("#f-slodge") || {}).value, 60),
        category: ($("#f-scat") || {}).value || "정기 모임"
      };
      sdata.features = Array.prototype.slice.call(document.querySelectorAll(".f-feat:checked")).map(function (c) { return c.value; });
      var spchecks = Array.prototype.slice.call(document.querySelectorAll(".f-sess-part:checked")).map(function (c) { return c.value; });
      var spmap = {}; spchecks.forEach(function (id) { spmap[id] = true; });
      if (seditId && seditId.indexOf("db:") === 0) {
        Store.update("sessions/" + seditId.slice(3), sdata);
        if (spchecks.length) RawStore.set("s/" + seditId + "/participants", spmap);
        closeModal(); render(); return;
      }
      sdata.kind = "app"; sdata.clubId = state.clubId || "srk"; sdata.by = me || null; sdata.ts = Date.now();
      var skey = Store.push("sessions", sdata);
      if (spchecks.length && skey) RawStore.set("s/db:" + skey + "/participants", spmap);
      closeModal(); render(); return;
    }
    if (a === "del-session") {
      if (!isMeAdmin()) return;
      var dsid = t.getAttribute("data-id"); if (!dsid || dsid.indexOf("db:") !== 0) return;
      var dso = sessionById(dsid), dsTitle = (dso && dso.title) || "이 일정";
      if (confirm("\u2018" + dsTitle + "\u2019을(를) 삭제하면 이 일정의 공지·일정표·투표·지출/정산·앨범이 모두 사라지고 되돌릴 수 없어요. 정말 삭제할까요?")) { Store.remove("sessions/" + dsid.slice(3)); RawStore.remove("s/" + dsid); closeModal(); state.screen = "hub"; state.pollId = null; render(); }
      return;
    }

    /* 탭 */
    if (a === "nav-back") { goBack(); return; }
    if (a === "tab") { var nt = t.getAttribute("data-tab"); if (nt !== "photo") photoSel = {}; state.tab = nt; state.pollId = null; render(); return; }
    if (a === "alert-seg") { state.alert = t.getAttribute("data-seg"); state.pollId = null; render(); return; }
    if (a === "go-vote") { state.tab = "alert"; state.alert = "vote"; state.pollId = null; render(); return; }
    if (a === "go-settle") { state.tab = "my"; state.pollId = null; render(); return; }
    if (a === "close-modal") { closeModal(); return; }

    /* 알림 */
    if (a === "open-notifs") { openNotifs(); return; }
    if (a === "top-nav") { if (state.screen === "clubs" && t.getAttribute("data-screen") !== "clubs") markFeedSeen(); state.screen = t.getAttribute("data-screen") || "clubs"; state.clubId = null; state.pollId = null; render(); return; }
    if (a === "go-explore") { state.screen = "explore"; state.clubId = null; state.pollId = null; render(); return; }
    if (a === "go-crews") { state.screen = "crews"; state.clubId = null; state.pollId = null; render(); return; }
    if (a === "go-club-tab") { markFeedSeen(); state.clubId = t.getAttribute("data-id"); state.hubTab = t.getAttribute("data-tab") || "schedule"; state.boardTab = t.getAttribute("data-bt") || "notice"; state.screen = "hub"; state.pollId = null; render(); return; }
    if (a === "del-notif") { Store.remove("notifications/" + me + "/" + t.getAttribute("data-id")); openNotifs(); return; }
    if (a === "clear-notifs") { if (confirm("알림을 모두 삭제할까요?")) { myNotifs().forEach(function (kv) { Store.remove("notifications/" + me + "/" + kv[0]); }); closeModal(); } return; }
    if (a === "dismiss-notif") { ev.stopPropagation(); var dnId = t.getAttribute("data-id"); Store.update("notifications/" + me + "/" + dnId, { dismissed: true, read: true }); return; }
    if (a === "open-notif") { closeModal(); state.pollId = null; var onCid = t.getAttribute("data-cid"); if (onCid) { state.screen = "hub"; state.clubId = onCid; state.hubTab = "board"; state.boardTab = t.getAttribute("data-bt") || "notice"; render(); return; } var onT = t.getAttribute("data-ntype") || ""; if (onT === "ride") { state.tab = "carpool"; } else if (onT === "settle") { state.tab = "my"; } else { state.tab = "alert"; state.alert = onT === "vote" ? "vote" : onT === "schedule" ? "schedule" : "notice"; } render(); return; }

    /* 홈 히어로 배경 */
    if (a === "pick-hero") {
      ev.stopPropagation();
      if (!isMeAdmin()) return;
      if (!cloudOn()) { alert("히어로 배경 사진을 바꾸려면 먼저 Cloudinary 연결이 필요해요.\n(config.js의 cloudinary 칸 — 자세한 방법은 안내를 참고)"); return; }
      var hf = $("#hero-file"); if (hf) hf.click(); return;
    }

    /* 투표 */
    if (a === "open-poll") { state.pollFrom = state.tab; state.tab = "alert"; state.alert = "vote"; state.pollId = t.getAttribute("data-id"); render(); return; }
    if (a === "back-vote") { state.pollId = null; if (state.pollFrom === "home") state.tab = "home"; state.pollFrom = null; render(); return; }
    if (a === "vote") { ev.stopPropagation(); if (t.getAttribute("data-busy")) return; t.setAttribute("data-busy", "1"); t.classList.add("opt-busy"); doVote(t.getAttribute("data-poll"), t.getAttribute("data-opt")); return; }
    if (a === "new-poll") { if (isMeAdmin()) formNewPoll(); return; }
    if (a === "add-opt-field") { $("#f-opts").insertAdjacentHTML("beforeend", optInput("")); return; }
    if (a === "save-poll") { savePoll(); return; }
    if (a === "del-poll") { var pid0 = t.getAttribute("data-id"); var pp0 = obj(DB.polls)[pid0]; if (!pp0 || !(isMeAdmin() || pp0.createdBy === me)) return; if (confirm("이 투표를 삭제할까요?")) { Store.remove("polls/" + pid0); state.pollId = null; } return; }
    if (a === "toggle-poll") { var pid = t.getAttribute("data-id"); var pp = obj(DB.polls)[pid]; if (!pp || !(isMeAdmin() || pp.createdBy === me)) return; Store.update("polls/" + pid, { status: pp.status === "closed" ? "open" : "closed" }); return; }
    if (a === "add-opt") { var pid2 = t.getAttribute("data-id"); var lbl = prompt("추가할 선택지"); if (lbl && lbl.trim()) Store.set("polls/" + pid2 + "/options/" + key(), { label: clampStr(lbl, 80) }); return; }
    if (a === "send-cmt") { sendComment(t.getAttribute("data-id")); return; }
    if (a === "del-cmt") { Store.remove("polls/" + t.getAttribute("data-poll") + "/comments/" + t.getAttribute("data-cmt")); return; }

    /* 정산 */
    if (a === "settle-done") {
      ev.stopPropagation();
      var sdTo = t.getAttribute("data-to"), sdAmt = Number(t.getAttribute("data-amt")) || 0;
      if (!sdTo) return;
      if (!confirm(memberName(sdTo) + "님께 " + won(sdAmt) + " 보냈다고 표시하고 알림을 보낼까요?")) return;
      Store.set(paidWritePath(sdTo), true);
      notify(sdTo, memberName(me) + "님이 " + won(sdAmt) + " 보냈다고 표시했어요. 받으셨으면 '받음 확인'을 눌러주세요.", "settle");
      return;
    }
    if (a === "settle-undo") { ev.stopPropagation(); var suTo = t.getAttribute("data-to"), suAmt = Number(t.getAttribute("data-amt")) || 0; if (suTo) { Store.remove(paidWritePath(suTo)); notify(suTo, memberName(me) + "님이 앞서 보낸 정산 완료 표시를 취소했어요. 아직 못 받았다면 확인해 주세요.", "settle"); } return; }
    if (a === "settle-confirm") { ev.stopPropagation(); var scFrom = t.getAttribute("data-from"), scAmt = Number(t.getAttribute("data-amt")) || 0; if (!scFrom) return; Store.set(receivedWritePath(scFrom), true); notify(scFrom, memberName(me) + "님이 " + won(scAmt) + " 받았다고 확인했어요. 정산 완료", "settle"); return; }
    if (a === "settle-unconfirm") { ev.stopPropagation(); var scuFrom = t.getAttribute("data-from"); if (scuFrom) Store.remove(receivedWritePath(scuFrom)); return; }
    if (a === "new-expense") { formNewExpense(null); return; }
    if (a === "edit-expense") { formNewExpense(t.getAttribute("data-id")); return; }
    if (a === "save-expense") { saveExpense(t.getAttribute("data-edit")); return; }
    if (a === "del-expense") { if (confirm("이 지출을 삭제할까요?")) { Store.remove("expenses/" + t.getAttribute("data-id")); closeModal(); } return; }
    if (a === "part-all") { ev.preventDefault(); document.querySelectorAll(".f-part").forEach(function (c) { c.checked = true; }); if (window.__expRefresh) window.__expRefresh(); return; }
    if (a === "part-none") { ev.preventDefault(); document.querySelectorAll(".f-part").forEach(function (c) { c.checked = false; }); if (window.__expRefresh) window.__expRefresh(); return; }

    /* 카풀 */
    if (a === "ride-pick") { var pp1 = t.getAttribute("data-p"); if (!(pp1 === me || isMeAdmin())) return; chooserModal("어느 차에 탈까요? (정원 " + carCap() + "명)", drivers().filter(function (d) { return !carFull(d); }), pp1, "pick-driver"); window.__ridePass = pp1; return; }
    if (a === "pick-driver") { var d1 = t.getAttribute("data-id"); var pass = window.__ridePass; if (carFull(d1)) { chooserModal("방금 다른 분이 먼저 탔어요 — 남은 차에서 다시 골라주세요", drivers().filter(function (d) { return !carFull(d); }), pass || me, "pick-driver"); return; } if (pass && isValidDriver(d1)) { Store.set(rideWritePath(pass), d1); notify(d1, memberName(pass) + "님이 " + memberName(d1) + "님 차에 탔어요.", "ride"); } closeModal(); return; }
    if (a === "ride-leave") { var pp2 = t.getAttribute("data-p"); if (!(pp2 === me || (rideOf(pp2) === me) || isMeAdmin())) return; if (pp2 !== me && !confirm(memberName(pp2) + "님을 이 차에서 내릴까요?")) return; Store.set(rideWritePath(pp2), null); return; }
    if (a === "recruit") { var d2 = t.getAttribute("data-d"); if (!(d2 === me || isMeAdmin())) return; chooserModal("주변 탑승자 모집 — 누구를 태울까요?", unassignedPass(), d2, "assign-pass", d2); return; }
    if (a === "assign-pass") { var pid3 = t.getAttribute("data-id"), d3 = t.getAttribute("data-d"); if (carFull(d3)) { alert("이 차는 정원(" + carCap() + "명)이 꽉 찼어요."); closeModal(); return; } if (isValidDriver(d3)) { Store.set(rideWritePath(pid3), d3); notify(pid3, memberName(d3) + "님 차에 배정됐어요.", "ride"); } closeModal(); return; }

    /* 사진 */
    if (a === "ph-open") { return; } // 앵커 기본 동작(원본 새 탭) 허용
    if (a === "pick-photos") { var fi = $("#photo-file"); if (fi) fi.click(); return; }
    if (a === "ph-toggle") { var pk3 = t.getAttribute("data-id"); if (photoSel[pk3]) delete photoSel[pk3]; else photoSel[pk3] = true; render(); return; }
    if (a === "ph-all") { ev.preventDefault(); var ph = Object.keys(obj(DB.photos)); var cur = selectedPhotoKeys(); if (cur.length === ph.length) photoSel = {}; else { photoSel = {}; ph.forEach(function (k) { photoSel[k] = true; }); } render(); return; }
    if (a === "ph-download") { downloadSelected(selectedPhotoKeys()); return; }
    if (a === "ph-del") {
      var del = selectedPhotoKeys().filter(function (k) { var p = obj(DB.photos)[k]; return p && (p.by === me || isMeAdmin()); });
      if (!del.length) { alert("본인이 올린 사진만 삭제할 수 있어요 (운영진은 전체 가능)."); return; }
      if (confirm(del.length + "장을 목록에서 삭제할까요? (다운로드한 사진은 그대로 남습니다)")) { del.forEach(function (k) { Store.remove("photos/" + k); delete photoSel[k]; }); }
      return;
    }

    /* 공지/일정/준비물 */
    if (a === "new-notice") { if (isMeAdmin()) formNotice(null); return; }
    if (a === "edit-notice") { var en = obj(DB.notices)[t.getAttribute("data-id")]; if (en && (isMeAdmin() || en.by === me)) formNotice(t.getAttribute("data-id")); return; }
    if (a === "save-notice") { saveNotice(t.getAttribute("data-edit")); return; }
    if (a === "del-notice") { var nid = t.getAttribute("data-id"); var nn = obj(DB.notices)[nid]; if (!nn || !(isMeAdmin() || nn.by === me)) return; if (confirm("공지를 삭제할까요?")) { Store.remove("notices/" + nid); closeModal(); } return; }
    if (a === "new-schedule") { if (isMeAdmin()) formSchedule(null); return; }
    if (a === "edit-schedule") { if (isMeAdmin()) formSchedule(t.getAttribute("data-id")); return; }
    if (a === "rsvp") {
      var rid = t.getAttribute("data-id"), rst = t.getAttribute("data-st");
      var sched = obj(DB.schedule)[rid] || {}, rs = sched.rsvp || {}, cur = rs[me] || "";
      if (rsvpLocked(sched) && cur !== rst) {  // ⑤ 마감 후 변경: 취소·예약금 정책 안내 후 진행
        var lm = "‘" + (sched.title || "이 일정") + "’ 변경 마감일(" + dateKo(sched.lockDate) + ")이 지났어요.";
        if (sched.cancelNote) lm += "\n\n" + sched.cancelNote;
        lm += "\n\n그래도 변경할까요?";
        if (!confirm(lm)) return;
      }
      if (cur === rst) Store.remove("schedule/" + rid + "/rsvp/" + me); else Store.set("schedule/" + rid + "/rsvp/" + me, rst);
      return;
    }
    if (a === "set-mycar") { Store.set("members/" + me + "/hasCar", t.getAttribute("data-v") === "1"); return; }
    if (a === "nudge-rsvp") {
      if (!isMeAdmin()) return;
      var _r2 = {}; entries(DB.schedule).forEach(function (kv) { var rv = kv[1].rsvp || {}; Object.keys(rv).forEach(function (id) { _r2[id] = 1; }); });
      var _pd = sessionMemberIds().filter(function (id) { return !_r2[id] && (obj(DB.members)[id] || {}).claimed && id !== me; });
      if (!_pd.length) { alert("미응답인 크루원이 없어요."); return; }
      if (!confirm("미응답 " + _pd.length + "명에게 참석 체크 알림을 보낼까요?")) return;
      var _tt = (tripMeta().title || "일정");
      _pd.forEach(function (id) { notify(id, memberName(me) + "님이 ‘" + _tt + "’ 참석 여부를 확인하고 싶어해요. 일정에서 참석/미정/불참을 눌러주세요.", "schedule"); });
      alert(_pd.length + "명에게 알림을 보냈어요.");
      return;
    }
    if (a === "save-schedule") { saveSchedule(t.getAttribute("data-edit")); return; }
    if (a === "del-schedule") { if (isMeAdmin() && confirm("일정을 삭제할까요?")) { Store.remove("schedule/" + t.getAttribute("data-id")); closeModal(); } return; }
    if (a === "new-packing") { var pty = t.getAttribute("data-type") || "personal"; if (pty === "shared" && !canManage(me)) return; formNewPacking(pty); return; }
    if (a === "save-packing") { savePacking(t.getAttribute("data-edit")); return; }
    if (a === "edit-pack") { var epid = t.getAttribute("data-id"), ep = obj(DB.packing)[epid]; if (!ep) return; var eok = ep.type === "personal" ? (ep.by === me || canManage(me)) : canManage(me); if (!eok) return; formNewPacking(ep.type, epid); return; }
    if (a === "del-pack") { var dpid = t.getAttribute("data-id"), dpk = obj(DB.packing)[dpid]; if (!dpk) return; var ok = dpk.type === "personal" ? (dpk.by === me || canManage(me)) : canManage(me); if (!ok) return; if (confirm("준비물을 삭제할까요?")) Store.remove("packing/" + dpid); return; }
    if (a === "toggle-pack") { var id = t.getAttribute("data-id"); var pk = obj(DB.packing)[id]; if (!pk || !canManage(me)) return; Store.update("packing/" + id, { done: !pk.done }); return; }
    if (a === "toggle-ready") { var id2 = t.getAttribute("data-id"); var pk2 = obj(DB.packing)[id2]; if (!pk2) return; var rd = obj(pk2.ready); if (rd[me]) Store.remove("packing/" + id2 + "/ready/" + me); else Store.set("packing/" + id2 + "/ready/" + me, true); return; }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    var idn = ev.target.id || "";
    if (idn.indexOf("cmt-") === 0) sendComment(idn.slice(4));
    else if (idn === "i-pin") { var b = document.querySelector('[data-action="pin-submit"]'); if (b) b.click(); }
    else if (idn === "np-pin") { var b2 = document.querySelector('[data-action="save-pin"]'); if (b2) b2.click(); }
  });

  function submitIntro() {
    var id = intro.pick; if (!id) return;
    var isNew = !!intro.newName, cid = state.clubId || "srk", newName = intro.newName;
    var station = cleanStation($("#i-station").value), hasCar = intro.car, pinHash = hashPin(intro.pinValue || "");
    Store.tx("members/" + id, function (m) {
      if (!m) {
        if (isNew) m = { name: newName, role: "crew" };
        else { var r = clubRoster().find(function (x) { return x.id === id; }) || rosterEntry(id) || {}; m = { name: r.name, role: r.role || "crew" }; }
      }
      if (m.pin && m.pin !== pinHash) return undefined; // 누가 먼저 인증번호를 설정함 → 중단
      m.claimed = true; m.pin = pinHash; m.claimedAt = Date.now(); m.station = station; m.hasCar = !!hasCar;
      if (isNew) { m.name = newName; m.clubId = cid; m.self = true; }
      return m;
    }).then(function (ok) {
      if (!ok) { alert("앗, 다른 기기·브라우저에서 이미 이 이름의 인증번호가 설정됐어요. 그 번호를 알면 입력해 입장하고, 모르면 운영진에게 문의해 주세요."); intro.step = "pin"; renderGate(); return; }
      DB.members = DB.members || {};
      DB.members[id] = Object.assign({}, DB.members[id], { claimed: true, pin: pinHash, station: station, hasCar: !!hasCar });
      if (isNew) {
        DB.members[id].name = newName; DB.members[id].clubId = cid; DB.members[id].self = true;
        Store.set("roster/" + cid + "/" + id, { name: newName, role: "crew", self: true, ts: Date.now() });
        DB.roster = DB.roster || {}; DB.roster[cid] = DB.roster[cid] || {}; DB.roster[cid][id] = { name: newName, role: "crew", self: true };
      }
      me = id; localStorage.setItem("srk_me", me); intro.step = "name"; intro.pick = null; intro.pinValue = null; intro.newName = null; closeModal(); render();
    });
  }
  function doVote(pid, oid) {
    var p = obj(DB.polls)[pid]; if (!p || p.status === "closed") return;
    var mv = obj(obj(p.votes)[me]);
    if (p.type === "multi") { if (mv[oid]) Store.remove("polls/" + pid + "/votes/" + me + "/" + oid); else Store.set("polls/" + pid + "/votes/" + me + "/" + oid, true); }
    else { if (mv[oid]) Store.remove("polls/" + pid + "/votes/" + me); else Store.set("polls/" + pid + "/votes/" + me, (function () { var o = {}; o[oid] = true; return o; })()); }
  }
  function savePoll() {
    if (!isMeAdmin()) return;
    var title = $("#f-title").value.trim(); if (!title) { alert("질문을 입력하세요"); return; }
    var opts = Array.prototype.slice.call(document.querySelectorAll(".opt-field")).map(function (i) { return i.value.trim(); }).filter(Boolean);
    if (opts.length < 2) { alert("선택지를 2개 이상 입력하세요"); return; }
    var optMap = {}; opts.forEach(function (o) { optMap[key()] = { label: clampStr(o, 80) }; });
    armRetry(function () { formNewPoll(); });
    Store.push("polls", { title: clampStr(title, 100), desc: clampStr($("#f-desc").value, 1000), type: $("#f-type").value, status: "open", createdBy: me, allowAddOptions: $("#f-add").checked, options: optMap, votes: {}, comments: {}, ts: Date.now() });
    notifyCrew(memberName(me) + "님이 새 투표를 올렸어요: " + clampStr(title, 60), "vote");
    closeModal();
  }
  function sendComment(pid) { var inp = $("#cmt-" + pid); if (!inp) return; var v = inp.value.trim(); if (!v) return; Store.push("polls/" + pid + "/comments", { by: me, text: clampStr(v, 500), ts: Date.now() }); inp.value = ""; }
  function saveExpense(editId) {
    var title = $("#f-title").value.trim(), amt = Math.round(Number($("#f-amt").value) || 0);
    if (!title) { alert("내용을 입력하세요"); return; } if (amt <= 0) { alert("금액을 입력하세요"); return; }
    var split = $("#f-split").value;
    var checks = Array.prototype.slice.call(document.querySelectorAll(".f-part:checked")).map(function (c) { return c.value; });
    if (!checks.length) { alert("참여자를 1명 이상 선택하세요"); return; }
    var data = { title: clampStr(title, 100), amount: amt, payer: $("#f-payer").value, category: $("#f-cat").value, splitType: split, note: "", ts: (editId && obj(DB.expenses)[editId] ? obj(DB.expenses)[editId].ts : Date.now()) };
    if (split === "custom") {
      var parts = {}, sum = 0; document.querySelectorAll(".f-cust").forEach(function (i) { var v = Math.round(Number(i.value) || 0); parts[i.getAttribute("data-id")] = v; sum += v; });
      if (sum !== amt) { alert("각자 금액 합계(" + won(sum) + ")가 총액(" + won(amt) + ")과 같아야 정산이 맞아요.\n현재 차이: " + won(amt - sum)); return; }
      data.participants = parts;
    } else { if (checks.length === memberCount()) data.participantsAll = true; else { var pm = {}; checks.forEach(function (id) { pm[id] = true; }); data.participants = pm; } }
    armRetry(function () { formNewExpense(editId); });
    if (editId) Store.set("expenses/" + editId, data); else Store.push("expenses", data);
    closeModal();
  }
  function saveNotice(editId) {
    if (!isMeAdmin() && !(editId && (obj(DB.notices)[editId] || {}).by === me)) return;
    var v = $("#f-text").value.trim(); if (!v) return;
    var lk = clampStr(($("#f-nlink") || {}).value, 300) || null;
    armRetry(function () { formNotice(editId); });
    if (editId) Store.update("notices/" + editId, { text: clampStr(v, 1000), pinned: $("#f-pin").checked, link: lk });
    else { Store.push("notices", { text: clampStr(v, 1000), by: me, pinned: $("#f-pin").checked, link: lk, ts: Date.now() }); notifyCrew(memberName(me) + "님이 공지를 올렸어요: " + clampStr(v, 50), "notice"); }
    closeModal();
  }
  function saveSchedule(editId) {
    if (!isMeAdmin()) return;
    var day = $("#f-day").value, time = $("#f-time").value, title = $("#f-title").value.trim();
    if (!day || !time || !title) { alert("날짜·시간·제목을 입력하세요"); return; }
    var capN = parseInt((($("#f-cap") || {}).value), 10);
    var data = { day: day, time: time, title: clampStr(title, 100), place: clampStr($("#f-place").value, 60), link: clampStr($("#f-link").value, 300), desc: clampStr($("#f-desc2").value, 500),
      cap: (capN > 0 ? capN : null), lockDate: ((($("#f-lock") || {}).value) || null), cancelNote: (clampStr((($("#f-cancel") || {}).value), 120) || null),
      ts: (editId && obj(DB.schedule)[editId] ? obj(DB.schedule)[editId].ts : Date.now()) };
    armRetry(function () { formSchedule(editId); });
    // 수정은 update — rsvp 등 하위 응답 보존(set은 노드 전체 교체라 RSVP 소실)
    if (editId) Store.update("schedule/" + editId, data); else { Store.push("schedule", data); notifyCrew(memberName(me) + "님이 일정을 추가했어요: " + clampStr(title, 50), "schedule"); }
    closeModal();
  }
  function savePacking(editId) {
    var ptype = (($("#f-ptype") || {}).value) || "personal";
    if (ptype === "shared" && !canManage(me)) return;
    var label = $("#f-label").value.trim(); if (!label) return;
    if (editId) {
      var cur = obj(DB.packing)[editId]; if (!cur) return;
      var ok = cur.type === "personal" ? (cur.by === me || canManage(me)) : canManage(me); if (!ok) return;
      var upd = { label: clampStr(label, 80) };
      if (cur.type === "shared") upd.assignee = (($("#f-assignee") || {}).value) || null;
      armRetry(function () { formNewPacking(cur.type, editId); }); Store.update("packing/" + editId, upd); closeModal(); return;
    }
    var item = { label: clampStr(label, 80), type: ptype, done: false, ready: {}, by: me, ts: Date.now() };
    if (ptype === "shared") item.assignee = (($("#f-assignee") || {}).value) || null;
    armRetry(function () { formNewPacking(ptype, null); }); Store.push("packing", item); closeModal();
  }

  /* Cloudinary unsigned 업로드 (이미지·영상) */
  function clUpload(file, opts) {
    var c = CFG.cloudinary, fd = new FormData(); fd.append("file", file); fd.append("upload_preset", c.uploadPreset);
    if (opts && opts.tags) fd.append("tags", opts.tags); // 앨범 사진은 srk-gallery 태그 → 48h 자동삭제 대상 (아바타/히어로는 태그 없음 = 영구)
    return fetch("https://api.cloudinary.com/v1_1/" + c.cloudName + "/auto/upload", { method: "POST", body: fd }).then(function (r) { return r.json(); });
  }
  /* 업로드 전 사진 자동 축소 (브라우저 canvas). 영상·GIF·디코딩 불가 파일은 원본 유지.
     overrideMax 주면 그 크기로 강제 축소(프로필 사진용) */
  function resizeImageFile(file, overrideMax) {
    var m = CFG.media || {};
    var doResize = overrideMax ? true : m.resizeImages;
    return new Promise(function (resolve) {
      if (!doResize || !file || file.type.indexOf("image/") !== 0 || file.type === "image/gif") return resolve(file);
      var maxDim = overrideMax || m.maxImageDim || 2048, q = overrideMax ? 0.8 : (m.imageQuality || 0.82);
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return resolve(file);
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
        try {
          var cv = document.createElement("canvas"); cv.width = nw; cv.height = nh;
          cv.getContext("2d").drawImage(img, 0, 0, nw, nh);
          cv.toBlob(function (blob) { resolve(blob && blob.size < file.size ? blob : file); }, "image/jpeg", q);
        } catch (e) { resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  /* 사진 업로드 (Cloudinary unsigned) */
  function uploadPhotos(files) {
    if (!cloudOn()) { alert("사진 기능을 켜려면 Cloudinary 연결이 필요해요."); return; }
    var arr = Array.prototype.slice.call(files || []).filter(function (f) { return f && f.type && (f.type.indexOf("image/") === 0 || f.type.indexOf("video/") === 0); });
    if (!arr.length) return;
    photoUploading += arr.length; if (state.tab === "photo") render();
    arr.forEach(function (f) {
      resizeImageFile(f).then(function (rf) { return clUpload(rf, { tags: "srk-gallery" }); }).then(function (j) {
        if (j && j.secure_url) Store.push("photos", { url: j.secure_url, publicId: j.public_id || "", resourceType: j.resource_type || "image", format: j.format || "", w: j.width || 0, h: j.height || 0, name: clampStr(f.name, 80), by: me, ts: Date.now() });
        else alert("업로드 실패: " + ((j && j.error && j.error.message) || "Cloudinary 설정(프리셋이 Unsigned인지, 영상 용량 한도) 확인"));
      }).catch(function () { alert("사진 업로드 중 네트워크 오류가 발생했어요."); }).then(function () { photoUploading = Math.max(0, photoUploading - 1); if (state.tab === "photo") render(); });
    });
  }
  /* 프로필 사진 변경 */
  function uploadAvatar(file) {
    if (!cloudOn()) { alert("프로필 사진은 사진 기능(Cloudinary) 연결 후 변경할 수 있어요."); return; }
    if (!file || file.type.indexOf("image/") !== 0) { alert("이미지 파일을 선택하세요."); return; }
    avatarBusy = true; formProfile();
    resizeImageFile(file, 512).then(clUpload).then(function (j) {
      if (j && j.secure_url) { Store.update("members/" + me, { photoUrl: j.secure_url }); DB.members[me] = Object.assign({}, obj(DB.members)[me], { photoUrl: j.secure_url }); }
      else alert("업로드 실패: " + ((j && j.error && j.error.message) || "Cloudinary 설정 확인"));
    }).catch(function () { alert("프로필 사진 업로드 오류가 발생했어요."); }).then(function () { avatarBusy = false; formProfile(); });
  }
  function triggerDl(href, name) { var a = document.createElement("a"); a.href = href; a.download = name || "photo"; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
  function downloadSelected(keys) {
    keys = (keys || []).filter(function (k) { return obj(DB.photos)[k]; });
    if (!keys.length) return;
    if (keys.length === 1) { var p0 = DB.photos[keys[0]]; triggerDl(attachUrl(p0.url), p0.name || "photo.jpg"); return; }
    if (!window.JSZip) { keys.forEach(function (k) { window.open(attachUrl(DB.photos[k].url), "_blank"); }); return; }
    var zip = new JSZip(), i = 0;
    Promise.all(keys.map(function (k) {
      var p = DB.photos[k];
      return fetch(p.url).then(function (r) { return r.blob(); }).then(function (b) { i++; var nm = p.name || ("media" + i); if (!/\.[a-z0-9]+$/i.test(nm)) nm += "." + (p.format || (p.resourceType === "video" ? "mp4" : "jpg")); zip.file(i + "_" + nm, b); });
    })).then(function () { return zip.generateAsync({ type: "blob" }); })
      .then(function (blob) { triggerDl(URL.createObjectURL(blob), "슈리키-사진.zip"); })
      .catch(function () { alert("일괄 압축에 실패해 개별로 엽니다."); keys.forEach(function (k) { window.open(attachUrl(DB.photos[k].url), "_blank"); }); });
  }
  /* 홈 히어로 배경 변경 (운영진) */
  function uploadHero(file) {
    if (!isMeAdmin()) return;
    if (!cloudOn()) { alert("히어로 배경은 Cloudinary 연결 후 변경할 수 있어요."); return; }
    if (!file || file.type.indexOf("image/") !== 0) { alert("이미지 파일을 선택하세요."); return; }
    heroBusy = true; render();
    resizeImageFile(file, 1600).then(clUpload).then(function (j) {
      if (j && j.secure_url) { Store.update("trip", { heroImage: j.secure_url }); if (DB.trip) DB.trip.heroImage = j.secure_url; else DB.trip = { heroImage: j.secure_url }; }
      else alert("업로드 실패: " + ((j && j.error && j.error.message) || "Cloudinary 설정 확인"));
    }).catch(function () { alert("배경 이미지 업로드 오류가 발생했어요."); }).then(function () { heroBusy = false; render(); });
  }
  (function bindPhotoInput() { var fi = $("#photo-file"); if (fi) fi.addEventListener("change", function () { uploadPhotos(this.files); this.value = ""; }); })();
  (function bindAvatarInput() { var af = $("#avatar-file"); if (af) af.addEventListener("change", function () { uploadAvatar(this.files && this.files[0]); this.value = ""; }); })();
  (function bindHeroInput() { var hf = $("#hero-file"); if (hf) hf.addEventListener("change", function () { uploadHero(this.files && this.files[0]); this.value = ""; }); })();

  /* ============================================================
     부팅
     ============================================================ */
  Store.onRoot(function (root) {
    RAW = root || {};
    if (!booted) { booted = true; if (seedIfEmpty(RAW)) return; }
    if (!sessSeeded) { sessSeeded = true; ensureSessionSeeds(); }
    rebuildDB();
    if (me && DB.members && Object.keys(DB.members).length) {
      var dmme = DB.members[me];
      // 이 기기는 localStorage(srk_me)로 기억됨 → 입장 유지. 이름이 사라졌거나 입장 해제(인증 초기화)됐으면 게이트로.
      if (!dmme || !dmme.claimed) { me = null; localStorage.removeItem("srk_me"); intro.step = "name"; intro.pick = null; }
    }
    render();
  });
  (function heartbeat() {
    function beat() { try { if (me && DB && (obj(DB.members)[me] || {}).claimed) Store.update("members/" + me, { lastSeen: Date.now() }); } catch (e) {} }
    beat(); setInterval(beat, 150000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) beat(); });
  })();
})();
