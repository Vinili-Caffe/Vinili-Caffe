/** Rotte HTTP della Bacheca del sito (/webhooks/site-bacheca…). */
function mountBachecaRoutes(app?, client?) {
  const api = () => require("./bachecaApi") as typeof import("./bachecaApi");
  app.get("/webhooks/site-bacheca", (req?, res?) => api().handleBachecaList(client, req, res));
  app.get("/webhooks/site-bacheca/item", (req?, res?) => api().handleBachecaItem(client, req, res));
  app.get("/webhooks/site-bacheca/random", (req?, res?) => api().handleBachecaRandom(client, req, res));
  app.post("/webhooks/site-bacheca/react", (req?, res?) => api().handleBachecaReact(client, req, res));
  app.delete("/webhooks/site-bacheca", (req?, res?) => api().handleBachecaDelete(client, req, res));
}

export = { mountBachecaRoutes };
