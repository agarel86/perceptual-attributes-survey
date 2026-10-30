const GRADES = ["Excellent", "Good", "Average", "Bad", "Terrible", "Unknown"];
const GRADE_LABELS = {
  en: { Excellent: "Excellent", Good: "Good", Average: "Average", Bad: "Bad", Terrible: "Terrible", Unknown: "Unknown" },
  fr: { Excellent: "Excellent", Good: "Bon", Average: "Moyen", Bad: "Mauvais", Terrible: "Très mauvais", Unknown: "Inconnu" },
  nl: { Excellent: "Uitstekend", Good: "Goed", Average: "Gemiddeld", Bad: "Slecht", Terrible: "Zeer slecht", Unknown: "Onbekend" }
};

const USERNAME = sessionStorage.getItem("surveyUser") || "";
if (!USERNAME) location.replace("index.html");

let LANG = localStorage.getItem("surveyLang") || "en";
let IS_ADMIN = false;
let IS_REVIEWER = false;
let USER = {};
let T = I18N[LANG] || I18N.en;

let TAXONOMY = [];
let TAXONOMY_I18N = {};
let LABELS = { FL: {}, SL: {} };
let LABELS_I18N = {};
let HOUSES_ALL = [];
let HOUSE_ATTRS = {};
let LOTS = {};
let USERS = {};

let TX = [];
let TX_SAVED = {};
let FL = {};
let SL = {};
let HOUSES = [];
let CUR_HOUSE = null;
let CUR_HOUSE_DATA = null;
let CUR_HOUSE_SAVED = {};
let ALL_SCORES = {};
let CURRENT_TAB = "welcome";
let valLoaded = false;
let DATA_READY = false;

function t(k) { return T[k] || (I18N.en[k] || k); }
function gradeLabel(g) { return (GRADE_LABELS[LANG] || GRADE_LABELS.en)[g] || g; }
function imgPath(house) {
  return "images/" + house.id + "/";
}

function localizedLabels() {
  if (LANG !== "fr" && LANG !== "nl") return { FL: LABELS.FL || {}, SL: LABELS.SL || {} };
  const fl = {};
  const sl = {};
  Object.keys(LABELS.FL || {}).forEach((k) => {
    fl[k] = (LABELS_I18N.FL && LABELS_I18N.FL[k] && LABELS_I18N.FL[k][LANG]) || LABELS.FL[k];
  });
  Object.keys(LABELS.SL || {}).forEach((k) => {
    sl[k] = (LABELS_I18N.SL && LABELS_I18N.SL[k] && LABELS_I18N.SL[k][LANG]) || LABELS.SL[k];
  });
  return { FL: fl, SL: sl };
}

function localizedTaxonomy() {
  return TAXONOMY.map((a) => {
    const tr = TAXONOMY_I18N[a.vn] || {};
    const feat = (LANG === "fr" || LANG === "nl")
      ? ((tr.feat && tr.feat[LANG]) || a.feat)
      : a.feat;
    return Object.assign({}, a, {
      feat: feat,
      label: feat,
      def: (LANG === "fr" || LANG === "nl") ? ((tr.def && tr.def[LANG]) || a.def || "") : (a.def || ""),
      rat: (LANG === "fr" || LANG === "nl") ? ((tr.rat && tr.rat[LANG]) || a.rat || "") : (a.rat || ""),
      cues: (LANG === "fr" || LANG === "nl") ? ((tr.cues && tr.cues[LANG]) || a.cues || []) : (a.cues || [])
    });
  });
}

function userHouseIds() {
  if (USER.is_admin) return HOUSES_ALL.map((h) => h.id).sort();
  return LOTS[String(USER.lot_id || "")] || [];
}

function assignedAttrVns(hid) {
  const vns = HOUSE_ATTRS[hid];
  if (vns && vns.length) return vns.slice();
  return TAXONOMY.map((a) => a.vn);
}

