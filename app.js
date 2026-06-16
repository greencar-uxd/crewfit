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
  var state = { tab: "home", pollId: null, prep: "vote" };
  var intro = { step: "name", pick: null, car: false };
  var booted = false;
  var photoSel = {};      // 선택된 사진 key 맵
  var photoUploading = 0; // 업로드 중인 장수
  var avatarBusy = false; // 프로필 사진 변경 중

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

  function memberName(id) { var m = obj(DB.members)[id]; return m && m.name ? m.name : (id || "?"); }
  // 위계: manager(관리자) > staff(운영진) > crew(크루원). 레거시 admin:true → staff로 간주
  function roleOf(id) { var m = obj(DB.members)[id] || {}; return m.role || (m.admin ? "staff" : "crew"); }
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
  var AV_COLORS = ["#e5302a", "#2fa85a", "#3b6fe0", "#e0489e", "#7c5cfc", "#f59f00", "#119d8d", "#d6336c", "#1f7ae0", "#8338ec", "#f4791f", "#08916a"];
  function avColor(id) { var s = String(id || ""), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
  function avatarThumb(u, size) { u = String(u || ""); var px = Math.round((size || 28) * 2); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/c_fill,g_auto,w_" + px + ",h_" + px + ",q_auto,f_auto/") : u; }
  function avatar(id, size) {
    size = size || 28;
    var m = obj(DB.members)[id] || {};
    var st = "width:" + size + "px;height:" + size + "px;";
    if (m.photoUrl) return '<span class="av av-img" style="' + st + '"><img loading="lazy" src="' + esc(avatarThumb(m.photoUrl, size)) + '" alt=""></span>';
    return '<span class="av" style="' + st + "font-size:" + Math.round(size * 0.4) + "px;background:" + avColor(id) + '">' + esc(initials(memberName(id))) + "</span>";
  }
  function chip(id) { return '<span class="mchip">' + avatar(id, 22) + "<span>" + esc(memberName(id)) + "</span></span>"; }

  function todayKST() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function parseDate(s) { var p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function dday() { var t = (CFG.trip || {}).startDate; if (!t) return null; return Math.round((parseDate(t) - todayKST()) / 86400000); }
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

  /* 역 → 권역 */
  var STN_MAP = {}; (CFG.stations || []).forEach(function (s) { STN_MAP[s.n] = s.c; });
  function normStation(s) { return String(s || "").trim().replace(/\s+/g, "").replace(/역+$/, ""); }
  function cleanStation(s) { return clampStr(String(s || "").replace(/\s+/g, "").replace(/역+$/, ""), 40); } // 저장용: 끝의 '역' 제거
  function clusterOf(id) { var st = normStation((obj(DB.members)[id] || {}).station); return st ? (STN_MAP[st] || "기타") : ""; }
  function stationLabel(id) { var st = normStation((obj(DB.members)[id] || {}).station); return st ? esc(st) + "역" : "출발지 미정"; }

  /* ============================================================
     스토어 (Firebase | 데모)
     ============================================================ */
  var Store = (function () {
    var fb = CFG.firebase || {};
    var useCloud = !!(fb.apiKey && fb.databaseURL && window.firebase);
    if (useCloud) { try { firebase.initializeApp({ apiKey: fb.apiKey, authDomain: fb.authDomain, databaseURL: fb.databaseURL, projectId: fb.projectId, appId: fb.appId }); } catch (e) {} }

    if (useCloud) {
      var db = firebase.database();
      return {
        mode: "cloud",
        onRoot: function (cb) { db.ref("/").on("value", function (s) { cb(s.val() || {}); }); },
        set: function (p, v) { return db.ref(p).set(v); },
        update: function (p, v) { return db.ref(p).update(v); },
        push: function (p, v) { var r = db.ref(p).push(); r.set(v); return r.key; },
        remove: function (p) { return db.ref(p).remove(); },
        tx: function (p, fn) { return db.ref(p).transaction(fn).then(function (r) { return r.committed; }); },
        seedRoot: function (builder) { db.ref("/").transaction(function (cur) { if (cur && cur.members && Object.keys(cur.members).length) return; return builder(); }); }
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
     초기 데이터
     ============================================================ */
  function buildSeed() {
    var s = CFG.seed || {}, root = { trip: Object.assign({}, CFG.trip), members: {}, notices: {}, schedule: {}, packing: {}, polls: {}, expenses: {} };
    (CFG.roster || []).forEach(function (m) { root.members[m.id] = { name: m.name, role: m.role || "crew" }; });
    var t = Date.now();
    (s.notices || []).forEach(function (n, i) { root.notices[key()] = { text: n.text, by: n.by || null, pinned: !!n.pinned, ts: t + i }; });
    (s.schedule || []).forEach(function (x, i) { root.schedule[key()] = { day: x.day, time: x.time, title: x.title, ts: t + i }; });
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
    if (e.participantsAll) ids = Object.keys(members);
    else if (e.participants) ids = Object.keys(e.participants);
    else ids = Object.keys(members);
    ids = ids.filter(function (id) { return members[id]; });
    if (e.splitType === "custom" && e.participants) { ids.forEach(function (id) { out[id] = Math.round(Number(e.participants[id]) || 0); }); return out; }
    var shares = splitEqual(e.amount, ids.length); ids.forEach(function (id, i) { out[id] = shares[i] || 0; }); return out;
  }
  function computeBalances() {
    var bal = {}; Object.keys(obj(DB.members)).forEach(function (id) { bal[id] = 0; });
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
  function claimedMembers() { return Object.keys(obj(DB.members)).filter(function (id) { return DB.members[id] && DB.members[id].claimed; }); }
  function isValidDriver(id) { var m = obj(DB.members)[id]; return !!(m && m.claimed && m.hasCar); }
  function drivers() { return claimedMembers().filter(function (id) { return DB.members[id].hasCar; }); }
  function passengersOf(d) { return claimedMembers().filter(function (id) { var m = DB.members[id]; return !m.hasCar && m.rideWith === d; }); }
  function unassignedPass() { return claimedMembers().filter(function (id) { var m = DB.members[id]; return !m.hasCar && (!m.rideWith || !isValidDriver(m.rideWith)); }); }
  function memberCount() { return Object.keys(obj(DB.members)).length || 1; }
  function readyCount(p) { var mem = obj(DB.members); return Object.keys(obj(p.ready)).filter(function (id) { return mem[id]; }).length; }

  /* ---------- 사진 (Cloudinary) ---------- */
  function cloudOn() { var c = CFG.cloudinary || {}; return !!(c.cloudName && c.uploadPreset); }
  function thumbUrl(u) { u = String(u || ""); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/c_fill,w_600,h_600,q_auto,f_auto/") : u; }
  function attachUrl(u) { u = String(u || ""); return u.indexOf("/upload/") >= 0 ? u.replace("/upload/", "/upload/fl_attachment/") : u; }
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
  function render() {
    var m = me && obj(DB.members)[me];
    if (!me || !m || !m.claimed) { renderGate(); return; }
    $("#gate").classList.add("hidden");
    if (state.tab === "vote") { state.tab = "prep"; state.prep = "vote"; } // 투표는 준비 탭으로 이동됨
    renderHeader(); renderNav();
    var main = $("#app-main");
    if (state.tab === "home") main.innerHTML = viewHome();
    else if (state.tab === "settle") main.innerHTML = viewSettle();
    else if (state.tab === "carpool") main.innerHTML = viewCarpool();
    else if (state.tab === "photo") main.innerHTML = viewPhotos();
    else if (state.tab === "prep") main.innerHTML = viewPrep();
    window.scrollTo(0, 0);
  }
  function scheduleRender() { if (booted) render(); }

  function renderHeader() {
    var t = CFG.trip || {};
    $("#app-header").innerHTML =
      '<div class="hd-left"><div class="hd-title">' + esc(t.title || "MT") + "</div>" +
      '<div class="hd-sub">' + (Store.mode === "demo" ? '<span class="badge-demo">데모</span>' : '<span class="badge-live">LIVE</span>') + " " + esc(t.subtitle || "") + "</div></div>" +
      '<button class="me-chip" data-action="open-profile">' + avatar(me, 30) + "<span>" + esc(memberName(me)) + "</span></button>";
  }
  function renderNav() {
    var tabs = [["home", "🏠", "홈"], ["settle", "💸", "정산"], ["carpool", "🚗", "카풀"], ["photo", "📷", "사진"], ["prep", "🎒", "준비"]];
    $("#app-nav").innerHTML = tabs.map(function (t) {
      return '<button class="navbtn' + (state.tab === t[0] ? " on" : "") + '" data-action="tab" data-tab="' + t[0] + '"><span class="nav-ic">' + t[1] + "</span><span>" + t[2] + "</span></button>";
    }).join("");
  }

  /* ---------- 인트로 (이름 → 출발역 → 자차) ---------- */
  function renderGate() {
    var g = $("#gate"); g.classList.remove("hidden");
    if (intro.step === "pin" && intro.pick) g.innerHTML = gatePin();
    else if (intro.step === "profile" && intro.pick) g.innerHTML = gateProfile();
    else g.innerHTML = gateName();
    var pin = $("#i-pin");
    if (pin) { pin.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); $("#pin-err").textContent = ""; }); setTimeout(function () { try { pin.focus(); } catch (e) {} }, 60); }
  }
  function gateName() {
    var roster = CFG.roster || [];
    return '<div class="gate-card"><div class="gate-emoji">🧗</div>' +
      "<h1>" + esc((CFG.trip || {}).title || "MT") + "</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot"></span></div>' +
      '<p class="gate-p">본인 이름을 선택하세요. 4자리 인증번호로 입장합니다.<br>어느 기기에서든 같은 인증번호로 들어올 수 있어요.</p>' +
      '<div class="gate-grid" id="gate-grid">' + roster.map(function (m) {
        var dm = obj(DB.members)[m.id] || {};
        var tag = dm.pin ? '<span class="lock-tag">🔑</span>' : '<span class="me-tag">처음</span>';
        return '<button class="gate-name" data-action="pick-name" data-id="' + m.id + '">' +
          avatar(m.id, 34) + '<span class="nm-main"><span>' + esc(m.name) + "</span>" + roleTag(m.id) + "</span>" + tag + "</button>";
      }).join("") + "</div></div>";
  }
  function gatePin() {
    var id = intro.pick, dm = obj(DB.members)[id] || {}, verify = !!dm.pin;
    return '<div class="gate-card"><div class="gate-emoji">🔑</div>' +
      "<h1>" + (verify ? "인증번호 입력" : "인증번호 설정") + "</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot on"></span>' + (verify ? "" : '<span class="step-dot"></span>') + "</div>" +
      '<div class="profile-who" style="justify-content:center">' + avatar(id, 40) + "<span>" + esc(memberName(id)) + "</span>" + roleTag(id) + "</div>" +
      '<p class="gate-p">' + (verify ? "이 이름의 인증번호 4자리를 입력하세요." : "입장할 때 쓸 4자리 인증번호를 정하세요.") + "</p>" +
      '<input id="i-pin" class="pin-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="••••">' +
      '<div id="pin-err" class="pin-err"></div>' +
      '<div class="intro-foot"><button class="btn-line" data-action="intro-back">‹ 뒤로</button>' +
      '<button class="btn-pri" data-action="pin-submit" data-id="' + id + '">' + (verify ? "입장" : "다음 →") + "</button></div>" +
      (verify ? '<p class="gate-p" style="margin-top:12px;font-size:12px">인증번호를 잊었다면 운영진(김찬우·강민관)에게 초기화를 요청하세요.</p>' : "") +
      "</div>";
  }
  function gateProfile() {
    var id = intro.pick, dm = obj(DB.members)[id] || {};
    var st = dm.station || "";
    var car = intro.car;
    var dl = (CFG.stations || []).map(function (s) { return '<option value="' + esc(s.n) + '">'; }).join("");
    return '<div class="gate-card"><div class="gate-emoji">🚏</div>' +
      "<h1>거의 다 왔어요!</h1>" +
      '<div class="steps"><span class="step-dot on"></span><span class="step-dot on"></span><span class="step-dot on"></span></div>' +
      '<div class="profile-box">' +
      '<div class="profile-who">' + avatar(id, 40) + "<span>" + esc(memberName(id)) + "</span>" + roleTag(id) + "</div>" +
      '<div class="fld"><label>🚇 출발지 (지하철역)</label>' +
      '<input type="text" id="i-station" list="stationlist" placeholder="예: 남영, 강남… (직접 입력 가능)" value="' + esc(st) + '" autocomplete="off">' +
      '<datalist id="stationlist">' + dl + "</datalist></div>" +
      '<div class="fld"><label>🚗 자차 보유</label><div class="toggle2">' +
      '<button id="car-no" class="' + (car ? "" : "on") + '" data-action="set-car" data-v="0">없음 🙋</button>' +
      '<button id="car-yes" class="' + (car ? "on" : "") + '" data-action="set-car" data-v="1">있음 🚗</button></div></div>' +
      '<div class="intro-foot"><button class="btn-line" data-action="intro-back">‹ 뒤로</button>' +
      '<button class="btn-pri" data-action="intro-submit">입장하기</button></div>' +
      '<p class="gate-p" style="margin-top:14px;font-size:12px">출발지·자차 정보는 나중에 프로필에서 바꿀 수 있어요.</p>' +
      "</div></div>";
  }

  /* ---------- 홈 ---------- */
  function viewHome() {
    var t = CFG.trip || {};
    var openPolls = entries(DB.polls).filter(function (kv) { return (kv[1] || {}).status !== "closed"; });
    var packArr = entries(DB.packing);
    var packDone = packArr.filter(function (kv) { var p = kv[1] || {}; return p.type === "personal" ? readyCount(p) >= memberCount() : p.done; }).length;
    var bal = computeBalances(), myNet = Math.round(bal[me] || 0);
    var mapUrl = "https://map.naver.com/v5/search/" + encodeURIComponent(t.address || t.location || "");
    var h = "";
    if (Store.mode === "demo") h += '<div class="demo-note">📍 <b>데모 모드</b> — 이 기기에만 저장돼요. 실시간 공유는 Firebase 연결 후 켜집니다.</div>';
    h += '<div class="hero"><div class="hero-dday">' + ddayLabel() + "</div>" +
      '<div class="hero-title">' + esc(t.title || "") + "</div><div class=\"hero-sub\">" + esc(t.subtitle || "") + "</div>" +
      '<div class="hero-meta"><div>📅 ' + dateKo(t.startDate) + " → " + dateKo(t.endDate) + "</div>" +
      '<div>📍 <a href="' + mapUrl + '" target="_blank" rel="noopener">' + esc(t.location || "") + "</a> · " + esc(t.address || "") + "</div>" +
      '<div>🏠 ' + esc(t.lodging || "") + (t.airbnbUrl ? ' · <a href="' + esc(t.airbnbUrl) + '" target="_blank" rel="noopener">숙소 보기</a>' : "") + "</div>" +
      (t.note ? '<div class="hero-note">' + esc(t.note) + "</div>" : "") + "</div></div>";

    h += '<div class="stat-row">' +
      '<button class="stat" data-action="go-vote"><div class="stat-n">' + openPolls.length + '</div><div class="stat-l">진행 중 투표</div></button>' +
      '<button class="stat" data-action="tab" data-tab="settle"><div class="stat-n">' + (totalSpent() / 10000).toFixed(totalSpent() % 10000 ? 1 : 0) + '<i>만원</i></div><div class="stat-l">총 지출</div></button>' +
      '<button class="stat" data-action="tab" data-tab="prep"><div class="stat-n">' + packDone + "/" + packArr.length + '</div><div class="stat-l">준비물</div></button></div>';

    // 내 이동(카풀)
    h += '<div class="card" data-action="tab" data-tab="carpool"><div class="ms-row"><span>🚗 내 이동</span><span class="ms-amt" style="font-size:13px">' + myRideLabel() + "</span></div></div>";

    // 내 정산
    h += '<div class="card my-settle ' + (myNet > 0 ? "pos" : myNet < 0 ? "neg" : "") + '" data-action="tab" data-tab="settle">' +
      '<div class="ms-row"><span>' + avatar(me, 26) + " <b>" + esc(memberName(me)) + "</b>님 정산</span><span class=\"ms-amt\">" +
      (myNet > 0 ? "받을 돈 " + won(myNet) : myNet < 0 ? "보낼 돈 " + won(-myNet) : "정산 완료 ✓") + "</span></div>" +
      '<div class="ms-sub">낸 돈 ' + won(myPaid(me)) + " · 내 몫 " + won(myShare(me)) + "</div></div>";

    if (openPolls.length) {
      h += '<h2 class="sec">🗳️ 진행 중 투표</h2><div class="list-grid">';
      bySort(openPolls, function (kv) { return -(kv[1].ts || 0); }).slice(0, 2).forEach(function (kv) { h += pollMiniCard(kv[0], kv[1]); });
      h += "</div>";
    }
    var notices = bySort(entries(DB.notices), function (kv) { return -((kv[1].pinned ? 1e15 : 0) + (kv[1].ts || 0)); });
    if (notices.length) {
      h += '<h2 class="sec">📢 공지</h2>';
      notices.slice(0, 3).forEach(function (kv) {
        var n = kv[1];
        h += '<div class="card notice' + (n.pinned ? " pin" : "") + '">' + (n.pinned ? '<span class="pin-tag">📌 고정</span>' : "") +
          '<div class="notice-text">' + esc(n.text) + "</div><div class=\"notice-by\">" + (n.by ? chip(n.by) : "") + '<span class="ago">' + timeago(n.ts) + "</span></div></div>";
      });
    }
    return h;
  }
  function myRideLabel() {
    var m = obj(DB.members)[me] || {};
    if (m.hasCar) return "운전자 · 탑승 " + passengersOf(me).length + "명";
    if (m.rideWith && isValidDriver(m.rideWith)) return memberName(m.rideWith) + "님 차 탑승";
    return "아직 미배정 — 눌러서 정하기";
  }

  function pollMiniCard(id, p) {
    var opts = entries(p.options), voters = voterCount(p), myVote = obj(p.votes)[me] || {};
    var h = '<div class="card poll-mini" data-action="open-poll" data-id="' + id + '"><div class="pm-title">' + esc(p.title) + "</div>";
    opts.forEach(function (o) {
      var oid = o[0], cnt = countVotes(p, oid), pct = voters ? Math.round(cnt / voters * 100) : 0;
      h += '<button class="opt' + (myVote[oid] ? " mine" : "") + '" data-action="vote" data-poll="' + id + '" data-opt="' + oid + '">' +
        '<span class="opt-bar" style="width:' + pct + '%"></span><span class="opt-l">' + esc(o[1].label) + (myVote[oid] ? " ✓" : "") + "</span><span class=\"opt-c\">" + cnt + "</span></button>";
    });
    h += '<div class="pm-foot">' + voters + "/" + memberCount() + "명 참여 · 눌러서 자세히</div></div>";
    return h;
  }
  function countVotes(p, oid) { var c = 0; entries(p.votes).forEach(function (kv) { if (kv[1] && kv[1][oid]) c++; }); return c; }
  function voterCount(p) { return Object.keys(obj(p.votes)).filter(function (u) { return Object.keys(obj(p.votes[u])).length; }).length; }

  /* ---------- 투표 ---------- */
  function viewVote() {
    var polls = bySort(entries(DB.polls), function (kv) { return ((kv[1].status === "closed") ? 1e15 : 0) - (kv[1].ts || 0); });
    var h = '<div class="page-head"><h1>🗳️ 의사결정</h1>' + (isMeAdmin() ? '<button class="btn-pri" data-action="new-poll">+ 새 투표</button>' : "") + "</div>";
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
    var canManage = isMeAdmin() || p.createdBy === me;
    var h = '<div class="page-head"><button class="back" data-action="back-vote">‹ 투표</button>' +
      (canManage ? '<button class="link-danger" data-action="del-poll" data-id="' + id + '">삭제</button>' : "") + "</div>";
    h += '<div class="card poll-detail"><div class="pd-type">' + (p.type === "multi" ? "여러 개 선택 가능" : "하나만 선택") + (closed ? ' · <span class="closed-tag">마감됨</span>' : "") + "</div>" +
      '<h1 class="pd-title">' + esc(p.title) + "</h1>" + (p.desc ? '<p class="pd-desc">' + esc(p.desc) + "</p>" : "");
    opts.forEach(function (o) {
      var oid = o[0], cnt = countVotes(p, oid), pct = voters ? Math.round(cnt / voters * 100) : 0;
      var who = entries(p.votes).filter(function (kv) { return kv[1] && kv[1][oid]; }).map(function (kv) { return kv[0]; });
      h += '<div class="opt-row"><button class="opt big' + (myVote[oid] ? " mine" : "") + (closed ? " dis" : "") + '" ' + (closed ? "disabled" : 'data-action="vote" data-poll="' + id + '" data-opt="' + oid + '"') + ">" +
        '<span class="opt-bar" style="width:' + pct + '%"></span><span class="opt-l">' + (myVote[oid] ? "✓ " : "") + esc(o[1].label) + "</span><span class=\"opt-c\">" + cnt + " · " + pct + "%</span></button>" +
        (who.length ? '<div class="opt-who">' + who.map(function (w) { return avatar(w, 22); }).join("") + "</div>" : "") + "</div>";
    });
    if (p.allowAddOptions && !closed) h += '<button class="add-opt" data-action="add-opt" data-id="' + id + '">+ 선택지 추가</button>';
    h += '<div class="pd-foot"><span>' + voters + "/" + memberCount() + "명 참여</span>" +
      (canManage ? '<button class="link" data-action="toggle-poll" data-id="' + id + '">' + (closed ? "다시 열기" : "투표 마감") + "</button>" : "") + "</div></div>";
    var comments = bySort(entries(p.comments), function (kv) { return (kv[1].ts || 0); });
    h += '<h2 class="sec">💬 댓글 ' + comments.length + "</h2><div class=\"comments\">";
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
  function viewSettle() {
    var exps = bySort(entries(DB.expenses), function (kv) { return -(kv[1].ts || 0); });
    var bal = computeBalances(), transfers = minimalTransfers(bal), total = totalSpent();
    var h = '<div class="page-head"><h1>💸 정산</h1><button class="btn-pri" data-action="new-expense">+ 지출 추가</button></div>';
    h += '<div class="settle-top"><div class="st-box"><div class="st-n">' + won(total) + '</div><div class="st-l">총 지출</div></div>' +
      '<div class="st-box"><div class="st-n">' + transfers.length + '<i>건</i></div><div class="st-l">송금</div></div></div>';
    if ((CFG.trip || {}).poolFee) h += '<div class="hint">ℹ️ 수영장 입장권 인당 ' + won(CFG.trip.poolFee) + "은 현장 개별 결제라 정산에 포함되지 않아요.</div>";
    var myNet = Math.round(bal[me] || 0);
    h += '<div class="card my-settle big ' + (myNet > 0 ? "pos" : myNet < 0 ? "neg" : "") + '"><div class="ms-row"><span>' + avatar(me, 28) + " <b>" + esc(memberName(me)) + "</b>님</span><span class=\"ms-amt\">" +
      (myNet > 0 ? "+" + won(myNet) : myNet < 0 ? "−" + won(-myNet) : "정산 완료 ✓") + "</span></div><div class=\"ms-sub\">낸 돈 " + won(myPaid(me)) + " · 내 몫 " + won(myShare(me)) + "</div>";
    var mine = transfers.filter(function (t) { return t.from === me || t.to === me; });
    if (mine.length) { h += '<div class="ms-actions">'; mine.forEach(function (t) { h += t.from === me ? '<div class="pay-line out">' + chip(t.to) + " 에게 <b>" + won(t.amount) + "</b> 보내기</div>" : '<div class="pay-line in">' + chip(t.from) + " 에게서 <b>" + won(t.amount) + "</b> 받기</div>"; }); h += "</div>"; }
    h += "</div>";
    h += '<h2 class="sec">🔁 송금 정리 (최소 횟수)</h2>';
    if (!transfers.length) h += '<div class="empty sm">정산할 송금이 없어요.</div>';
    else { h += '<div class="card transfers">'; transfers.forEach(function (t) { h += '<div class="tr-line">' + chip(t.from) + '<span class="tr-arrow">→</span>' + chip(t.to) + '<span class="tr-amt">' + won(t.amount) + "</span></div>"; }); h += "</div>"; }
    h += '<h2 class="sec">👥 멤버별 잔액</h2><div class="card balances">';
    bySort(Object.keys(bal), function (id) { return bal[id]; }).forEach(function (id) {
      var v = Math.round(bal[id]);
      h += '<div class="bal-line">' + chip(id) + '<span class="bal-v ' + (v > 0 ? "pos" : v < 0 ? "neg" : "zero") + '">' + (v > 0 ? "+" + won(v) : v < 0 ? "−" + won(-v) : "0원") + "</span></div>";
    });
    h += "</div>";
    h += '<h2 class="sec">🧾 지출 내역 ' + exps.length + "</h2><div class=\"list-grid\">";
    if (!exps.length) h += '<div class="empty sm">아직 지출이 없어요.</div>';
    exps.forEach(function (kv) {
      var e = kv[1], n = e.participantsAll ? memberCount() : (e.participants ? Object.keys(e.participants).length : memberCount());
      var per = e.splitType === "custom" ? "항목별" : won(Math.round((Number(e.amount) || 0) / (n || 1))) + " / 인";
      h += '<div class="card exp" data-action="edit-expense" data-id="' + kv[0] + '"><div class="exp-top"><span class="exp-title">' + esc(e.title) + "</span><span class=\"exp-amt\">" + won(e.amount) + "</span></div>" +
        '<div class="exp-meta">' + (e.category ? '<span class="cat">' + esc(e.category) + "</span>" : "") + " 결제 " + chip(e.payer) + " · " + n + "명 · " + per + "</div>" + (e.note ? '<div class="exp-note">' + esc(e.note) + "</div>" : "") + "</div>";
    });
    h += "</div>";
    return h;
  }

  /* ---------- 카풀 ---------- */
  function viewCarpool() {
    var drv = drivers(), unas = unassignedPass(), notReady = claimedMembers().length === 0;
    var h = '<div class="page-head"><h1>🚗 카풀</h1></div>';
    h += '<div class="cp-top"><div class="st-box"><div class="st-n">' + drv.length + '<i>대</i></div><div class="st-l">운전자</div></div>' +
      '<div class="st-box"><div class="st-n">' + claimedMembers().filter(function (id) { return !DB.members[id].hasCar; }).length + '<i>명</i></div><div class="st-l">탑승 인원</div></div>' +
      '<div class="st-box"><div class="st-n">' + unas.length + '<i>명</i></div><div class="st-l">미배정</div></div></div>';
    h += '<div class="hint">출발지(역)가 가까운 사람끼리 <b>가까움</b> 표시가 떠요. 운전자는 주변 탑승자를 모집하고, 탑승자는 직접 차를 고를 수 있어요.</div>';

    if (notReady) h += '<div class="empty">아직 입장한 크루원이 없어요.</div>';
    if (!drv.length && !notReady) h += '<div class="empty sm">아직 운전 가능한 분이 없어요. 인트로/프로필에서 <b>자차 있음</b>으로 설정하면 운전자 블록이 생겨요.</div>';

    h += '<div class="cp-board">';
    drv.forEach(function (d) {
      var pax = passengersOf(d), myCar = (d === me) || (obj(DB.members)[me] || {}).rideWith === d;
      var canAdd = (d === me) || isMeAdmin();
      h += '<div class="cp-driver' + (myCar ? " cp-mine" : "") + '"><div class="cp-driver-head">' + avatar(d, 36) +
        '<div><div class="dh-name">' + esc(memberName(d)) + (canManage(d) ? " " + roleBadge(d) : "") + "</div><div class=\"dh-stn\">🚇 " + stationLabel(d) + "</div></div>" +
        '<span class="cp-cap">탑승 ' + pax.length + "명</span></div><div class=\"cp-pass-list\">";
      if (!pax.length) h += '<div class="cp-pass empty-slot">아직 탑승자가 없어요</div>';
      pax.forEach(function (pid) {
        var canRemove = (pid === me) || (d === me) || isMeAdmin();
        h += '<div class="cp-pass">' + avatar(pid, 24) + "<span>" + esc(memberName(pid)) + "</span><span class=\"cp-stn\">" + stationLabel(pid) + "</span>" +
          (sameCluster(d, pid) ? '<span class="cp-near">가까움</span>' : "") + (canRemove ? '<button class="x" data-action="ride-leave" data-p="' + pid + '">×</button>' : "") + "</div>";
      });
      if (canAdd && unas.length) h += '<button class="btn-ghost btn-block" data-action="recruit" data-d="' + d + '">+ 주변 탑승자 모집</button>';
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
  function sameCluster(a, b) { var ca = clusterOf(a); return ca && ca !== "기타" && ca === clusterOf(b); }
  function sortByProximity(ids, ref) {
    return ids.slice().sort(function (a, b) { return (sameCluster(ref, b) ? 1 : 0) - (sameCluster(ref, a) ? 1 : 0); });
  }

  /* ---------- 사진 ---------- */
  function viewPhotos() {
    var h = '<div class="page-head"><h1>📷 사진·영상</h1>' + (cloudOn() ? '<button class="btn-pri" data-action="pick-photos">+ 올리기</button>' : "") + "</div>";
    if (!cloudOn()) {
      h += '<div class="demo-note">📷 사진·영상 기능을 켜려면 <b>Cloudinary 연결</b>이 필요해요. (config.js의 <code>cloudinary</code> 값) — 연결되면 앱 안에서 업로드 · 일부/전체 선택 · 일괄 다운로드가 켜집니다.</div>';
      return h;
    }
    var photos = bySort(entries(DB.photos), function (kv) { return -(kv[1].ts || 0); });
    if (photoUploading) h += '<div class="hint">⏳ ' + photoUploading + "개 올리는 중… (영상은 조금 걸려요)</div>";
    var sel = selectedPhotoKeys();
    var allSel = photos.length > 0 && sel.length === photos.length;
    h += '<div class="ph-bar"><label class="ph-all"><input type="checkbox" data-action="ph-all"' + (allSel ? " checked" : "") + "> 전체 선택</label>" +
      '<span class="ph-cnt">' + (sel.length ? sel.length + "장 선택" : photos.length + "장") + "</span>" +
      (sel.length ? '<button class="link-danger sm" data-action="ph-del">삭제</button><button class="btn-pri sm" data-action="ph-download">⬇ 다운로드 ' + sel.length + "</button>" : "") + "</div>";
    if (!photos.length) { h += '<div class="empty">아직 올라온 게 없어요.<br>오른쪽 위 <b>+ 올리기</b>로 사진·영상을 모아봐요!</div>'; return h; }
    h += '<div class="ph-grid">';
    photos.forEach(function (kv) {
      var p = kv[1], on = !!photoSel[kv[0]], isVid = p.resourceType === "video";
      h += '<div class="ph-cell' + (on ? " sel" : "") + '" data-action="ph-toggle" data-id="' + kv[0] + '">' +
        '<img loading="lazy" src="' + esc(mediaThumb(p)) + '" alt="">' +
        (isVid ? '<span class="ph-vid">▶</span>' : "") +
        '<span class="ph-check">' + (on ? "✓" : "") + "</span>" +
        '<a class="ph-open" href="' + esc(p.url) + '" target="_blank" rel="noopener" data-action="ph-open" title="원본 보기">⤢</a>' +
        "</div>";
    });
    h += "</div>";
    return h;
  }

  /* ---------- 준비 ---------- */
  function viewPrep() {
    if (state.prep === "vote" && state.pollId) return viewPollDetail(state.pollId); // 투표 상세는 단독 화면
    var seg = [["vote", "투표"], ["schedule", "일정"], ["notice", "공지"], ["packing", "준비물"]];
    var h = '<div class="seg">' + seg.map(function (s) { return '<button class="seg-b' + (state.prep === s[0] ? " on" : "") + '" data-action="prep" data-prep="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>";
    if (state.prep === "vote") h += viewVote();
    else if (state.prep === "schedule") h += prepSchedule();
    else if (state.prep === "notice") h += prepNotice();
    else h += prepPacking();
    return h;
  }
  function prepSchedule() {
    var items = entries(DB.schedule).slice().sort(function (a, b) { var ka = (a[1].day || "") + (a[1].time || ""), kb = (b[1].day || "") + (b[1].time || ""); return ka < kb ? -1 : ka > kb ? 1 : 0; });
    var h = '<div class="page-head sm"><h2>📅 일정</h2>' + (isMeAdmin() ? '<button class="btn-ghost" data-action="new-schedule">+ 추가</button>' : "") + "</div>";
    if (!items.length) h += '<div class="empty sm">일정이 없어요.</div>';
    var curDay = null;
    items.forEach(function (kv) {
      var s = kv[1]; if (s.day !== curDay) { curDay = s.day; h += '<div class="day-head">' + dateKo(s.day) + "</div>"; }
      h += '<div class="tl-item"><div class="tl-time">' + esc(s.time) + '</div><div class="tl-dot"></div><div class="tl-body"><div class="tl-title">' + esc(s.title) + "</div></div>" +
        (isMeAdmin() ? '<button class="tl-del" data-action="del-schedule" data-id="' + kv[0] + '">×</button>' : "") + "</div>";
    });
    return h;
  }
  function prepNotice() {
    var notices = bySort(entries(DB.notices), function (kv) { return -((kv[1].pinned ? 1e15 : 0) + (kv[1].ts || 0)); });
    var h = '<div class="page-head sm"><h2>📢 공지</h2>' + (isMeAdmin() ? '<button class="btn-ghost" data-action="new-notice">+ 추가</button>' : "") + "</div>";
    if (!notices.length) h += '<div class="empty sm">공지가 없어요.</div>';
    notices.forEach(function (kv) {
      var n = kv[1];
      h += '<div class="card notice' + (n.pinned ? " pin" : "") + '">' + (n.pinned ? '<span class="pin-tag">📌 고정</span>' : "") + '<div class="notice-text">' + linkify(esc(n.text)) + "</div>" +
        '<div class="notice-by">' + (n.by ? chip(n.by) : "") + '<span class="ago">' + timeago(n.ts) + "</span>" + ((n.by === me || isMeAdmin()) ? ' <button class="cmt-del" data-action="del-notice" data-id="' + kv[0] + '">×</button>' : "") + "</div></div>";
    });
    return h;
  }
  function prepPacking() {
    var shared = bySort(entries(DB.packing).filter(function (kv) { return (kv[1] || {}).type !== "personal"; }), function (kv) { return kv[1].ts || 0; });
    var personal = bySort(entries(DB.packing).filter(function (kv) { return (kv[1] || {}).type === "personal"; }), function (kv) { return kv[1].ts || 0; });
    var h = '<div class="page-head sm"><h2>🎒 준비물</h2>' + (isMeAdmin() ? '<button class="btn-ghost" data-action="new-packing">+ 추가</button>' : "") + "</div>";
    h += '<div class="pk-sub">공용 (담당자가 챙겨요)</div>';
    if (!shared.length) h += '<div class="empty sm">공용 준비물이 없어요.</div>';
    shared.forEach(function (kv) {
      var p = kv[1];
      h += '<div class="pk-item' + (p.done ? " done" : "") + '"><button class="pk-check" data-action="toggle-pack" data-id="' + kv[0] + '">' + (p.done ? "✓" : "") + "</button>" +
        '<div class="pk-label">' + esc(p.label) + (p.assignee ? ' <span class="pk-who">' + chip(p.assignee) + "</span>" : ' <span class="pk-need">담당 미정</span>') + "</div>" +
        (isMeAdmin() ? '<button class="tl-del" data-action="del-pack" data-id="' + kv[0] + '">×</button>' : "") + "</div>";
    });
    h += '<div class="pk-sub">개인 (전원 각자 · 본인 이름 눌러 체크)</div>';
    if (!personal.length) h += '<div class="empty sm">개인 준비물이 없어요.</div>';
    personal.forEach(function (kv) {
      var p = kv[1], iReady = !!obj(p.ready)[me], cnt = readyCount(p);
      h += '<div class="pk-item personal"><button class="pk-check ' + (iReady ? "on" : "") + '" data-action="toggle-ready" data-id="' + kv[0] + '">' + (iReady ? "✓" : "") + "</button>" +
        '<div class="pk-label">' + esc(p.label) + '<span class="pk-prog">' + cnt + "/" + memberCount() + "명 준비완료</span></div>" + (isMeAdmin() ? '<button class="tl-del" data-action="del-pack" data-id="' + kv[0] + '">×</button>' : "") + "</div>";
    });
    return h;
  }

  /* ============================================================
     모달 & 폼
     ============================================================ */
  function openModal(html) { var r = $("#modal-root"); r.innerHTML = '<div class="modal-back" data-action="close-modal"></div><div class="modal">' + html + "</div>"; r.classList.add("open"); }
  function closeModal() { var r = $("#modal-root"); r.classList.remove("open"); r.innerHTML = ""; }
  function memberOptions(sel) { return (CFG.roster || []).map(function (m) { return '<option value="' + m.id + '"' + (sel === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join(""); }

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
    var rosterChecks = (CFG.roster || []).map(function (m) {
      var on = all || selPart[m.id] != null;
      return '<label class="pchk"><input type="checkbox" class="f-part" value="' + m.id + '"' + (on ? " checked" : "") + ">" + avatar(m.id, 24) + "<span>" + esc(m.name) + "</span></label>";
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
        var amtV = Number(amt.value) || 0; pv.innerHTML = "합계 " + won(sum) + " / 총액 " + won(amtV) + (sum !== amtV ? ' <b class="warn">차이 ' + won(amtV - sum) + "</b>" : " ✓");
      } else { var n = checks.length, per = n ? Math.floor((Number(amt.value) || 0) / n) : 0; pv.innerHTML = n ? (n + "명이 " + won(amt.value) + " → 인당 약 " + won(per)) : "참여자를 선택하세요"; }
    }
    split.onchange = function () { rebuildCustom(); updatePreview(); };
    amt.oninput = updatePreview;
    $("#f-parts").addEventListener("change", function () { rebuildCustom(); updatePreview(); });
    $("#f-custom").addEventListener("input", updatePreview);
    rebuildCustom(); updatePreview();
    window.__expRefresh = function () { rebuildCustom(); updatePreview(); };
  }
  function formNewNotice() { openModal('<h2>공지 추가</h2><label>내용</label><textarea id="f-text" rows="3"></textarea><label class="chk"><input type="checkbox" id="f-pin"> 상단 고정</label><div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-notice">등록</button></div>'); }
  function formNewSchedule() { openModal('<h2>일정 추가</h2><div class="row2"><div><label>날짜</label><input id="f-day" type="date" value="' + ((CFG.trip || {}).startDate || "") + '"></div><div><label>시간</label><input id="f-time" type="time"></div></div><label>내용</label><input id="f-title" placeholder="예: 바베큐 시작"><div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-schedule">추가</button></div>'); }
  function formNewPacking() { openModal('<h2>준비물 추가</h2><label>준비물</label><input id="f-label" placeholder="예: 아이스박스"><label>종류</label><select id="f-type"><option value="shared">공용 (담당자가 챙김)</option><option value="personal">개인 (전원 각자)</option></select><label>담당자 (공용일 때, 선택)</label><select id="f-assignee"><option value="">미정</option>' + memberOptions("") + '</select><div class="modal-foot"><button class="btn-line" data-action="close-modal">취소</button><button class="btn-pri" data-action="save-packing">추가</button></div>'); }

  function formPin() {
    openModal('<h2>🔑 인증번호 설정</h2><p class="pf-note" style="margin-bottom:10px">다른 기기(PC 등)에서 같은 이름으로 입장할 때 쓰는 4자리 숫자예요.</p>' +
      '<label>새 인증번호 (숫자 4자리)</label><input id="np-pin" class="pin-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="••••">' +
      '<div id="np-err" class="pin-err"></div>' +
      '<div class="modal-foot"><button class="btn-line" data-action="open-profile">취소</button><button class="btn-pri" data-action="save-pin">저장</button></div>');
    var i = $("#np-pin"); if (i) { i.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); $("#np-err").textContent = ""; }); setTimeout(function () { try { i.focus(); } catch (e) {} }, 60); }
  }
  /* 프로필 / 멤버 관리 시트 */
  function formProfile() {
    var m = obj(DB.members)[me] || {};
    var dl = (CFG.stations || []).map(function (s) { return '<option value="' + esc(s.n) + '">'; }).join("");
    var photoBtns = cloudOn()
      ? '<button class="btn-ghost sm" data-action="pick-avatar"' + (avatarBusy ? " disabled" : "") + ">" + (avatarBusy ? "변경 중…" : "📷 사진 변경") + "</button>" + (m.photoUrl && !avatarBusy ? ' <button class="link" data-action="remove-avatar">기본 이미지로</button>' : "")
      : '<div class="pf-note">프로필 사진은 사진 기능(Cloudinary) 연결 후 변경할 수 있어요</div>';
    var h = '<h2>내 프로필</h2>' +
      '<div class="pf-photo">' + avatar(me, 72) + '<div class="pf-photo-act"><div class="pf-name">' + esc(memberName(me)) + " " + roleBadge(me) + "</div>" + photoBtns + "</div></div>" +
      '<label>🚇 출발지 (지하철역)</label><input type="text" id="p-station" list="stationlist2" value="' + esc(m.station || "") + '" placeholder="예: 남영"><datalist id="stationlist2">' + dl + "</datalist>" +
      '<label>🚗 자차 보유</label><div class="toggle2"><button id="p-car-no" class="' + (m.hasCar ? "" : "on") + '" data-action="pf-car" data-v="0">없음 🙋</button><button id="p-car-yes" class="' + (m.hasCar ? "on" : "") + '" data-action="pf-car" data-v="1">있음 🚗</button></div>' +
      '<label>🔑 인증번호</label><div class="pf-pin">' + (m.pin ? "설정됨 " : '<b class="warn">미설정 — 다른 기기 입장하려면 설정하세요 </b>') + '<button class="btn-ghost sm" data-action="set-pin">' + (m.pin ? "변경" : "설정") + "</button></div>" +
      '<label>🎨 화면 모드</label><div class="seg">' + [["system", "시스템"], ["light", "라이트"], ["dark", "다크"]].map(function (o) { return '<button class="seg-b' + ((localStorage.getItem("srk_theme") || "system") === o[0] ? " on" : "") + '" data-action="set-theme" data-theme="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<div class="modal-foot"><button class="btn-line" data-action="close-modal">닫기</button><button class="btn-pri" data-action="save-profile">저장</button></div>';
    if (canManage(me)) {
      var meMgr = isManager(me);
      h += '<h2 style="margin-top:24px;font-size:16px">👑 멤버·권한 관리</h2>' +
        '<p class="pf-note" style="margin:-2px 0 8px">관리자·운영진은 <b>운영진 지정</b>·<b>크루원 삭제</b> 가능. 운영진 해제는 관리자만.</p>' +
        '<div class="card" style="box-shadow:none;border:1px solid var(--line);margin:0">';
      (CFG.roster || []).forEach(function (r) {
        var dm = obj(DB.members)[r.id] || {}, tr = roleOf(r.id), self = (r.id === me), acts = "";
        if (!self) {
          if (tr === "manager") { acts = ""; }
          else if (tr === "staff") {
            if (meMgr) acts += '<button class="link" data-action="set-role" data-id="' + r.id + '" data-role="crew">운영진 해제</button>';
            if (meMgr && dm.claimed) acts += '<button class="link-danger" data-action="release-claim" data-id="' + r.id + '">입장 해제</button>';
          } else { // crew
            acts += '<button class="link" data-action="set-role" data-id="' + r.id + '" data-role="staff">운영진 지정</button>';
            if (dm.claimed) acts += '<button class="link-danger" data-action="release-claim" data-id="' + r.id + '">입장 해제</button>';
            acts += '<button class="link-danger" data-action="del-member" data-id="' + r.id + '">삭제</button>';
          }
        }
        h += '<div class="mem-row">' + avatar(r.id, 28) + '<div><div class="mr-name">' + esc(r.name) + " " + roleBadge(r.id) + (self ? ' <span class="rbadge crew">나</span>' : "") + '</div><div class="mr-sub">' + (dm.claimed ? "입장함 · " + (dm.hasCar ? "자차" : "탑승") + " · " + esc(normStation(dm.station) ? normStation(dm.station) + "역" : "역미정") : "미입장") + '</div></div><div class="mr-act">' + acts + "</div></div>";
      });
      h += "</div>";
    }
    h += '<button class="btn-line btn-block" data-action="switch-me" style="margin-top:16px">다른 이름으로 입장 (현재 이름 비우기)</button>';
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
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]"); if (!t) return;
    var a = t.getAttribute("data-action");

    /* 인트로 */
    if (a === "pick-name") { intro.pick = t.getAttribute("data-id"); intro.car = !!(obj(DB.members)[intro.pick] || {}).hasCar; intro.step = "pin"; renderGate(); return; }
    if (a === "pin-submit") {
      var pinv = (($("#i-pin") || {}).value || "").replace(/\D/g, "");
      var pid0 = intro.pick, dmp = obj(DB.members)[pid0] || {};
      if (pinv.length !== 4) { $("#pin-err").textContent = "숫자 4자리를 입력하세요."; return; }
      if (dmp.pin) { // 검증
        if (hashPin(pinv) === dmp.pin) { me = pid0; localStorage.setItem("srk_me", me); intro.step = "name"; intro.pick = null; closeModal(); render(); }
        else { $("#pin-err").textContent = "인증번호가 달라요. 다시 입력해주세요."; var pe = $("#i-pin"); if (pe) { pe.value = ""; pe.focus(); } }
      } else { intro.pinValue = pinv; intro.step = "profile"; renderGate(); } // 신규 설정 → 프로필로
      return;
    }
    if (a === "intro-back") { intro.step = (intro.step === "profile") ? "pin" : "name"; renderGate(); return; }
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
    if (a === "save-profile") { var pon = $("#p-car-yes").classList.contains("on"); var upd = { station: cleanStation($("#p-station").value), hasCar: pon }; if (pon) upd.rideWith = null; Store.update("members/" + me, upd); closeModal(); return; }
    if (a === "switch-me") {
      if (confirm("이 기기에서 로그아웃할까요?\n(이름·인증번호는 그대로 유지되고, 언제든 인증번호로 다시 입장할 수 있어요)")) {
        me = null; localStorage.removeItem("srk_me"); intro.step = "name"; intro.pick = null; closeModal(); renderGate();
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
      Store.update("members/" + aid, { role: nrole }); formProfile(); return;
    }
    if (a === "del-member") {
      if (!canManage(me)) return;
      var did = t.getAttribute("data-id"); if (did === me) return;
      if (roleOf(did) !== "crew") { alert("크루원만 삭제할 수 있어요. (운영진은 먼저 해제하세요)"); return; }
      if (confirm(memberName(did) + "님을 명단에서 삭제할까요?\n입장·프로필 기록이 사라지고 명단에서 빠집니다.")) { Store.remove("members/" + did); formProfile(); }
      return;
    }
    if (a === "release-claim") {
      if (!canManage(me)) return;
      var rcid = t.getAttribute("data-id"), rcr = roleOf(rcid);
      if (rcr === "manager" || (rcr === "staff" && !isManager(me))) return; // 관리자 보호, 운영진은 관리자만 초기화
      if (confirm(memberName(rcid) + "님을 입장 해제(인증번호 초기화)할까요?\n이 이름은 다시 인증번호를 설정해 입장할 수 있게 됩니다.")) { Store.update("members/" + rcid, { claimed: false, pin: null, station: null, hasCar: null, rideWith: null }); formProfile(); }
      return;
    }

    /* 탭 */
    if (a === "tab") { var nt = t.getAttribute("data-tab"); if (nt !== "photo") photoSel = {}; state.tab = nt; state.pollId = null; render(); return; }
    if (a === "prep") { state.prep = t.getAttribute("data-prep"); state.pollId = null; render(); return; }
    if (a === "go-vote") { state.tab = "prep"; state.prep = "vote"; state.pollId = null; render(); return; }
    if (a === "close-modal") { closeModal(); return; }

    /* 투표 */
    if (a === "open-poll") { state.tab = "prep"; state.prep = "vote"; state.pollId = t.getAttribute("data-id"); render(); return; }
    if (a === "back-vote") { state.pollId = null; render(); return; }
    if (a === "vote") { ev.stopPropagation(); doVote(t.getAttribute("data-poll"), t.getAttribute("data-opt")); return; }
    if (a === "new-poll") { if (isMeAdmin()) formNewPoll(); return; }
    if (a === "add-opt-field") { $("#f-opts").insertAdjacentHTML("beforeend", optInput("")); return; }
    if (a === "save-poll") { savePoll(); return; }
    if (a === "del-poll") { var pid0 = t.getAttribute("data-id"); var pp0 = obj(DB.polls)[pid0]; if (!pp0 || !(isMeAdmin() || pp0.createdBy === me)) return; if (confirm("이 투표를 삭제할까요?")) { Store.remove("polls/" + pid0); state.pollId = null; } return; }
    if (a === "toggle-poll") { var pid = t.getAttribute("data-id"); var pp = obj(DB.polls)[pid]; if (!pp || !(isMeAdmin() || pp.createdBy === me)) return; Store.update("polls/" + pid, { status: pp.status === "closed" ? "open" : "closed" }); return; }
    if (a === "add-opt") { var pid2 = t.getAttribute("data-id"); var lbl = prompt("추가할 선택지"); if (lbl && lbl.trim()) Store.set("polls/" + pid2 + "/options/" + key(), { label: clampStr(lbl, 80) }); return; }
    if (a === "send-cmt") { sendComment(t.getAttribute("data-id")); return; }
    if (a === "del-cmt") { Store.remove("polls/" + t.getAttribute("data-poll") + "/comments/" + t.getAttribute("data-cmt")); return; }

    /* 정산 */
    if (a === "new-expense") { formNewExpense(null); return; }
    if (a === "edit-expense") { formNewExpense(t.getAttribute("data-id")); return; }
    if (a === "save-expense") { saveExpense(t.getAttribute("data-edit")); return; }
    if (a === "del-expense") { if (confirm("이 지출을 삭제할까요?")) { Store.remove("expenses/" + t.getAttribute("data-id")); closeModal(); } return; }
    if (a === "part-all") { ev.preventDefault(); document.querySelectorAll(".f-part").forEach(function (c) { c.checked = true; }); if (window.__expRefresh) window.__expRefresh(); return; }
    if (a === "part-none") { ev.preventDefault(); document.querySelectorAll(".f-part").forEach(function (c) { c.checked = false; }); if (window.__expRefresh) window.__expRefresh(); return; }

    /* 카풀 */
    if (a === "ride-pick") { var pp1 = t.getAttribute("data-p"); if (!(pp1 === me || isMeAdmin())) return; chooserModal("어느 차에 탈까요?", drivers(), pp1, "pick-driver"); window.__ridePass = pp1; return; }
    if (a === "pick-driver") { var d1 = t.getAttribute("data-id"); var pass = window.__ridePass; if (pass && isValidDriver(d1)) Store.update("members/" + pass, { rideWith: d1 }); closeModal(); return; }
    if (a === "ride-leave") { var pp2 = t.getAttribute("data-p"); if (!(pp2 === me || ((obj(DB.members)[pp2] || {}).rideWith === me) || isMeAdmin())) return; Store.update("members/" + pp2, { rideWith: null }); return; }
    if (a === "recruit") { var d2 = t.getAttribute("data-d"); if (!(d2 === me || isMeAdmin())) return; chooserModal("주변 탑승자 모집 — 누구를 태울까요?", unassignedPass(), d2, "assign-pass", d2); return; }
    if (a === "assign-pass") { var pid3 = t.getAttribute("data-id"), d3 = t.getAttribute("data-d"); if (isValidDriver(d3)) Store.update("members/" + pid3, { rideWith: d3 }); closeModal(); return; }

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
    if (a === "new-notice") { if (isMeAdmin()) formNewNotice(); return; }
    if (a === "save-notice") { saveNotice(); return; }
    if (a === "del-notice") { var nid = t.getAttribute("data-id"); var nn = obj(DB.notices)[nid]; if (!nn || !(isMeAdmin() || nn.by === me)) return; if (confirm("공지를 삭제할까요?")) Store.remove("notices/" + nid); return; }
    if (a === "new-schedule") { if (isMeAdmin()) formNewSchedule(); return; }
    if (a === "save-schedule") { saveSchedule(); return; }
    if (a === "del-schedule") { if (isMeAdmin() && confirm("일정을 삭제할까요?")) Store.remove("schedule/" + t.getAttribute("data-id")); return; }
    if (a === "new-packing") { if (isMeAdmin()) formNewPacking(); return; }
    if (a === "save-packing") { savePacking(); return; }
    if (a === "del-pack") { if (isMeAdmin() && confirm("준비물을 삭제할까요?")) Store.remove("packing/" + t.getAttribute("data-id")); return; }
    if (a === "toggle-pack") { var id = t.getAttribute("data-id"); var pk = obj(DB.packing)[id]; if (!pk) return; Store.update("packing/" + id, { done: !pk.done }); return; }
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
    var station = cleanStation($("#i-station").value), hasCar = intro.car, pinHash = hashPin(intro.pinValue || "");
    Store.tx("members/" + id, function (m) {
      if (!m) { var r = (CFG.roster || []).find(function (x) { return x.id === id; }) || {}; m = { name: r.name, admin: !!r.admin }; }
      if (m.pin && m.pin !== pinHash) return undefined; // 누가 먼저 인증번호를 설정함 → 중단
      m.claimed = true; m.pin = pinHash; m.claimedAt = Date.now(); m.station = station; m.hasCar = !!hasCar;
      return m;
    }).then(function (ok) {
      if (!ok) { alert("앗, 방금 다른 분이 이 이름의 인증번호를 먼저 설정했어요. 본인이면 인증번호로 입장해주세요."); intro.step = "pin"; renderGate(); return; }
      DB.members = DB.members || {};
      DB.members[id] = Object.assign({}, DB.members[id], { claimed: true, pin: pinHash, station: station, hasCar: !!hasCar });
      me = id; localStorage.setItem("srk_me", me); intro.step = "name"; intro.pick = null; intro.pinValue = null; closeModal(); render();
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
    Store.push("polls", { title: clampStr(title, 100), desc: clampStr($("#f-desc").value, 1000), type: $("#f-type").value, status: "open", createdBy: me, allowAddOptions: $("#f-add").checked, options: optMap, votes: {}, comments: {}, ts: Date.now() });
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
    if (editId) Store.set("expenses/" + editId, data); else Store.push("expenses", data);
    closeModal();
  }
  function saveNotice() { if (!isMeAdmin()) return; var v = $("#f-text").value.trim(); if (!v) return; Store.push("notices", { text: clampStr(v, 1000), by: me, pinned: $("#f-pin").checked, ts: Date.now() }); closeModal(); }
  function saveSchedule() { if (!isMeAdmin()) return; var day = $("#f-day").value, time = $("#f-time").value, title = $("#f-title").value.trim(); if (!day || !time || !title) { alert("날짜·시간·내용을 모두 입력하세요"); return; } Store.push("schedule", { day: day, time: time, title: clampStr(title, 100), ts: Date.now() }); closeModal(); }
  function savePacking() { if (!isMeAdmin()) return; var label = $("#f-label").value.trim(); if (!label) return; Store.push("packing", { label: clampStr(label, 80), type: $("#f-type").value, assignee: $("#f-assignee").value || null, done: false, ready: {}, ts: Date.now() }); closeModal(); }

  /* Cloudinary unsigned 업로드 (이미지·영상) */
  function clUpload(file) {
    var c = CFG.cloudinary, fd = new FormData(); fd.append("file", file); fd.append("upload_preset", c.uploadPreset);
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
      resizeImageFile(f).then(clUpload).then(function (j) {
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
  (function bindPhotoInput() { var fi = $("#photo-file"); if (fi) fi.addEventListener("change", function () { uploadPhotos(this.files); this.value = ""; }); })();
  (function bindAvatarInput() { var af = $("#avatar-file"); if (af) af.addEventListener("change", function () { uploadAvatar(this.files && this.files[0]); this.value = ""; }); })();

  /* ============================================================
     부팅
     ============================================================ */
  Store.onRoot(function (root) {
    DB = root || {};
    if (!booted) { booted = true; if (seedIfEmpty(DB)) return; }
    if (me && DB.members && Object.keys(DB.members).length) {
      var dmme = DB.members[me];
      // 이 기기는 localStorage(srk_me)로 기억됨 → 입장 유지. 이름이 사라졌거나 입장 해제(인증 초기화)됐으면 게이트로.
      if (!dmme || !dmme.claimed) { me = null; localStorage.removeItem("srk_me"); intro.step = "name"; intro.pick = null; }
    }
    render();
  });
})();
