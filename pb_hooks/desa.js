const STATE_ID = "desasync0000001";
const ACTIVE = 'status = "pending" || status = "sending" || status = "uncertain"';

function config() {
  return {
    accountId: $os.getenv("REPLIZ_ACCOUNT_ID") || "6a88116362caae1e04010787",
    authorization: $os.getenv("REPLIZ_AUTHORIZATION"),
    url: ($os.getenv("REPLIZ_API_URL") || "https://api.repliz.com").replace(/\/+$/, ""),
  };
}

function featureConfig() {
  const thresholdValue = $os.getenv("JEV_THRESHOLD");
  const threshold = thresholdValue && thresholdValue.trim() ? Number(thresholdValue) : NaN;
  return {
    jevKey: $os.getenv("JEV_API_KEY") || "",
    jevModel: $os.getenv("JEV_MODEL") || "jev-1.13.0",
    jevThreshold: Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.6,
    jevUrl: ($os.getenv("JEV_BASE_URL") || "https://ai.sumopod.com/v1").replace(/\/+$/, ""),
    kaneoKey: $os.getenv("KANEO_API_KEY") || "",
    kaneoProjectId: $os.getenv("KANEO_PROJECT_ID") || "",
    kaneoUrl: ($os.getenv("KANEO_API_URL") || "https://kaneo.nekoding.xyz/api").replace(/\/+$/, ""),
  };
}

const BUILDS_CACHE_MS = 180000;
let buildsCache = { expiresAt: 0, items: [] };

function state(app) { return app.findRecordById("sync_state", STATE_ID); }

function status(app) {
  const record = state(app);
  const result = {
    configured: /^Basic [A-Za-z0-9+/]+=*$/.test(config().authorization),
    lastSync: record.getString("lastSync"),
    syncing: record.getBool("syncing") && record.getFloat("leaseUntil") > Date.now(),
    followersCount: Math.max(0, record.getInt("followersCount")),
    followersUpdatedAt: record.getString("followersUpdatedAt"),
  };
  if (record.getString("error")) result.error = record.getString("error");
  return result;
}

function saveSync(app, values) {
  app.runInTransaction((tx) => {
    const record = state(tx);
    for (const key in values) record.set(key, values[key]);
    tx.save(record);
  });
}

function bootstrap(app) {
  // Initial migrations run after bootstrap; subsequent boots recover interrupted sends.
  try { app.findCollectionByNameOrId("sync_state"); } catch (error) { return; }
  app.runInTransaction((tx) => {
    const record = state(tx);
    record.set("syncing", false);
    record.set("leaseUntil", 0);
    tx.save(record);
    for (const comment of tx.findRecordsByFilter("comments", 'status = "sending"', "", 0)) {
      comment.set("status", "uncertain");
      comment.set("replyError", "Server sempat berhenti saat mengirim. Sinkronkan untuk memeriksa hasilnya; jangan kirim ulang.");
      tx.save(comment);
    }
    if (!tx.findRecordsByFilter("admins", "", "", 1).length) {
      const email = $os.getenv("DESA_ADMIN_EMAIL");
      const password = $os.getenv("DESA_ADMIN_PASSWORD");
      if (email && password) {
        const admin = new Record(tx.findCollectionByNameOrId("admins"));
        admin.set("email", email);
        admin.setPassword(password);
        tx.save(admin);
      }
    }
  });
}

