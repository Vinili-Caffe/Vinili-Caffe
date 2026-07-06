import fs from "fs";
import { createRequire } from "module";
import { parentPort } from "worker_threads";
const require = createRequire(import.meta.url);
const JavaScriptObfuscator = require("javascript-obfuscator");
let options = {};
parentPort.on("message", (msg) => {
  if (!msg || msg.type === "stop") {
    process.exit(0);
  }
  if (msg.type === "init") {
    options = msg.options || {};
    parentPort.postMessage({ type: "ready" });
    return;
  }
  if (msg.type !== "file" || !msg.file) return;
  try {
    const src = fs.readFileSync(msg.file, "utf8");
    const out = JavaScriptObfuscator.obfuscate(src, options).getObfuscatedCode();
    fs.writeFileSync(msg.file, out, "utf8");
    parentPort.postMessage({ type: "done", file: msg.file });
  } catch (err) {
    parentPort.postMessage({ type: "error", file: msg.file, message: String(err?.message || err) });
  }
});