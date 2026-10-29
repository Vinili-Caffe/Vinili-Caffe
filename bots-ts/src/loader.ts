/*!
 * Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
 * Uso, copia, modifica e distribuzione vietati senza autorizzazione scritta.
 * SPDX-License-Identifier: LicenseRef-Proprietary-ViniliCaffe — vedi LICENSE.
 */
const child_process = require('child_process') as typeof import("child_process");
const fs = require('fs') as typeof import("fs");
const path = require('path') as typeof import("path");
const os = require('os') as typeof import("os");
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true, override: true });
const baseDir = __dirname;
const ENABLE_LOADER_GIT_PULL =
  ["1", "true", "yes", "on"].includes(String(process.env.ENABLE_LOADER_GIT_PULL || "").trim().toLowerCase());
const ENABLE_LOADER_NPM_INSTALL =
  ["1", "true", "yes", "on"].includes(String(process.env.ENABLE_LOADER_NPM_INSTALL || "").trim().toLowerCase());
const ALL_BOTS=[{key:'vinyls',label:'Vinyls',folderSuffix:'Vinyls',startupDelayMs:0},{key:'Coffee',label:'Coffee',folderSuffix:'Coffee',startupDelayMs:0}];
/** perfP0: LOADER_BOTS=vinyls|coffee|all — permette PM2 split heap. */
function resolveBotsToStart() {
    const raw = String(process.env.LOADER_BOTS || process.env.BOTS_ONLY || 'all').trim().toLowerCase();
    if (!raw || raw === 'all' || raw === '*') return ALL_BOTS;
    const wanted = new Set(raw.split(/[,+\s]+/).map((s?) => s.trim()).filter(Boolean));
    const picked = ALL_BOTS.filter((b?) =>
        wanted.has(String(b.key).toLowerCase()) ||
        wanted.has(String(b.label).toLowerCase()) ||
        wanted.has(String(b.folderSuffix).toLowerCase())
    );
    return picked.length ? picked : ALL_BOTS;
}
const BOTS = resolveBotsToStart();
const NPM_CACHE_DIR = path.join(os.tmpdir(), '.npm-global');
const processRefs: Record<string, any> = {};
const npmInstallInProgressByDir: Record<string, any> = {};
const startupTimers: Record<string, any> = {};
const silencedEnv=process.env.SHOW_NODE_WARNINGS==='1'?{...process.env}:{...process.env,NODE_NO_WARNINGS:'1'};
const WORKSPACES_ENABLED = hasWorkspacesConfig();
let shuttingDown = false;
let requestedExitCode = 0;
let syncStarted = false;

function normalizeComparableName(value?) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function resolveBotWorkingDir(bot?) {
    const suffix = String(bot?.folderSuffix || '').trim();
    const suffixNorm = normalizeComparableName(suffix);

    const directPath = path.join(baseDir, suffix);
    if (fs.existsSync(path.join(directPath, 'index.js'))) {
        return directPath;
    }
    const exactCandidates=[`Vinili & CaffÃƒÂ¨ ${bot.folderSuffix}`,`Vinili & Caffe ${bot.folderSuffix}`,`Vinili & CaffÃƒÆ’Ã‚Â¨ ${bot.folderSuffix}`,`Vinili & CaffÃ¯Â¿Â½ ${bot.folderSuffix}`];

    for (const folderName of exactCandidates) {
        const fullPath = path.join(baseDir, folderName);
        if (fs.existsSync(path.join(fullPath, 'index.js'))) {
            return fullPath;
        }
    }

    const entries=fs.readdirSync(baseDir,{withFileTypes:true}).filter((entry?)=>entry.isDirectory()).map((entry?)=>entry.name);
    const match=entries.find((name?)=>{const normalized=normalizeComparableName(name);return normalized===suffixNorm||(normalized.includes('vinili')&&normalized.includes('caff')&&normalized.includes(suffixNorm));});
    if (!match) {
        throw new Error(`Bot directory not found for ${bot.label} (expected folder like "${suffix}")`);
    }
    return path.join(baseDir, match);
}