function featsForHouse(hid) {
  const tx = localizedTaxonomy();
  const byVn = {};
  tx.forEach((a) => { byVn[a.vn] = a; });
  return assignedAttrVns(hid).map((vn) => {
    const a = byVn[vn];
    if (!a) return null;
    return { vn: a.vn, feat: a.feat, sec: a.sec, sub: a.sub };
  }).filter(Boolean);
}

function nAssignedScores(ids) {
  return ids.reduce((n, hid) => n + assignedAttrVns(hid).length, 0);
}

function applyI18n() {
  T = I18N[LANG] || I18N.en;
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.getAttribute("data-i18n");
    if (T[k]) el.textContent = T[k];
  });
  const intro = document.getElementById("welcomeIntro");
  if (intro) intro.innerHTML = T.welcome_html;
  document.title = t("app_title");
  ["en", "fr", "nl"].forEach((l) => {
    const a = document.getElementById("lang-" + l);
    if (a) a.classList.toggle("on", l === LANG);
  });
}

function tabOrder() {
  const tabs = ["welcome", "validate", "scoring"];
  if (IS_ADMIN) tabs.push("admin");
  return tabs;
}

function changeLang(lang) {
  LANG = lang;
  localStorage.setItem("surveyLang", lang);
  applyI18n();
  const labs = localizedLabels();
  FL = labs.FL;
  SL = labs.SL;
  TX = localizedTaxonomy();
  valLoaded = false;
  if (CURRENT_TAB === "validate") loadValidation();
  if (CURRENT_TAB === "scoring" && CUR_HOUSE) selectHouse(CUR_HOUSE);
  if (CURRENT_TAB === "welcome") loadProgress();
  return false;
}

let adminTimer = null;
function switchTab(name) {
  CURRENT_TAB = name;
  sessionStorage.setItem("surveyTab", name);
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll("#mainTabs button").forEach((b) => b.classList.remove("active"));
  const pane = document.getElementById("tab-" + name);
  if (pane) pane.classList.add("active");
  const btn = document.querySelector('#mainTabs button[data-tab="' + name + '"]');
  if (btn) btn.classList.add("active");
  if (adminTimer) { clearInterval(adminTimer); adminTimer = null; }
  if (name === "validate") loadValidation();
  if (name === "scoring") loadHouses();
  if (name === "admin") {
    loadAdmin();
    adminTimer = setInterval(loadAdmin, 8000);
  }
  if (name === "welcome") loadProgress();
  updateNavButtons();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navTab(dir) {
  const tabs = tabOrder();
  const i = tabs.indexOf(CURRENT_TAB);
  const next = tabs[i + dir];
  if (next) switchTab(next);
}

function updateNavButtons() {
  const tabs = tabOrder();
  const i = tabs.indexOf(CURRENT_TAB);
  const prev = document.getElementById("btnPrev");
  const next = document.getElementById("btnNext");
  if (prev) prev.disabled = i <= 0;
  if (next) next.disabled = i >= tabs.length - 1;
}

function isValComplete(s) {
  if (!s || !s.relevant) return false;
  if (s.relevant === "no") return true;
  return s.relevant === "yes" && !!s.order_opinion;
}

function valDoneCount(saved, taxonomy) {
  return taxonomy.filter((a) => isValComplete(saved[a.vn])).length;
}

function scoreDoneCount(scores, houseIds) {
  let n = 0;
  houseIds.forEach((hid) => {
    const g = scores[hid] || {};
    assignedAttrVns(hid).forEach((vn) => { if (SurveyStore.scoreGrade(g[vn])) n += 1; });
  });
  return n;
}

function loadProgress() {
  const ids = userHouseIds();
  const vd = valDoneCount(TX_SAVED, TAXONOMY);
  const vt = TAXONOMY.length;
  const sd = scoreDoneCount(ALL_SCORES, ids);
  const st = nAssignedScores(ids);
  const vp = vt ? Math.round(vd / vt * 100) : 0;
  const sp = st ? Math.round(sd / st * 100) : 0;
  document.getElementById("progressSummary").innerHTML =
    '<p style="margin-bottom:6px"><strong>' + t("progress_val") + ":</strong> " + vd + " / " + vt + " (" + vp + "%)</p>" +
    '<div class="progress-bar"><div class="progress-fill" style="width:' + vp + '%"></div></div>' +
    '<p style="margin:12px 0 6px"><strong>' + t("progress_score") + ":</strong> " + sd + " / " + st + " (" + sp + "%)</p>" +
    '<div class="progress-bar"><div class="progress-fill" style="width:' + sp + '%"></div></div>';
}

function loadValidation() {
  TX = localizedTaxonomy();
  const labs = localizedLabels();
  FL = labs.FL;
  SL = labs.SL;
  const sel = document.getElementById("valFilterSec");
  const keep = sel.value || "all";
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = t("all_sections");
  sel.appendChild(all);
  Object.keys(FL).forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = FL[k];
    sel.appendChild(o);
  });
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  valLoaded = true;
  renderValidation();
}

