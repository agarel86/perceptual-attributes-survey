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
      "X-GitHub-Api-Version": "2022-11-28"
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
    _appendBody(user, snap) {
      return JSON.stringify({
        ref: GH().branch || "main",
        inputs: {
          username: user,
          snapshot: JSON.stringify(snap || this.snapshot(user))
        }
      });
    },
    inboxPath(user) {
      const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
      return "inbox/" + user + "/" + stamp + "-" + rand() + ".json";
    },
    async createInboxFile(user, snap, keepalive) {
      try {
        const { owner, repo } = GH();
        const path = this.inboxPath(user);
        const r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
          method: "PUT",
          headers: Object.assign(headers(), { "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: "survey append " + user,
            content: b64enc(JSON.stringify(snap)),
            branch: GH().branch || "main"
          }),
          keepalive: !!keepalive
        });
        if (r.status === 201 || r.status === 200) return { ok: true, path: path };
        const txt = await r.text().catch(function () { return ""; });
        return { ok: false, status: r.status, error: txt, path: path };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    async waitForInbox(user, afterMs, timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 40000);
      while (Date.now() < deadline) {
        try {
          const files = await this.listInbox(user);
          const hit = files.some((f) => {
            const t = this.fileStamp(f.name || f.path);
            return t && t >= afterMs - 2000;
          });
          if (hit) return true;
        } catch (e) { /* folder may not exist yet */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return false;
    },
    dispatchWorkflow(user, snap, keepalive) {
      return fetch(this._appendUrl(), {
        method: "POST",
        headers: Object.assign(headers(), { "Content-Type": "application/json" }),
        body: this._appendBody(user, snap),
        keepalive: !!keepalive
      });
    },
    flushKeepalive(user) {
      clearTimeout(this._timer);
      this.saveLocal(user);
      if (!GH().token) return;
      const snap = this.snapshot(user);
      const body = JSON.stringify(snap);
      if (body === this._leaveBody && (Date.now() - this._leaveAt) < 2000) return;
      this._leaveBody = body;
      this._leaveAt = Date.now();
      this.createInboxFile(user, snap, true).then((put) => {
        if (!put.ok) this.dispatchWorkflow(user, snap, true);
      }).catch(() => {
        this.dispatchWorkflow(user, snap, true);
      });
      this._dirty = false;
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
      const snap = this.snapshot(user);
      this._leaveBody = JSON.stringify(snap);
      this._leaveAt = Date.now();
      const started = Date.now();
      try {
        const put = await this.createInboxFile(user, snap, false);
        if (!put.ok) {
          const r = await this.dispatchWorkflow(user, snap, false);
          if (r.status !== 204 && r.status !== 200) {
            const txt = await r.text();
            this.status = "error";
            this._saving = false;
            this._emit();
            console.warn("GitHub save failed", r.status, txt, put.error);
            return { ok: false, error: txt || put.error };
          }
          const landed = await this.waitForInbox(user, started, 40000);
          if (!landed) {
            this.status = "error";
            this._saving = false;
            this._emit();
            return { ok: false, error: "Save sent, but GitHub has not stored it yet. Wait and click Save again." };
          }
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
    clearLocalAll() {
      Object.keys(localStorage).forEach((k) => {
        if (k.indexOf("survey:") === 0 && k !== "survey:ignoreBefore" && k !== "surveyLang") {
          localStorage.removeItem(k);
        }
      });
      this.validation = {};
      this.scores = {};
    },
    async resetAll(byUser) {
      const when = this.nowIso();
      const snap = {
        username: "_reset",
        reset_all: true,
        by: byUser || "admin",
        saved_at: when,
        validation: {},
        scores: {}
      };
      const started = Date.now();
      const put = await this.createInboxFile("_reset", snap, false);
      if (!put.ok) {
        const r = await this.dispatchWorkflow("_reset", snap, true);
        if (r.status !== 204 && r.status !== 200) {
          const txt = await r.text();
          throw new Error(txt || put.error || ("reset failed " + r.status));
        }
        const landed = await this.waitForInbox("_reset", started, 40000);
        if (!landed) throw new Error("Reset sent, but GitHub has not stored it yet. Wait and try again.");
      }
      this.clearLocalAll();
      return { ok: true, saved_at: when };
    },
    fileStamp(path) {
      const m = String(path || "").match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
      if (!m) return 0;
      return Date.parse(m[1] + "T" + m[2] + ":" + m[3] + ":" + m[4] + "Z") || 0;
    },
    snapStamp(snap, path) {
      if (snap && snap.saved_at) {
        const n = Date.parse(snap.saved_at);
        if (!isNaN(n) && n > 0) return n;
      }
      return this.fileStamp(path);
    },
    async latestResetAt() {
      try {
        const files = await this.listInbox("_reset");
        files.sort((a, b) => a.name.localeCompare(b.name));
        const last = files[files.length - 1];
        if (!last) return "";
        const fromName = this.fileStamp(last.name || last.path);
        const snap = await this.getFileJson(last.path);
        const fromSnap = snap && snap.saved_at ? Date.parse(snap.saved_at) : 0;
        const ms = Math.max(fromName || 0, fromSnap || 0);
        return ms ? new Date(ms).toISOString() : "";
      } catch (e) {
        return "";
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
      let localMeta = {};
      try { localMeta = JSON.parse(localStorage.getItem("survey:" + user + ":meta") || "{}"); }
      catch (e) { localMeta = {}; }
      if (!GH().owner) return;
      try {
        const resetAt = await this.latestResetAt();
        const resetMs = resetAt ? Date.parse(resetAt) : 0;
        const files = await this.listInbox(user);
        files.sort((a, b) => a.name.localeCompare(b.name));
        const last = files[files.length - 1];
        this.validation = {};
        this.scores = {};
        if (last) {
          const snap = await this.getFileJson(last.path);
          const snapAt = this.snapStamp(snap, last.path);
          if (snap && (!resetMs || snapAt > resetMs)) this.applySnapshot(snap);
        }
        const localIsNew = !resetMs || (localMeta.t && Number(localMeta.t) >= resetMs);
        if (localIsNew) this.applySnapshot({ validation: localVal, scores: localSco });
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
    async mergeAll(cutMs, usernames) {
      const byUser = {};
      function ensure(u) {
        if (!byUser[u]) byUser[u] = { username: u, validation: {}, scores: {} };
        return byUser[u];
      }
      function applySnap(snap) {
        if (!snap || !snap.username || snap.reset_all || snap.username === "_reset") return;
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
      let resetMs = Number(cutMs) || 0;
      try {
        const resetAt = await this.latestResetAt();
        if (resetAt) resetMs = Math.max(resetMs, Date.parse(resetAt) || 0);
      } catch (e) { /* keep cutMs */ }
      try {
        let names = (usernames || []).filter((u) => u && u !== "_reset" && u !== "admin");
        if (!names.length) {
          const r = await api("/contents/inbox?ref=" + (GH().branch || "main"));
          if (!r.ok) throw new Error("inbox list " + r.status);
          names = (await r.json()).filter((x) => x.type === "dir" && x.name !== "_reset" && x.name !== "admin").map((x) => x.name);
        }
        for (const name of names) {
          const files = await this.listInbox(name);
          const after = files.filter((f) => {
            const t = Store.fileStamp(f.name || f.path);
            return !resetMs || !t || t > resetMs;
          });
          after.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          const last = after[after.length - 1];
          if (!last) continue;
          const snap = await this.getFileJson(last.path);
          if (!snap || snap.reset_all) continue;
          const snapMs = Store.snapStamp(snap, last.path);
          if (resetMs && snapMs && snapMs <= resetMs) continue;
          applySnap(snap);
        }
        if (!resetMs) {
          try {
            const json = await this.getFileJson("survey_answers.json");
            if (json) {
              (json.attribute_validation || json.validation || []).forEach((row) => {
                if (!row.username || !row.variable_name) return;
                const rec = ensure(row.username);
                rec.validation[row.variable_name] = {
                  relevant: row.relevant || "",
                  order_opinion: row.order_opinion || "",
                  comment: row.comment || "",
                  t: row.updated_at || "",
                  updated_at: row.updated_at || ""
                };
              });
              (json.house_scoring || json.scoring || []).forEach((row) => {
                if (!row.username || !row.house_id || !row.variable_name) return;
                const rec = ensure(row.username);
                if (!rec.scores[row.house_id]) rec.scores[row.house_id] = {};
                rec.scores[row.house_id][row.variable_name] = Store.scoreRecord(row.user_grade, row.updated_at || "");
              });
            }
          } catch (e) { /* optional baseline */ }
        }
      } catch (e) {
        console.warn("mergeAll", e);
        throw e;
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
