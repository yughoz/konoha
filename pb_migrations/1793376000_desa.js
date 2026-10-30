migrate((app) => {
  const admins = new Collection({
    name: "admins", type: "auth",
    listRule: null, viewRule: "id = @request.auth.id",
    createRule: null, updateRule: null, deleteRule: null,
    passwordAuth: { enabled: true, identityFields: ["email"] },
  });
  app.save(admins);
  const email = $os.getenv("DESA_ADMIN_EMAIL");
  const password = $os.getenv("DESA_ADMIN_PASSWORD");
  if (email && password) {
    const admin = new Record(admins);
    admin.set("email", email);
    admin.setPassword(password);
    app.save(admin);
  }

  const comments = new Collection({
    name: "comments", type: "base",
    listRule: "", viewRule: "",
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "replizId", type: "text", required: true, max: 255 },
      { name: "accountId", type: "text", required: true, max: 255 },
      { name: "platform", type: "text", max: 100 },
      { name: "externalCommentId", type: "text", max: 255 },
      { name: "mediaId", type: "text", max: 255 },
      { name: "sourceUrl", type: "url" },
      { name: "name", type: "text", required: true, max: 500 },
      { name: "text", type: "text", required: true, max: 1000000 },
      { name: "sourceCreatedAt", type: "date", required: true },
      { name: "queueOrder", type: "number", required: true, min: 1, onlyInt: true },
      { name: "sourceStatus", type: "select", required: true, maxSelect: 1, values: ["pending", "resolved", "ignored"] },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "sending", "uncertain", "answered", "ignored"] },
      { name: "reply", type: "text", max: 500 },
      { name: "replyError", type: "text", max: 500 },
      { name: "externalReplyId", type: "text", max: 255 },
      { name: "repliedAt", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_comments_repliz_id ON comments (replizId)",
      "CREATE UNIQUE INDEX idx_comments_queue_order ON comments (queueOrder)",
      "CREATE INDEX idx_comments_queue ON comments (status, queueOrder)",
    ],
  });
  app.save(comments);

  const state = new Collection({
    name: "sync_state", type: "base",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "syncing", type: "bool" },
      { name: "leaseUntil", type: "number" },
      { name: "lastSync", type: "date" },
      { name: "error", type: "text", max: 500 },
    ],
  });
  app.save(state);
  const record = new Record(state);
  record.id = "desasync0000001";
  app.save(record);
}, (app) => {
  for (const name of ["sync_state", "comments", "admins"]) app.delete(app.findCollectionByNameOrId(name));
});