function renderValidation() {
  const secF = document.getElementById("valFilterSec").value;
  const filtered = TX.filter((a) => secF === "all" || a.sec === secF);
  const done = TX.filter((a) => isValComplete(TX_SAVED[a.vn])).length;
  document.getElementById("valProgress").textContent = t("completed") + ": " + done + " / " + TX.length;

  const groups = {};
  filtered.forEach((a) => {
    if (!groups[a.sec]) groups[a.sec] = {};
    if (!groups[a.sec][a.sub]) groups[a.sec][a.sub] = [];
    groups[a.sec][a.sub].push(a);
  });

  let html = "";
  Object.keys(groups).forEach((sec) => {
    html += '<div class="sec-header">' + (FL[sec] || sec) + "</div>";
    Object.keys(groups[sec]).forEach((sub) => {
      if (sub !== sec) html += '<div class="sub-header">' + (SL[sub] || sub) + "</div>";
      groups[sec][sub].forEach((a) => {
        const s = TX_SAVED[a.vn] || {};
        const tick = isValComplete(s) ? '<span class="saved-tick"><i class="bi bi-check-circle-fill"></i> ' + t("saved") + "</span>" : "";
        const orderBlock = s.relevant === "yes" ? (
          "<div><span class=\"attr-q\">" + t("order_q") + '</span><div class="btn-group">' +
          '<button type="button" class="btn-1' + (s.order_opinion === "first" ? " sel" : "") + "\" onclick=\"saveVal('" + a.vn + "','order_opinion','first')\">" + t("order_1") + "</button>" +
          '<button type="button" class="btn-2' + (s.order_opinion === "second" ? " sel" : "") + "\" onclick=\"saveVal('" + a.vn + "','order_opinion','second')\">" + t("order_2") + "</button>" +
          "</div></div>"
        ) : "";
        const feat = (a.feat || a.vn).replace(/_/g, " ");
        html += '<div class="attr-card"><div class="attr-header"><div class="attr-name">' + feat + " " + tick + "</div></div>" +
          '<div class="attr-def">' + (a.def || "") + "</div>" +
          (a.cues && a.cues.length ? '<div class="attr-cues">' + a.cues.map((c) => "<span>" + c + "</span>").join("") + "</div>" : "") +
          '<div class="attr-actions"><div><span class="attr-q">' + t("relevant_q") + '</span><div class="btn-group">' +
          '<button type="button" class="btn-y' + (s.relevant === "yes" ? " sel" : "") + "\" onclick=\"saveVal('" + a.vn + "','relevant','yes')\">" + t("yes") + "</button>" +
          '<button type="button" class="btn-n' + (s.relevant === "no" ? " sel" : "") + "\" onclick=\"saveVal('" + a.vn + "','relevant','no')\">" + t("no") + "</button>" +
          "</div></div>" + orderBlock + "</div></div>";
      });
    });
  });
  document.getElementById("validationContent").innerHTML = html;
}

