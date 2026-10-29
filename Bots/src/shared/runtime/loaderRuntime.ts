const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("./fsRuntime") as typeof import("./fsRuntime");
const READY_EVENT_ALIAS = "clientReady";

function normalizeLifecycleEventName(eventName?) {
  return eventName === "ready" ? READY_EVENT_ALIAS : eventName;
}

function clearBoundHandlers(client?, mapKey?) {
  if (!client?.[mapKey]?.size) return;
  for (const [eventName, handlers] of client[mapKey].entries()) {
    for (const handler of handlers) client.removeListener(eventName, handler);
  }
  client[mapKey].clear();
}

function trackBoundHandler(client?, mapKey?, eventName?, handler?) {
  if (!client[mapKey].has(eventName)) client[mapKey].set(eventName, []);
  client[mapKey].get(eventName).push(handler);
}

function listRelativeJsFiles(rootDir?) {
  if (!fs.existsSync(rootDir)) return [];
  return listJsFilesRecursive(rootDir).map((fullPath?) => path.relative(rootDir, fullPath).replace(/\\/g, "/"));
}

export = { READY_EVENT_ALIAS, clearBoundHandlers, listRelativeJsFiles, normalizeLifecycleEventName, trackBoundHandler };