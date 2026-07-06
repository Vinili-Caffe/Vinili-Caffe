import fs from "fs";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const SKIP_JS_OBFUSCATION = new Set(["jquery-2.1.3.min.js", "pace.min.js", "modernizr.js", "plugins.js", "vc-suppress-extension-errors.js", "vc-youtube-iframe-api.js", "seratafilm-access-gate.js", "seratafilm-countdown.js", "seratafilm-event-utils.js", "discord-auth.js", "site-maintenance.js", "roles-page.js"]);
const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  log: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: [],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.6,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: "variable",
  unicodeEscapeSequence: false,
  target: "browser",
};

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  keepClosingSlash: true,
  minifyCSS: false,
  minifyJS: false,
};

function walkFilesRecursive(dir, test, out) {
  const acc = out || [];
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFilesRecursive(p, test, acc);
    else if (test(ent.name, p)) acc.push(p);
  }
  return acc;
}

async function mapWithConcurrency(items, concurrency, fn) {
  if (!items.length) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}

function createObfuscatorPool(size) {
  const workerUrl = new URL("./obfuscate-pool-worker.mjs", import.meta.url);
  const workers = [];
  const waiters = [];
  let readyCount = 0;
  let closed = false;
  function dispatch() {
    while (waiters.length && workers.some((w) => w.ready && !w.busy)) {
      const slot = workers.find((w) => w.ready && !w.busy);
      const job = waiters.shift();
      if (!slot || !job) break;
      slot.busy = true;
      slot.worker.postMessage({ type: "file", file: job.file });
      slot.job = job;
    }
  }
  return new Promise((resolve, reject) => {
    const bootTimeout = setTimeout(() => reject(new Error("obfuscator pool boot timeout")), 120_000);
    for (let i = 0; i < size; i += 1) {
      const slot = { worker: null, ready: false, busy: false, job: null };
      const worker = new Worker(workerUrl);
      slot.worker = worker;
      worker.on("message", (msg) => {
        if (msg?.type === "ready") {
          slot.ready = true;
          readyCount += 1;
          if (readyCount === size) {
            clearTimeout(bootTimeout);
            resolve({
              run(file) {
                return new Promise((res, rej) => {
                  if (closed) {
                    rej(new Error("obfuscator pool closed"));
                    return;
                  }
                  waiters.push({ file, resolve: res, reject: rej });
                  dispatch();
                });
              },
              async close() {
                closed = true;
                await Promise.all(workers.map((s) => {
                  s.worker.postMessage({ type: "stop" });
                  return s.worker.terminate().catch(() => {});
                }));
              },
            });
          }
          dispatch();
          return;
        }
        if (msg?.type === "done") {
          slot.busy = false;
          const job = slot.job;
          slot.job = null;
          job?.resolve();
          dispatch();
          return;
        }
        if (msg?.type === "error") {
          slot.busy = false;
          const job = slot.job;
          slot.job = null;
          job?.reject(new Error(msg.message || "obfuscator worker error"));
          dispatch();
        }
      });
      worker.on("error", (err) => {
        clearTimeout(bootTimeout);
        reject(err);
      });
      worker.postMessage({ type: "init", options: OBF_OPTIONS });
      workers.push(slot);
    }
  });
}

export async function obfuscateProjectJsInDist(distRoot) {
  try {
    require("javascript-obfuscator");
  } catch {
    console.warn("[build-site] javascript-obfuscator non installato: salto offuscamento JS.");
    return;
  }
  const jsDir = path.join(distRoot, "js");
  const files = walkFilesRecursive(
    jsDir,
    (name) => name.endsWith(".js") && !SKIP_JS_OBFUSCATION.has(name),
    [],
  );
  if (!files.length) return;
  const started = Date.now();
  const workers = Math.min(8, Math.max(4, os.cpus()?.length || 4));
  const pool = await createObfuscatorPool(workers);
  try {
    await Promise.all(files.map((file) => pool.run(file)));
  } finally {
    await pool.close();
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[build-site] Offuscamento JS: ${files.length} file in dist/js (${sec}s, ${workers} worker)`);
}


export async function minifyHtmlFilesInDist(distRoot) {
  let minify;
  try {
    ({ minify } = await import("html-minifier-terser"));
  } catch {
    console.warn("[build-site] html-minifier-terser non installato: salto minify HTML.");
    return;
  }
  if (typeof minify !== "function") {
    console.warn("[build-site] minify HTML non disponibile (API modulo).");
    return;
  }
  const htmlFiles = walkFilesRecursive(
    distRoot,
    (name, p) => name.endsWith(".html") && !p.includes(`${path.sep}node_modules${path.sep}`),
  );
  let n = 0;
  await mapWithConcurrency(htmlFiles, 4, async (file) => {
    const raw = fs.readFileSync(file, "utf8");
    const next = await minify(raw, HTML_MINIFY_OPTIONS);
    if (next && next !== raw) {
      fs.writeFileSync(file, next, "utf8");
      n += 1;
    }
  });
  if (n) console.log("[build-site] Minify HTML:", n, "file in dist");
}