function setSaveStatus(ok, detail) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.className = "save-status " + (ok ? "ok" : "err");
  el.textContent = ok ? t("save_ok") : (detail || t("save_fail"));
}

function persistAnswers() {
  if (IS_REVIEWER) return;
  SurveyStore.validation = TX_SAVED;
  SurveyStore.scores = ALL_SCORES;
  SurveyStore.markDirty(USERNAME);
}

async function flushBackup(showStatus) {
  if (IS_REVIEWER) return true;
  if (CUR_HOUSE) ALL_SCORES[CUR_HOUSE] = Object.assign({}, CUR_HOUSE_SAVED);
  SurveyStore.validation = TX_SAVED;
  SurveyStore.scores = ALL_SCORES;
  const r = await SurveyStore.flush(USERNAME);
  if (showStatus) setSaveStatus(!!r.ok, r.error);
  return !!r.ok;
}

function signOut(ev) {
  if (ev) ev.preventDefault();
  flushBackup(false).finally(function () {
    sessionStorage.removeItem("surveyUser");
    location.href = "index.html";
  });
  return false;
}

function syncStore() {
  if (CUR_HOUSE) ALL_SCORES[CUR_HOUSE] = Object.assign({}, CUR_HOUSE_SAVED);
  SurveyStore.validation = TX_SAVED;
  SurveyStore.scores = ALL_SCORES;
}

function saveOnLeave() {
  if (IS_REVIEWER || !USERNAME) return;
  syncStore();
  SurveyStore.flushKeepalive(USERNAME);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") saveOnLeave();
});
window.addEventListener("pagehide", saveOnLeave);
window.addEventListener("beforeunload", saveOnLeave);
window.addEventListener("freeze", saveOnLeave);

document.addEventListener("survey-save-status", function (e) {
  const st = e.detail && e.detail.status;
  if (st === "saved" || st === "local") setSaveStatus(true);
  if (st === "error") setSaveStatus(false);
});

function saveVal(vn, field, value) {
  if (IS_REVIEWER) return;
  if (!TX_SAVED[vn]) TX_SAVED[vn] = {};
  TX_SAVED[vn][field] = value;
  if (field === "relevant" && value === "no") TX_SAVED[vn].order_opinion = "";
  TX_SAVED[vn].t = Date.now();
  TX_SAVED[vn].updated_at = SurveyStore.nowIso();
  renderValidation();
  persistAnswers();
}

function loadHouses() {
  if (CUR_HOUSE) ALL_SCORES[CUR_HOUSE] = Object.assign({}, CUR_HOUSE_SAVED);
  const keep = CUR_HOUSE;
  const ids = userHouseIds();
  const byId = {};
  HOUSES_ALL.forEach((h) => { byId[h.id] = h; });
  HOUSES = ids.map((id) => byId[id]).filter(Boolean).map((h) => Object.assign({}, h, {
    ip: imgPath(h),
    img_count: (h.imgs || []).length,
    feats: featsForHouse(h.id)
  }));
  const next = (keep && HOUSES.some((h) => h.id === keep)) ? keep : (HOUSES[0] && HOUSES[0].id);
  if (next) selectHouse(next);
  else renderHouseNav();
}

function renderHouseNav() {
  if (!HOUSES.length) {
    document.getElementById("houseNav").innerHTML = '<p style="color:var(--muted)">' + t("no_houses") + "</p>";
    return;
  }
  document.getElementById("houseNav").innerHTML = HOUSES.map((h) =>
    '<button type="button" class="house-btn' + (CUR_HOUSE === h.id ? " active" : "") + '" onclick="selectHouse(\'' + h.id + '\')">' +
    h.id.replace("id", "ID ") +
    '<span class="prog">' + h.img_count + " " + t("photos") + "</span></button>"
  ).join("");
}

