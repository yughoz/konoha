const STATE_ID = "desasync0000001";
const ACTIVE = 'status = "pending" || status = "sending" || status = "uncertain"';

function config() {
  return {
    accountId: $os.getenv("REPLIZ_ACCOUNT_ID") || "6a88116362caae1e04010787",
    authorization: $os.getenv("REPLIZ_AUTHORIZATION"),
    url: ($os.getenv("REPLIZ_API_URL") || "https://api.repliz.com").replace(/\/+$/, ""),
  };
}

function state(app) { return app.findRecordById("sync_state", STATE_ID); }

function status(app) {
  const record = state(app);
  const result = {
    configured: /^Basic [A-Za-z0-9+/]+=*$/.test(config().authorization),
    lastSync: record.getString("lastSync"),
    syncing: record.getBool("syncing") && record.getFloat("leaseUntil") > Date.now(),
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

function normalize(doc, cfg) {
  if (!doc || typeof doc._id !== "string" || doc.accountId !== cfg.accountId) throw new Error("invalid source account");
  const comment = doc.comment;
  if (!comment || typeof comment.text !== "string" || !comment.text.trim() || !["pending", "resolved", "ignored"].includes(doc.status)) {
    throw new Error("invalid source comment");
  }
  const date = Date.parse(comment.createdAt || doc.createdAt);
  if (!Number.isFinite(date)) throw new Error("invalid source date");
  const content = doc.content || {};
  return {
    replizId: doc._id,
    accountId: cfg.accountId,
    platform: doc.account && doc.account.type || "instagram",
    externalCommentId: typeof comment.id === "string" ? comment.id : String(comment.id || ""),
    mediaId: typeof content.id === "string" ? content.id : String(content.id || ""),
    sourceUrl: /^https?:\/\//.test(content.url || "") ? content.url : "",
    name: comment.owner && comment.owner.name || "Warga",
    text: comment.text,
    sourceCreatedAt: new Date(date).toISOString(),
    sourceStatus: doc.status,
  };
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
        if (!found.length) {
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
      }
      const record = state(tx);
      record.set("syncing", false);
      record.set("leaseUntil", 0);
      record.set("lastSync", new Date().toISOString());
      record.set("error", "");
      tx.save(record);
    });
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

module.exports = { bootstrap, status, sync, reply };
