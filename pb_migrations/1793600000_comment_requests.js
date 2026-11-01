migrate((app) => {
  const comments = app.findCollectionByNameOrId("comments");
  comments.fields.add(new Field({ name: "request_score", type: "number", min: 0, max: 1 }));
  comments.fields.add(new Field({ name: "is_request", type: "bool" }));
  comments.fields.add(new Field({ name: "kaneo_task_id", type: "text", max: 255 }));
  app.save(comments);
}, (app) => {
  const comments = app.findCollectionByNameOrId("comments");
  comments.fields.removeByName("kaneo_task_id");
  comments.fields.removeByName("is_request");
  comments.fields.removeByName("request_score");
  app.save(comments);
});
