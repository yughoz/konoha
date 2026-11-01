migrate((app) => {
  const state = app.findCollectionByNameOrId("sync_state");
  state.fields.add(new Field({ name: "followersCount", type: "number", min: 0, onlyInt: true }));
  state.fields.add(new Field({ name: "followersUpdatedAt", type: "date" }));
  app.save(state);
}, (app) => {
  const state = app.findCollectionByNameOrId("sync_state");
  state.fields.removeByName("followersUpdatedAt");
  state.fields.removeByName("followersCount");
  app.save(state);
});
