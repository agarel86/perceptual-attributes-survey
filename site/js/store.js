/* Append-only GitHub store. Never UPDATE or DELETE files. localStorage is instant. */
(function (w) {
  const GH = () => w.SURVEY_GH || {};
  const LS_VAL = (u) => "survey:" + u + ":validation";
  const LS_SCO = (u) => "survey:" + u + ":scores";
  const LS_META = (u) => "survey:" + u + ":meta";

  function b64enc(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64dec(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
  }
  function headers() {
    const h = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "perceptual-attributes-survey"
    };
    if (GH().token) h.Authorization = "Bearer " + GH().token;
    return h;
  }
  function api(path, opts) {
    const { owner, repo } = GH();
    opts = opts || {};
    const h = headers();
    if (opts.body) h["Content-Type"] = "application/json";
    return fetch("https://api.github.com/repos/" + owner + "/" + repo + path, Object.assign({}, opts, {
      headers: h
    }));
  }
  function isoStamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
  function rand() {
    return Math.random().toString(36).slice(2, 10);
  }

  const Store = {
    validation: {},
    scores: {},
    _timer: null,
    _saving: false,
    _dirty: false,
    _leaveAt: 0,
    _leaveBody: "",
    status: "idle",

    loadLocal(user) {
      try { this.validation = JSON.parse(localStorage.getItem(LS_VAL(user)) || "{}"); }
      catch (e) { this.validation = {}; }
      try { this.scores = JSON.parse(localStorage.getItem(LS_SCO(user)) || "{}"); }
      catch (e) { this.scores = {}; }
    },
    saveLocal(user) {
      localStorage.setItem(LS_VAL(user), JSON.stringify(this.validation));
      localStorage.setItem(LS_SCO(user), JSON.stringify(this.scores));
      localStorage.setItem(LS_META(user), JSON.stringify({ t: Date.now() }));
    },
    nowIso() {
      return new Date().toISOString();
    },
    isoTime(v) {
      if (v == null || v === "") return "";
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
      const n = typeof v === "number" ? v : Date.parse(v);
      if (!isNaN(n) && n > 0) return new Date(n).toISOString();
      return String(v);
    },
    valTime(s, fallback) {
      if (!s || typeof s !== "object") return fallback || "";
      return this.isoTime(s.updated_at || s.t) || fallback || "";
    },
    scoreGrade(g) {
      if (g && typeof g === "object") return g.grade || g.user_grade || "";
      return g || "";
    },
    scoreTime(g, fallback) {
      if (g && typeof g === "object") return this.isoTime(g.updated_at || g.t) || fallback || "";
      return fallback || "";
    },
    scoreRecord(grade, when) {
      return { grade: grade, updated_at: when || this.nowIso() };
    },
    setVal(vn, payload) {
      const when = this.nowIso();
      this.validation[vn] = Object.assign({}, this.validation[vn] || {}, payload, { t: Date.now(), updated_at: when });
    },
    setScore(hid, vn, grade) {
      if (!this.scores[hid]) this.scores[hid] = {};
      this.scores[hid][vn] = this.scoreRecord(grade);
    },
    snapshot(user) {
      return {
        username: user,
        saved_at: new Date().toISOString(),
        validation: this.validation,
        scores: this.scores
      };
    },
    applySnapshot(snap) {
      if (!snap || typeof snap !== "object") return;
      if (snap.validation && typeof snap.validation === "object") {
        this.validation = Object.assign({}, this.validation, snap.validation);
      }
      if (snap.scores && typeof snap.scores === "object") {
        Object.keys(snap.scores).forEach((hid) => {
          this.scores[hid] = Object.assign({}, this.scores[hid] || {}, snap.scores[hid]);
        });
      }
    },
    markDirty(user) {
      this.saveLocal(user);
      this._dirty = true;
      this.status = "pending";
      this._emit();
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(user), 2500);
    },
    _emit() {
      document.dispatchEvent(new CustomEvent("survey-save-status", { detail: { status: this.status } }));
    },
    _appendUrl() {
      const { owner, repo } = GH();
      return "https://api.github.com/repos/" + owner + "/" + repo + "/actions/workflows/append.yml/dispatches";
    },
    _appendBody(user) {
      return JSON.stringify({
        ref: GH().branch || "main",
        inputs: {
          username: user,
          snapshot: JSON.stringify(this.snapshot(user))
        }
      });
    },
    // Fire-and-forget POST that survives the tab being closed (no await, keepalive).
    flushKeepalive(user) {
      clearTimeout(this._timer);
      this.saveLocal(user);
      if (!GH().token) return;
      const body = this._appendBody(user);
      if (body === this._leaveBody && (Date.now() - this._leaveAt) < 2000) return;
      this._leaveBody = body;
      this._leaveAt = Date.now();
      try {
        fetch(this._appendUrl(), {
          method: "POST",
          headers: Object.assign(headers(), { "Content-Type": "application/json" }),
          body: body,
          keepalive: true
        });
        this._dirty = false;
      } catch (e) {
        console.warn("keepalive save failed", e);
      }
    },
    async flush(user) {
      clearTimeout(this._timer);
      this.saveLocal(user);
      if (!GH().token) {
        this.status = "local";
        this._emit();
        return { ok: true, local: true };
      }
      if (this._saving) {
        this.flushKeepalive(user);
        return { ok: true, queued: true };
      }
      this._saving = true;
      this.status = "saving";
      this._emit();
      try {
        const body = this._appendBody(user);
        this._leaveBody = body;
        this._leaveAt = Date.now();
        const r = await fetch(this._appendUrl(), {
          method: "POST",
          headers: Object.assign(headers(), { "Content-Type": "application/json" }),
          body: body,
          keepalive: true
        });
        if (r.status !== 204 && r.status !== 200) {
          const txt = await r.text();
          this.status = "error";
          this._saving = false;
          this._emit();
          console.warn("GitHub save failed", r.status, txt);
          return { ok: false, error: txt };
        }
        this._dirty = false;
        this.status = "saved";
        this._saving = false;
        this._emit();
        return { ok: true };
      } catch (e) {
        this.status = "error";
        this._saving = false;
        this._emit();
        console.warn("GitHub save error", e);
        return { ok: false, error: String(e) };
      }
    },
    async listInbox(user) {
      const r = await api("/contents/inbox/" + encodeURIComponent(user) + "?ref=" + (GH().branch || "main"));
      if (r.status === 404) return [];
      if (!r.ok) throw new Error("list inbox " + r.status);
      const items = await r.json();
      return (Array.isArray(items) ? items : []).filter((x) => x.type === "file" && x.name.endsWith(".json"));
    },
    async getFileJson(path) {
      const r = await api("/contents/" + path + "?ref=" + (GH().branch || "main"));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.content) return null;
      try { return JSON.parse(b64dec(j.content)); }
      catch (e) { return null; }
    },
    async hydrateUser(user) {
      this.loadLocal(user);
      const localVal = this.validation;
      const localSco = this.scores;
      if (!GH().owner) return;
      try {
        const files = await this.listInbox(user);
        files.sort((a, b) => a.name.localeCompare(b.name));
        const last = files[files.length - 1];
        if (last) {
          const snap = await this.getFileJson(last.path);
          if (snap) {
            this.validation = {};
            this.scores = {};
            this.applySnapshot(snap);
          }
        }
        this.applySnapshot({ validation: localVal, scores: localSco });
        this.saveLocal(user);
      } catch (e) {
        this.validation = localVal;
        this.scores = localSco;
        console.warn("hydrate from GitHub failed (using localStorage)", e);
      }
    },
    async listAllInbox() {
      const r = await api("/git/trees/" + (GH().branch || "main") + "?recursive=1");
      if (!r.ok) throw new Error("tree " + r.status);
      const j = await r.json();
      return (j.tree || []).filter((n) => n.type === "blob" && n.path.startsWith("inbox/") && n.path.endsWith(".json"));
    },
    async mergeAll() {
      const byUser = {};
      function ensure(u) {
        if (!byUser[u]) byUser[u] = { username: u, validation: {}, scores: {} };
        return byUser[u];
      }
      function applySnap(snap) {
        if (!snap || !snap.username) return;
        const rec = ensure(snap.username);
        const stamp = snap.saved_at || "";
        Object.keys(snap.validation || {}).forEach((vn) => {
          const s = Object.assign({}, rec.validation[vn] || {}, snap.validation[vn] || {});
          s.updated_at = Store.valTime(s, stamp);
          rec.validation[vn] = s;
        });
        Object.keys(snap.scores || {}).forEach((hid) => {
          if (!rec.scores[hid]) rec.scores[hid] = {};
          Object.keys(snap.scores[hid] || {}).forEach((vn) => {
            const g = snap.scores[hid][vn];
            const grade = Store.scoreGrade(g);
            if (!grade) return;
            rec.scores[hid][vn] = Store.scoreRecord(grade, Store.scoreTime(g, stamp));
          });
        });
      }
      try {
        const json = await this.getFileJson("survey_answers.json");
        if (json) {
          (json.attribute_validation || json.validation || []).forEach((r) => {
            if (!r.username || !r.variable_name) return;
            const rec = ensure(r.username);
            rec.validation[r.variable_name] = {
              relevant: r.relevant || "",
              order_opinion: r.order_opinion || "",
              comment: r.comment || "",
              t: r.updated_at || "",
              updated_at: r.updated_at || ""
            };
          });
          (json.house_scoring || json.scoring || []).forEach((r) => {
            if (!r.username || !r.house_id || !r.variable_name) return;
            const rec = ensure(r.username);
            if (!rec.scores[r.house_id]) rec.scores[r.house_id] = {};
            rec.scores[r.house_id][r.variable_name] = Store.scoreRecord(r.user_grade, r.updated_at || "");
          });
        }
      } catch (e) { /* optional baseline */ }
      try {
        const files = await this.listAllInbox();
        files.sort((a, b) => a.path.localeCompare(b.path));
        for (const f of files) {
          applySnap(await this.getFileJson(f.path));
        }
      } catch (e) {
        console.warn("mergeAll", e);
      }
      return byUser;
    },
    csvEscape(v) {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    },
    downloadCsv(name, rows) {
      const text = rows.map((r) => r.map(this.csvEscape).join(",")).join("\n");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  w.SurveyStore = Store;
})(window);