function splitStartPath(bot?) {
    const workingDir = resolveBotWorkingDir(bot);
    const shardingFlag = String(process.env.ENABLE_SHARDING || process.env.SHARDING || '').trim().toLowerCase();
    const shardingEnabled = ['1', 'true', 'yes', 'on'].includes(shardingFlag);
    /* perfP1: sharding solo se esplicitamente on + file presente (default off = 1 guild) */
    const shardEntry = path.join(workingDir, 'run-sharded.js');
    const useSharded = shardingEnabled && fs.existsSync(shardEntry);
    console.log(
        `[Loader] ${bot.label} ENABLE_SHARDING=${String(process.env.ENABLE_SHARDING || process.env.SHARDING || '')} -> ${useSharded ? 'run-sharded.js' : 'index.js'}`
    );
    return {
        workingDir,
        file: useSharded ? 'run-sharded.js' : 'index.js'
    };
}
function resolveNodeExecutable() {
    const fromEnv = String(process.env.NODE_BINARY || '').trim();
    if (fromEnv && fs.existsSync(fromEnv)) {
        return fromEnv;
    }

    const fromExecPath = String(process.execPath || '').trim();
    if (fromExecPath && fs.existsSync(fromExecPath)) {
        return fromExecPath;
    }

    const tmpDir = path.join(os.tmpdir(), '');
    try {
        const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
        const candidates=entries.filter((entry?)=>entry.isDirectory()&&/^node-v\d+\.\d+\.\d+/.test(entry.name)).map((entry?)=>({name:entry.name,fullPath:path.join(tmpDir,entry.name,'bin','node')})).filter((entry?)=>fs.existsSync(entry.fullPath)).sort((a?,b?)=>b.name.localeCompare(a.name,undefined,{numeric:true}));
        if (candidates.length > 0) {
            return candidates[0].fullPath;
        }
    } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }

    return 'node';
}

function runSyncFromServerIfConfigured() {
    const syncServer = process.env.SYNC_SERVER || '';
    if (!syncServer.trim() || syncStarted) return;
    const scriptPath = path.join(baseDir, 'scripts', 'sync-from-server.js');
    if (!fs.existsSync(scriptPath)) return;
    syncStarted = true;
    try {
        console.log('[Loader] Sync da server in background...');
        const child = child_process.spawn(process.execPath, [scriptPath], {
            cwd: baseDir,
            stdio: 'inherit',
            env: process.env,
            shell: false,
        });
        child.on('error', (err?) => {
            console.warn('[Loader] Sync da server fallito:', err?.message || err);
        });
        child.on('exit', (code?) => {
            if (code && code !== 0) {
                console.warn(`[Loader] Sync da server terminato con code ${code}`);
            }
        });
    } catch (err) {
        console.warn('[Loader] Sync da server fallito:', err?.message || err);
    }
}

function pidFile(botKey?) {
    return path.resolve(baseDir, `.shard_${botKey}.pid`);
}

function readPidFile(botKey?) {
    const file = pidFile(botKey);
    if (!fs.existsSync(file)) return null;

    try {
        const pid = Number(fs.readFileSync(file, 'utf8').trim());
        return Number.isNaN(pid) ? null : pid;
    } catch {
        return null;
    }
}

function isPidRunning(pid?) {
    if (!pid || Number.isNaN(pid)) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function runNpmInstall(installDir?, extraArgs = []) {
    return new Promise((resolveInstall?) => {
        const args=['install','--legacy-peer-deps','--loglevel','error','--no-audit','--no-fund','--no-bin-links','--prefer-offline','--cache',NPM_CACHE_DIR,'--update-notifier','false',...extraArgs];

        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const npm=child_process.spawn(npmCmd,args,{cwd:installDir,stdio:'inherit',env:silencedEnv});

        npm.on('exit', (code?) => resolveInstall(code || 0));
    });
}

function killPidTree(pid?) {
    if (!pid || Number.isNaN(pid)) return;
    try {
        if (process.platform === 'win32') {
            child_process.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
            return;
        }
        process.kill(pid, 'SIGTERM');
    } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }
}

function clearStartupTimer(botKey?) {
    const timer = startupTimers[botKey];
    if (!timer) return;
    clearTimeout(timer);
    delete startupTimers[botKey];
}

function clearAllStartupTimers() {
    for (const bot of BOTS) {
        clearStartupTimer(bot.key);
    }
}

function activeChildCount() {
    return Object.values(processRefs).filter((proc?) => proc && proc.pid && isPidRunning(proc.pid)).length;
}

function finalizeShutdownIfIdle() {
    if (!shuttingDown) return;
    if (activeChildCount() > 0) return;
    if (Object.keys(startupTimers).length > 0) return;
    process.exit(requestedExitCode);
}

function requestShutdown(exitCode = 0, reason = "") {
    requestedExitCode = Math.max(requestedExitCode, Number(exitCode) || 0);
    if (shuttingDown) {
        finalizeShutdownIfIdle();
        return;
    }

    shuttingDown = true;
    clearAllStartupTimers();
    if (reason) {
        console.log(`[Loader] Arresto coordinato: ${reason}`);
    }

    for (const proc of Object.values(processRefs)) {
        if (proc?.pid) killPidTree(proc.pid);
    }

    setTimeout(finalizeShutdownIfIdle, 1500);
}

