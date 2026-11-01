onBootstrap((e) => {
  e.next();
  require(`${__hooks}/desa.js`).bootstrap(e.app);
});

routerAdd("GET", "/api/desa/status", (e) => e.json(200, require(`${__hooks}/desa.js`).status(e.app)));
routerAdd("GET", "/api/desa/builds", (e) => e.json(200, require(`${__hooks}/desa.js`).builds(e.app)));

routerAdd("POST", "/api/desa/sync", (e) => {
  return e.json(200, require(`${__hooks}/desa.js`).sync(e.app));
}, $apis.requireAuth("admins"));

routerAdd("POST", "/api/desa/comments/{id}/reply", (e) => {
  const data = e.requestInfo().body || {};
  return e.json(200, { comment: require(`${__hooks}/desa.js`).reply(e.app, e.request.pathValue("id"), data.text) });
}, $apis.requireAuth("admins"), $apis.bodyLimit(4096));

cronAdd("repliz-sync", "* * * * *", () => {
  try { require(`${__hooks}/desa.js`).sync($app); }
  catch (error) { if (error.status !== 409) console.log("Repliz sync belum berhasil; lihat /api/desa/status."); }
});