function selectHouse(hid) {
  if (CUR_HOUSE && CUR_HOUSE !== hid) {
    ALL_SCORES[CUR_HOUSE] = Object.assign({}, CUR_HOUSE_SAVED);
  }
  CUR_HOUSE = hid;
  renderHouseNav();
  const h = HOUSES.find((x) => x.id === hid);
  CUR_HOUSE_DATA = h;
  CUR_HOUSE_SAVED = Object.assign({}, ALL_SCORES[hid] || {});
  ALL_SCORES[hid] = Object.assign({}, CUR_HOUSE_SAVED);
  const labs = localizedLabels();
  FL = labs.FL;
  SL = labs.SL;
  renderHouseDetail();
}

function renderHouseDetail() {
  const h = CUR_HOUSE_DATA;
  if (!h) return;
  const imgs = h.imgs || [];
  const ip = h.ip;
  let html = '<div class="scoring-layout"><div class="scoring-photos"><div class="img-viewer">' +
    '<div class="img-strip" id="imgStrip">' +
    imgs.map((img, i) => '<img class="thumb' + (i === 0 ? " active" : "") + '" src="' + ip + img + '" onclick="showImg(' + i + ')" loading="lazy" alt="">').join("") +
    "</div>" +
    '<img class="big-img" id="bigImg" src="' + (ip + (imgs[0] || "")) + '" alt="">' +
    '<div class="img-counter" id="imgCounter">1 / ' + imgs.length + "</div></div></div><div class=\"scoring-attrs\">";

  const done = Object.keys(CUR_HOUSE_SAVED).filter((k) => SurveyStore.scoreGrade(CUR_HOUSE_SAVED[k])).length;
  const total = h.feats.length;
  html += '<div class="filter-bar"><span class="progress-text" id="houseProgText"><strong>' + h.id.replace("id", "ID ") + "</strong> — " + t("scored") + ": " + done + " / " + total + " (" + (total ? Math.round(done / total * 100) : 0) + "%)</span></div>";
  html += '<div class="progress-bar"><div class="progress-fill" id="houseProgFill" style="width:' + (total ? done / total * 100 : 0) + '%"></div></div>';

  const groups = {};
  h.feats.forEach((f) => {
    if (!groups[f.sec]) groups[f.sec] = {};
    if (!groups[f.sec][f.sub]) groups[f.sec][f.sub] = [];
    groups[f.sec][f.sub].push(f);
  });
  Object.keys(groups).forEach((sec) => {
    html += '<div class="sec-header">' + (FL[sec] || sec) + "</div>";
    Object.keys(groups[sec]).forEach((sub) => {
      if (sub !== sec) html += '<div class="sub-header">' + (SL[sub] || sub) + "</div>";
      groups[sec][sub].forEach((f) => {
        const ug = SurveyStore.scoreGrade(CUR_HOUSE_SAVED[f.vn]);
        const feat = (f.feat || f.vn).replace(/_/g, " ");
        html += '<div class="feat-row"><div class="feat-name">' + feat + "</div>" +
          '<select class="grade-select' + (ug ? " done" : "") + "\" onchange=\"saveScore('" + h.id + "','" + f.vn + "',this.value)\">" +
          '<option value="">' + t("your_grade") + "</option>" +
          GRADES.map((g) => '<option value="' + g + '"' + (ug === g ? " selected" : "") + ">" + gradeLabel(g) + "</option>").join("") +
          "</select></div>";
      });
    });
  });
  html += "</div></div>";
  document.getElementById("houseContent").innerHTML = html;
}

function showImg(idx) {
  const h = CUR_HOUSE_DATA;
  document.getElementById("bigImg").src = h.ip + h.imgs[idx];
  document.getElementById("imgCounter").textContent = (idx + 1) + " / " + h.imgs.length;
  document.querySelectorAll("#imgStrip .thumb").forEach((el, i) => el.classList.toggle("active", i === idx));
}