function cleanupStalePid(botKey?) {
    const file = pidFile(botKey);
    if (!fs.existsSync(file)) return;

    const pid = readPidFile(botKey);

    if (processRefs[botKey] && pid && processRefs[botKey].pid === pid) return;
    if (pid && !Number.isNaN(pid)) killPidTree(pid);
    try { fs.unlinkSync(file); } catch (err) {
      console.warn("[Loader]", err?.message || err);
    }
  }

function writePid(botKey?, pid?) {
    try {
        fs.writeFileSync(pidFile(botKey), String(pid), 'utf8');
    } catch (err) {
        console.log('[Loader] Could not write PID file:', err?.message || err);
    }
}

function hasWorkspacesConfig() {
    const rootPackageJson = path.join(baseDir, 'package.json');
    if (!fs.existsSync(rootPackageJson)) return false;

    try {
        const pkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf8'));
        return Array.isArray(pkg?.workspaces) && pkg.workspaces.length > 0;
    } catch {
        return false;
    }
}

function needNpmInstall(workingDir?, useWorkspaces = false) {
    const installDir = useWorkspaces ? baseDir : workingDir;
    const nodeModules = path.join(installDir, 'node_modules');
    const packageJson = path.join(installDir, 'package.json');
    const packageLock = path.join(installDir, 'package-lock.json');

    try {
        if (!fs.existsSync(nodeModules)) return true;
        if (!fs.existsSync(packageJson)) return false;

        const pkgMtime = fs.statSync(packageJson).mtimeMs;
        const lockMtime = fs.existsSync(packageLock) ? fs.statSync(packageLock).mtimeMs : 0;
        const nmMtime = fs.statSync(nodeModules).mtimeMs;
        return Math.max(pkgMtime, lockMtime) > nmMtime;
    } catch {
        return true;
    }
}

function updateRepo(repoRoot?) {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) return;

    try {
        console.log(`[Loader] Pulling latest changes in ${repoRoot}`);
        const branch = process.env.GIT_BRANCH || 'main';
        child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
        child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    } catch (err) {
        console.log(`[Loader] Git pull failed: ${err?.message || err}`);
    }
}

function ensureDependencies(workingDir?, useWorkspaces?) {
    if (!needNpmInstall(workingDir, useWorkspaces)) return Promise.resolve();

    const installDir = useWorkspaces ? baseDir : workingDir;
    const key = path.resolve(installDir);
    if (!npmInstallInProgressByDir[key]) {
        npmInstallInProgressByDir[key] = new Promise((resolveInstall?) => {
            console.log(`[Loader] npm install in ${installDir}`);
            runNpmInstall(installDir).then((code?) => {
                if (code === 0) {
                    ((resolveInstall as any)() as any);
                    return;
                }

                console.log(`[Loader] npm install fallito (code ${code}), retry con --force...`);
                runNpmInstall(installDir, ['--force']).then((retryCode?) => {
                    if (retryCode !== 0) {
                        console.log(`[Loader] npm install fallito anche con --force (code ${retryCode}), avvio bot comunque.`);
                    }
                    ((resolveInstall as any)() as any);
                });
            });
        }).finally(() => {
            delete npmInstallInProgressByDir[key];
        });
    }
    return npmInstallInProgressByDir[key];
}

function buildNodePath(workingDir?) {
    const parts = [
        path.join(workingDir, 'node_modules'),
        path.join(baseDir, 'node_modules'),
    ].filter((dir?) => fs.existsSync(dir));
    const existing = String(process.env.NODE_PATH || '').trim();
    if (existing) parts.push(existing);
    return parts.join(path.delimiter);
}