function request(cfg, method, path, body) {
  if (!/^https:\/\//.test(cfg.url) && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(cfg.url)) {
    throw new Error("invalid API URL");
  }
  return $http.send({
    url: cfg.url + path, method, timeout: 20,
    headers: { Authorization: cfg.authorization, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

function followersCount(json) {
  if (!json || typeof json !== "object") return null;
  const candidates = [json.instagram, json.Instagram, json.profile, json.account, json];
  for (const value of candidates) {
    const count = value && Number(value.followersCount);
    if (Number.isSafeInteger(count) && count >= 0) return count;
  }
  return null;
}

function syncFollowers(app, cfg) {
  const response = request(cfg, "GET", "/public/account/" + encodeURIComponent(cfg.accountId) + "/statistic");
  if (response.statusCode !== 200 || !response.json) throw new Error("followers response failed");
  const count = followersCount(response.json);
  if (count === null) throw new Error("followers value missing");
  saveSync(app, { followersCount: count, followersUpdatedAt: new Date().toISOString() });
  return count;
}

function normalize(doc, cfg) {
  if (!doc || typeof doc._id !== "string" || doc.accountId !== cfg.accountId) throw new Error("invalid source account");
  const comment = doc.comment;
  if (!comment || typeof comment.text !== "string" || !comment.text.trim() || !["pending", "resolved", "ignored"].includes(doc.status)) {
    throw new Error("invalid source comment");
  }
  const date = Date.parse(comment.createdAt || doc.createdAt);
  if (!Number.isFinite(date)) throw new Error("invalid source date");
  const content = doc.content || {};
  const owner = comment.owner || {};
  const username = typeof owner.username === "string" && owner.username.trim() ? owner.username.trim() : typeof owner.name === "string" && owner.name.trim() ? owner.name.trim() : "Warga";
  return {
    replizId: doc._id,
    accountId: cfg.accountId,
    platform: doc.account && doc.account.type || "instagram",
    externalCommentId: typeof comment.id === "string" ? comment.id : String(comment.id || ""),
    mediaId: typeof content.id === "string" ? content.id : String(content.id || ""),
    sourceUrl: /^https?:\/\//.test(content.url || "") ? content.url : "",
    name: username,
    text: comment.text,
    sourceCreatedAt: new Date(date).toISOString(),
    sourceStatus: doc.status,
  };
}

function isSafeFeatureUrl(url) {
  return /^https:\/\//.test(url) || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(?:\/|$)/.test(url);
}

function featureHttp(url, authorization, path, body, timeout) {
  if (!isSafeFeatureUrl(url)) throw new Error("invalid feature API URL");
  return $http.send({
    url: url + path,
    method: "POST",
    timeout,
    headers: { Authorization: "Bearer " + authorization, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function kaneoRequest(cfg, method, path, body) {
  if (!isSafeFeatureUrl(cfg.kaneoUrl)) throw new Error("invalid Kaneo API URL");
  return $http.send({
    url: cfg.kaneoUrl + path,
    method,
    timeout: 8,
    headers: { Authorization: "Bearer " + cfg.kaneoKey, Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

function featureEnabled(cfg) {
  return Boolean(cfg.jevKey && cfg.kaneoKey && cfg.kaneoProjectId);
}

function jevScore(cfg, record) {
  const state = "Username: " + record.getString("name") + "\nKomentar: " + record.getString("text");
  const response = featureHttp(cfg.jevUrl, cfg.jevKey, "/systemone", {
    model: cfg.jevModel,
    state,
    questions: {
      is_feature_request: {
        type: "noul",
        instructions: "Apakah komentar ini berisi permintaan fitur baru untuk game?",
      },
    },
  }, 6);
  const answer = response && response.json && response.json.answers && response.json.answers.is_feature_request;
  const score = answer && Number(answer.noul);
  if (!response || response.statusCode < 200 || response.statusCode >= 300 || !Number.isFinite(score)) {
    throw new Error("Jev response failed");
  }
  return Math.max(0, Math.min(1, score));
}

function kaneoTaskId(value) {
  if (!value || typeof value !== "object") return "";
  const candidates = [value.id, value.task && value.task.id, value.data && value.data.id, value.taskId, value.task_id];
  for (const candidate of candidates) if (typeof candidate === "string" && candidate) return candidate;
  for (const candidate of candidates) if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  return "";
}

function kaneoTask(cfg, record, score) {
  const text = record.getString("text");
  const title = "Request IG: " + text.replace(/\s+/g, " ").trim().slice(0, 68);
  const description = [
    "Username: " + record.getString("name"),
    "Komentar: " + text,
    "Link Instagram: " + (record.getString("sourceUrl") || "-"),
    "Skor Jev: " + score,
    "ID komentar: " + record.getString("externalCommentId") + " (PocketBase: " + record.id + ")",
  ].join("\n");
  const response = featureHttp(cfg.kaneoUrl, cfg.kaneoKey, "/task/" + encodeURIComponent(cfg.kaneoProjectId), {
    title,
    description,
    priority: "no-priority",
    status: "to-do",
  }, 6);
  if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("Kaneo task response failed");
  const id = kaneoTaskId(response.json);
  if (!id) throw new Error("Kaneo task id missing");
  return id;
}

function saveFeatureFields(app, id, values) {
  app.runInTransaction((tx) => {
    const record = tx.findRecordById("comments", id);
    for (const key in values) record.set(key, values[key]);
    tx.save(record);
  });
}

function processFeatureComment(app, id, evaluate) {
  const cfg = featureConfig();
  if (!featureEnabled(cfg)) return;
  let record;
  try { record = app.findRecordById("comments", id); } catch (error) { return; }
  let score;
  if (evaluate) {
    try {
      score = jevScore(cfg, record);
      saveFeatureFields(app, id, { request_score: score, is_request: score >= cfg.jevThreshold });
    } catch (error) {
      // An unavailable classifier must never block the resident queue.
      console.log("Jev feature detection belum berhasil; komentar dianggap bukan request.");
      try { saveFeatureFields(app, id, { request_score: 0, is_request: false }); } catch (saveError) { /* record may have been removed */ }
      return;
    }
  }
  try { record = app.findRecordById("comments", id); } catch (error) { return; }
  if (!record.getBool("is_request") || record.getString("kaneo_task_id")) return;
  score = record.getFloat("request_score");
  try {
    const taskId = kaneoTask(cfg, record, score);
    saveFeatureFields(app, id, { kaneo_task_id: taskId });
  } catch (error) {
    // Kaneo is retried by the next sync; importing comments remains successful.
    console.log("Kaneo task belum berhasil dibuat; akan dicoba pada sinkronisasi berikutnya.");
  }
}

function processFeatureRequests(app, newIds) {
  const cfg = featureConfig();
  if (!featureEnabled(cfg)) return;
  const ids = newIds.slice();
  // Include request records whose Kaneo call failed on an earlier sync.
  try {
    for (const record of app.findRecordsByFilter("comments", "", "", 0)) {
      if (record.getBool("is_request") && !record.getString("kaneo_task_id") && !ids.includes(record.id)) ids.push(record.id);
    }
  } catch (error) { /* New records are still evaluated below. */ }
  for (const id of ids) processFeatureComment(app, id, newIds.includes(id));
}

function taskRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["tasks", "items", "docs", "results"]) if (Array.isArray(value[key])) return value[key];
  if (Array.isArray(value.columns)) {
    const rows = [];
    for (const column of value.columns) {
      if (!column || !Array.isArray(column.tasks)) continue;
      for (const task of column.tasks) {
        if (task && typeof task === "object" && !task.status && column.slug) task.status = column.slug;
        rows.push(task);
      }
    }
    if (Array.isArray(value.archivedTasks)) for (const task of value.archivedTasks) rows.push(task);
    if (Array.isArray(value.plannedTasks)) for (const task of value.plannedTasks) rows.push(task);
    return rows;
  }
  if (value.data && typeof value.data === "object") return taskRows(value.data);
  if (value.project && typeof value.project === "object") return taskRows(value.project);
  return [];
}

function taskValue(task, keys) {
  for (const key of keys) {
    const value = task && task[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function taskUsername(task, byTaskId) {
  const direct = taskValue(task, ["username", "instagramUsername", "requesterUsername", "instagram_username"]);
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  for (const key of ["requester", "requestedBy", "createdBy", "assignee", "author"]) {
    const value = task && task[key];
    if (value && typeof value === "object") {
      const nested = taskValue(value, ["username", "instagramUsername", "name"]);
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  const description = taskValue(task, ["description", "content", "body"]);
  if (typeof description === "string") {
    const match = description.match(/(?:^|\n)\s*(?:Username|IG|Instagram)\s*:\s*@?([^\s\n]+)/i);
    if (match && match[1]) return match[1].trim();
  }
  const taskId = taskValue(task, ["id", "taskId", "task_id", "_id"]);
  return taskId && byTaskId[taskId] ? byTaskId[taskId] : "";
}

function builds(app) {
  const cfg = featureConfig();
  if (!$os.getenv("KANEO_API_URL") || !cfg.kaneoKey || !cfg.kaneoProjectId) return { builds: [] };
  const now = Date.now();
  if (buildsCache.expiresAt > now) return { builds: buildsCache.items };
  try {
    const path = "/task/tasks/" + encodeURIComponent(cfg.kaneoProjectId);
    const rows = [];
    let page = 1;
    for (;;) {
      let response = kaneoRequest(cfg, "GET", path + (page === 1 ? "" : "?page=" + page + "&limit=100"));
      // Older Kaneo deployments exposed the create route as a GET board endpoint.
      if (page === 1 && response && response.statusCode === 404) response = kaneoRequest(cfg, "GET", "/task/" + encodeURIComponent(cfg.kaneoProjectId));
      if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("Kaneo task list failed");
      const pageRows = taskRows(response.json);
      for (const task of pageRows) rows.push(task);
      const pagination = response.json && response.json.pagination;
      const totalPages = pagination && Number(pagination.totalPages);
      if (!Number.isSafeInteger(totalPages) || page >= totalPages) break;
      page++;
    }
    const byTaskId = {};
    try {
      for (const record of app.findRecordsByFilter("comments", "", "", 0)) {
        const taskId = record.getString("kaneo_task_id");
        const username = record.getString("name");
        if (taskId && username) byTaskId[taskId] = username;
      }
    } catch (error) { /* A missing comments collection should not break the public map. */ }
    const items = [];
    for (let index = 0; index < rows.length; index++) {
      const task = rows[index];
      if (!task || typeof task !== "object") continue;
      const rawId = taskValue(task, ["id", "taskId", "task_id", "_id"]);
      if (rawId === "") continue;
      const number = taskValue(task, ["number", "taskNumber", "no", "key", "position"]);
      const item = {
        id: String(rawId),
        number: number === "" ? index + 1 : number,
        title: String(taskValue(task, ["title", "name", "subject"])),
        status: String(taskValue(task, ["status", "state"]) || "to-do"),
      };
      const username = taskUsername(task, byTaskId);
      if (username) item.username = username;
      items.push(item);
    }
    buildsCache = { expiresAt: now + BUILDS_CACHE_MS, items };
    return { builds: items };
  } catch (error) {
    // The construction area is optional; Kaneo outages must never break the village.
    buildsCache = { expiresAt: now + BUILDS_CACHE_MS, items: [] };
    return { builds: [] };
  }
}

function sync(app) {
  const cfg = config();
  if (!/^Basic [A-Za-z0-9+/]+=*$/.test(cfg.authorization)) throw new ApiError(503, "Kredensial Repliz belum dikonfigurasi di server.");
  app.runInTransaction((tx) => {
    const record = state(tx);
    if (record.getBool("syncing") && record.getFloat("leaseUntil") > Date.now()) throw new ApiError(409, "Sinkronisasi masih berjalan.");
    record.set("syncing", true);
    record.set("leaseUntil", Date.now() + 120000);
    tx.save(record);
  });
  let imported = 0;
  let updated = 0;
  const newCommentIds = [];
  try {
    const docs = {};
    let page = 1;
    for (;;) {
      const response = request(cfg, "GET", "/public/comment?page=" + page + "&limit=100&accountIds%5B%5D=" + encodeURIComponent(cfg.accountId));
      if (response.statusCode !== 200 || !response.json || !Array.isArray(response.json.docs)) throw new Error("source response failed");
      for (const doc of response.json.docs) {
        const value = normalize(doc, cfg);
        if (docs[value.replizId] && docs[value.replizId].sourceStatus !== value.sourceStatus) throw new Error("source changed during scan");
        docs[value.replizId] = value;
      }
      saveSync(app, { leaseUntil: Date.now() + 120000 });
      if (response.json.hasNextPage === false) break;
      if (response.json.hasNextPage !== true || !Number.isInteger(response.json.nextPage) || response.json.nextPage <= page) throw new Error("invalid pagination");
      page = response.json.nextPage;
    }
    // Followers are presentation data; a provider statistic failure must not block comment sync.
    try { syncFollowers(app, cfg); } catch (error) { console.log("Repliz followers belum berhasil disinkronkan."); }
    const values = Object.keys(docs).map((id) => docs[id]).sort((a, b) => a.sourceCreatedAt.localeCompare(b.sourceCreatedAt) || a.replizId.localeCompare(b.replizId));
    app.runInTransaction((tx) => {
      const latest = tx.findRecordsByFilter("comments", "", "-queueOrder", 1);
      let order = latest.length ? latest[0].getInt("queueOrder") : 0;
      const collection = tx.findCollectionByNameOrId("comments");
      for (const value of values) {
        const found = tx.findRecordsByFilter("comments", "replizId = {:id}", "", 1, 0, { id: value.replizId });
        const record = found.length ? found[0] : new Record(collection);
        const previous = record.getString("status");
        const previousSource = record.getString("sourceStatus");
        for (const key in value) if (key !== "sourceStatus") record.set(key, value[key]);
        const isNew = !found.length;
        if (isNew) {
          record.set("queueOrder", ++order);
          record.set("status", value.sourceStatus === "resolved" ? "answered" : value.sourceStatus === "ignored" ? "ignored" : "pending");
          imported++;
        } else updated++;
        // A stale pending page cannot reopen a completed or in-flight reply.
        record.set("sourceStatus", value.sourceStatus === "pending" && previousSource && previousSource !== "pending" ? previousSource : value.sourceStatus);
        if (value.sourceStatus !== "pending") {
          // A provider-side terminal update must not overwrite a confirmed local answer.
          if (!(previous === "answered" && record.getString("externalReplyId"))) {
            record.set("status", value.sourceStatus === "resolved" ? "answered" : "ignored");
          }
          record.set("replyError", "");
          if (!record.getString("externalReplyId")) record.set("reply", "");
        } else if (["sending", "uncertain", "answered", "ignored"].includes(previous)) record.set("status", previous);
        tx.save(record);
        if (isNew) newCommentIds.push(record.id);
      }
    });
    processFeatureRequests(app, newCommentIds);
    saveSync(app, { syncing: false, leaseUntil: 0, lastSync: new Date().toISOString(), error: "" });
    return Object.assign({ imported, updated }, status(app));
  } catch (error) {
    saveSync(app, { syncing: false, leaseUntil: 0, error: "Sinkronisasi Repliz gagal. Antrean sebelumnya tetap tersimpan; coba sinkronkan lagi." });
    throw new ApiError(502, "Sinkronisasi Repliz gagal. Antrean sebelumnya tetap tersimpan.");
  }
}

function reply(app, id, text) {
  if (typeof text !== "string" || !text.trim() || text.trim().length > 500) throw new ApiError(400, "Balasan wajib diisi, maksimal 500 karakter.");
  text = text.trim();
  const cfg = config();
  if (!/^Basic [A-Za-z0-9+/]+=*$/.test(cfg.authorization)) throw new ApiError(503, "Kredensial Repliz belum dikonfigurasi di server.");
  let replizId;
  app.runInTransaction((tx) => {
    const record = tx.findRecordById("comments", id);
    const head = tx.findRecordsByFilter("comments", ACTIVE, "queueOrder", 1);
    if (!head.length || head[0].id !== id || record.getString("status") !== "pending") throw new ApiError(409, "Hanya warga terdepan yang belum diproses bisa dibalas. Sinkronkan jika hasil pengiriman belum pasti.");
    if (record.getString("accountId") !== cfg.accountId) throw new ApiError(409, "Komentar bukan dari akun sumber yang aktif.");
    replizId = record.getString("replizId");
    record.set("status", "sending");
    record.set("reply", text);
    record.set("replyError", "");
    tx.save(record);
  });
  let response;
  try { response = request(cfg, "POST", "/public/comment/" + encodeURIComponent(replizId), { text }); }
  catch (error) { response = null; }
  const success = response && response.statusCode >= 200 && response.statusCode < 300 && response.json && typeof response.json.commentId === "string" && response.json.commentId;
  const rejected = response && response.statusCode >= 400 && response.statusCode < 500 && ![408, 409, 425, 429].includes(response.statusCode);
  app.runInTransaction((tx) => {
    const record = tx.findRecordById("comments", id);
    if (success) {
      record.set("status", "answered");
      record.set("sourceStatus", "resolved");
      record.set("reply", text);
      record.set("externalReplyId", response.json.commentId);
      record.set("repliedAt", new Date().toISOString());
      record.set("replyError", "");
    } else if (!["answered", "ignored"].includes(record.getString("status"))) {
      record.set("status", rejected ? "pending" : "uncertain");
      record.set("replyError", rejected ? "Repliz menolak balasan. Periksa koneksi akun atau isi balasan sebelum mencoba lagi." : "Hasil pengiriman belum pasti. Sinkronkan untuk memeriksa; balasan tidak dikirim ulang otomatis.");
    }
    tx.save(record);
  });
  const record = app.findRecordById("comments", id);
  if (!success && record.getString("status") !== "answered" && record.getString("status") !== "ignored") throw new ApiError(rejected ? 422 : 503, record.getString("replyError"));
  return record;
}

module.exports = { bootstrap, status, sync, reply, builds };