function saveScore(hid, vn, grade) {
  if (IS_REVIEWER) return;
  const sel = event && event.target;
  const rec = SurveyStore.scoreRecord(grade);
  CUR_HOUSE_SAVED[vn] = rec;
  if (!ALL_SCORES[hid]) ALL_SCORES[hid] = {};
  ALL_SCORES[hid][vn] = rec;
  if (sel) sel.classList.toggle("done", !!SurveyStore.scoreGrade(grade));
  const done = Object.keys(CUR_HOUSE_SAVED).filter((k) => SurveyStore.scoreGrade(CUR_HOUSE_SAVED[k])).length;
  const total = CUR_HOUSE_DATA.feats.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const pt = document.getElementById("houseProgText");
  const pf = document.getElementById("houseProgFill");
  if (pt) pt.innerHTML = "<strong>" + hid.replace("id", "ID ") + "</strong> — " + t("scored") + ": " + done + " / " + total + " (" + pct + "%)";
  if (pf) pf.style.width = pct + "%";
  persistAnswers();
}

let ADMIN_MERGED = null;
async function loadAdmin() {
  if (!IS_ADMIN) return;
  try {
    ADMIN_MERGED = await SurveyStore.mergeAll();
  } catch (e) {
    ADMIN_MERGED = ADMIN_MERGED || {};
  }
  const rows = Object.keys(USERS).filter((u) => !USERS[u].is_admin).map((uname) => {
    const udata = USERS[uname];
    const lotH = LOTS[String(udata.lot_id || "")] || [];
    const saved = (ADMIN_MERGED[uname] && ADMIN_MERGED[uname].validation) || {};
    const scores = (ADMIN_MERGED[uname] && ADMIN_MERGED[uname].scores) || {};
    const vc = valDoneCount(saved, TAXONOMY);
    const sc = scoreDoneCount(scores, lotH);
    return {
      username: uname,
      houses: lotH.length,
      val_done: vc,
      val_total: TAXONOMY.length,
      score_done: sc,
      score_total: nAssignedScores(lotH)
    };
  });
  document.querySelector("#adminTable tbody").innerHTML = rows.map((s) => {
    const vp = s.val_total ? Math.round(s.val_done / s.val_total * 100) : 0;
    const sp = s.score_total ? Math.round(s.score_done / s.score_total * 100) : 0;
    return "<tr><td><strong>" + s.username + "</strong></td><td>" + s.houses + "</td><td>" +
      s.val_done + "/" + s.val_total + " (" + vp + "%)</td><td>" +
      s.score_done + "/" + s.score_total + " (" + sp + "%)</td></tr>";
  }).join("");
}