function spawnBotProcess(bot?, workingDir?, file?, resolve?) {
    if (shuttingDown) {
        resolve();
        return;
    }

    console.log(`[Loader] Avvio ${bot.label}: ${bot.folderSuffix} (${file})`);

    const nodeBin = resolveNodeExecutable();
    const scriptPath = path.resolve(workingDir, file);
    const shardEnv = file === 'run-sharded.js' ? { ENABLE_SHARDING: '1' } : {};
    const nodePath = buildNodePath(workingDir);
    if (nodePath) {
        console.log(`[Loader] ${bot.label} NODE_PATH=${nodePath}`);
    }
    console.log(`[Loader] Runtime ${bot.label}: ${nodeBin} (loader execPath: ${process.execPath})`);
    const nodeArgs = process.env.SHOW_NODE_WARNINGS === '1' ? [scriptPath] : ['--disable-warning=ExperimentalWarning', scriptPath];
    const spawnEnv: Record<string, any> = { ...silencedEnv, RUN_UNDER_LOADER: '1', ...shardEnv };
    if (nodePath) spawnEnv.NODE_PATH = nodePath;
    const proc=child_process.spawn(nodeBin,nodeArgs,{cwd:workingDir,stdio:'inherit',env:spawnEnv,shell:false});

    processRefs[bot.key] = proc;
    writePid(bot.key, proc.pid);

    proc.on('error', (err?) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch (e) {
          console.warn("[Loader]", e?.message || e);
        }
        processRefs[bot.key] = null;
        console.log(`[Loader] Errore avvio ${bot.label}: ${err?.message || err}`);
        if (!shuttingDown) {
            requestShutdown(1, `${bot.label} non si e avviato correttamente`);
        }
        finalizeShutdownIfIdle();
        resolve();
    });

    proc.on('exit', (code?, signal?) => {
        try { fs.unlinkSync(pidFile(bot.key)); } catch (e) {
          console.warn("[Loader]", e?.message || e);
        }
        processRefs[bot.key] = null;
        if (shuttingDown) {
            console.log(`[Loader] ${bot.label} chiuso durante arresto coordinato (code ${code}${signal ? `, signal ${signal}` : ''})`);
        } else {
            console.log(`[Loader] ${bot.label} fermato (code ${code}${signal ? `, signal ${signal}` : ''})`);
        }
        if (!shuttingDown) {
            requestShutdown(code == null ? 1 : code || 0, `${bot.label} si e fermato; riavvio coordinato di tutto il gruppo`);
        }
        finalizeShutdownIfIdle();
        resolve();
    });
}

function runfile(bot?, options: Record<string, any> = {}) {
    return new Promise((resolve?) => {
        const { workingDir, file } = splitStartPath(bot);
        const skipGitPull = options.skipGitPull ?? !ENABLE_LOADER_GIT_PULL;
        const bypassDelay = Boolean(options.bypassDelay);
        const useWorkspaces = WORKSPACES_ENABLED;

        const start=()=>{
            clearStartupTimer(bot.key);
            if (shuttingDown) {
                ((resolve as any)() as any);
                return;
            }
            console.log(`[Loader] Trigger avvio ${bot.label}`);
            cleanupStalePid(bot.key);runSyncFromServerIfConfigured();const repoRoot=fs.existsSync(path.join(baseDir,'.git'))?baseDir:workingDir;if(!skipGitPull&&ENABLE_LOADER_GIT_PULL){updateRepo(repoRoot);} const depTask=ENABLE_LOADER_NPM_INSTALL?ensureDependencies(workingDir,false):Promise.resolve();depTask.finally(()=>spawnBotProcess(bot,workingDir,file,resolve));
        };const delay=bypassDelay?0 : Number(bot.startupDelayMs || 0);
        if (delay > 0) {
            console.log(`[Loader] Ritardo avvio ${bot.label}: ${delay}ms`);
            startupTimers[bot.key] = setTimeout(start, delay);
            return;
        }

        start();
    });
}

["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].forEach((signalName?) => {
    process.on(signalName, () => requestShutdown(0, `segnale ${signalName} ricevuto`));
});

process.on("exit", () => {
    clearAllStartupTimers();
    for (const proc of Object.values(processRefs)) {
        if (proc?.pid) killPidTree(proc.pid);
    }
});

async function bootBots() {
  try {
    const { buildMongoUrl, waitForMongoReachable } = require("./Vinyls/Utils/Database/mongoConnect") as typeof import("./Vinyls/Utils/Database/mongoConnect");
    const mongoUrl = buildMongoUrl(null);
    if (mongoUrl) {
      console.log("[Loader] Attesa MongoDB...");
      const ready = await waitForMongoReachable(mongoUrl, 8_000);
      if (!ready) {
        console.warn("[Loader] MongoDB non raggiungibile entro 30s, avvio bot comunque.");
      }
    }
  } catch (err) {
    console.warn("[Loader] Probe MongoDB non disponibile:", err?.message || err);
  }

  for (const bot of BOTS) {
    runfile(bot, { skipGitPull: !ENABLE_LOADER_GIT_PULL });
  }
}

bootBots().catch((err?) => {
  console.error("[Loader] Boot fallito:", err?.message || err);
  process.exit(1);
});