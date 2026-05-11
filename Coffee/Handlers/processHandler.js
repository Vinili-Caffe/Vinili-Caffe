module.exports = function installProcessHandlers() {
  if (process.__viniliTestProcessHandlersInstalled) return;
  process.__viniliTestProcessHandlersInstalled = true;

  process.on("SIGINT", () => {
    global.logger?.error?.("[PROCESS] SIGINT: Exiting...");
    process.exit();
  });

  process.on("uncaughtException", (err) => {
    global.logger?.error?.("[PROCESS] UNCAUGHT EXCEPTION: " + (err?.stack || err));
  });

  process.on("SIGTERM", () => {
    global.logger?.error?.("[PROCESS] SIGTERM: Exiting...");
    process.exit();
  });

  process.on("unhandledRejection", (err) => {
    global.logger?.error?.("[PROCESS] UNHANDLED REJECTION: " + (err?.stack || err));
  });

  process.on("warning", () => {});

  global.logger?.info?.("[PROCESS] Process handlers loaded.");
};