function exportCsv(kind) {
  if (IS_REVIEWER) return;
  const merged = ADMIN_MERGED || {};
  const txMap = {};
  TAXONOMY.forEach((a) => { txMap[a.vn] = a; });
  if (kind === "validation") {
    const rows = [["username", "variable_name", "relevant", "order_opinion", "comment", "updated_at"]];
    Object.keys(merged).sort().forEach((u) => {
      const val = merged[u].validation || {};
      Object.keys(val).sort().forEach((vn) => {
        const s = val[vn] || {};
        rows.push([u, vn, s.relevant || "", s.relevant === "no" ? "" : (s.order_opinion || ""), s.comment || "", SurveyStore.valTime(s)]);
      });
    });
    SurveyStore.downloadCsv("attribute_validation.csv", rows);
    return;
  }
  if (kind === "scoring") {
    const rows = [["username", "house_id", "variable_name", "user_grade", "updated_at"]];
    Object.keys(merged).sort().forEach((u) => {
      const sc = merged[u].scores || {};
      Object.keys(sc).sort().forEach((hid) => {
        Object.keys(sc[hid] || {}).sort().forEach((vn) => {
          const grade = SurveyStore.scoreGrade(sc[hid][vn]);
          if (grade) rows.push([u, hid, vn, grade, SurveyStore.scoreTime(sc[hid][vn])]);
        });
      });
    });
    SurveyStore.downloadCsv("house_scoring.csv", rows);
    return;
  }
  const rows = [["type", "username", "house_id", "variable_name", "feature_name", "ai_order", "section", "subcategory", "ai_grade", "ai_confidence", "relevant_for_valuation", "order_opinion", "user_grade", "comment", "updated_at"]];
  Object.keys(merged).sort().forEach((u) => {
    const val = merged[u].validation || {};
    Object.keys(val).sort().forEach((vn) => {
      const s = val[vn] || {};
      const a = txMap[vn] || {};
      rows.push(["validation", u, "", vn, a.feat || "", a.ord || "", a.sec || "", a.sub || "", "", "", s.relevant || "", s.relevant === "no" ? "" : (s.order_opinion || ""), "", s.comment || "", SurveyStore.valTime(s)]);
    });
    const sc = merged[u].scores || {};
    Object.keys(sc).sort().forEach((hid) => {
      Object.keys(sc[hid] || {}).sort().forEach((vn) => {
        const grade = SurveyStore.scoreGrade(sc[hid][vn]);
        if (!grade) return;
        const a = txMap[vn] || {};
        rows.push(["scoring", u, hid, vn, a.feat || "", a.ord || "", a.sec || "", a.sub || "", "", "", "", "", grade, "", SurveyStore.scoreTime(sc[hid][vn])]);
      });
    });
  });
  SurveyStore.downloadCsv("survey_results_combined.csv", rows);
}

async function boot() {
  const [users, taxonomy, labels, houses, houseAttrs, lots, txI18n, lbI18n] = await Promise.all([
    fetch("data/users.json").then((r) => r.json()),
    fetch("data/taxonomy.json").then((r) => r.json()),
    fetch("data/labels.json").then((r) => r.json()),
    fetch("data/houses.json").then((r) => r.json()),
    fetch("data/house_attrs.json").then((r) => r.json()),
    fetch("data/lots.json").then((r) => r.json()),
    fetch("data/taxonomy_i18n.json").then((r) => r.json()).catch(() => ({})),
    fetch("data/labels_i18n.json").then((r) => r.json()).catch(() => ({}))
  ]);
  USERS = users;
  USER = users[USERNAME] || {};
  if (!USER || !users[USERNAME]) {
    sessionStorage.removeItem("surveyUser");
    location.replace("index.html");
    return;
  }
  IS_ADMIN = !!USER.is_admin;
  IS_REVIEWER = !!USER.is_reviewer;
  TAXONOMY = taxonomy;
  LABELS = labels;
  HOUSES_ALL = houses;
  HOUSE_ATTRS = houseAttrs;
  LOTS = lots;
  TAXONOMY_I18N = txI18n;
  LABELS_I18N = lbI18n;

  document.getElementById("userBadge").textContent = USERNAME;
  if (IS_ADMIN) document.getElementById("adminTabBtn").style.display = "";
  if (IS_REVIEWER) {
    document.getElementById("adminExport").style.display = "none";
    document.getElementById("reviewerNote").style.display = "";
    document.getElementById("btnSave").style.display = "none";
  }

  await SurveyStore.hydrateUser(USERNAME);
  TX_SAVED = SurveyStore.validation || {};
  ALL_SCORES = SurveyStore.scores || {};
  DATA_READY = true;

  applyI18n();
  const params = new URLSearchParams(location.search);
  let start = params.get("tab") || sessionStorage.getItem("surveyTab") || "welcome";
  const allowed = tabOrder();
  if (!allowed.includes(start)) start = "welcome";
  switchTab(start);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML("afterbegin", '<p style="padding:16px;color:#b91c1c">Could not load survey data.</p>');
});
