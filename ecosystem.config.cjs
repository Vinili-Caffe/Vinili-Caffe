const fs = require("fs");
const path = require("path");
const base = path.resolve(__dirname);
const envPath = path.join(base, ".env");
try {
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key) process.env[key] = val;
    }
  }
} catch (_) {}

/** KEY=val per riga → oggetto env (solo stringhe, per PM2). */
function loadKeyValueEnvFile(filePath) {
  const out = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key) out[key] = String(val);
    }
  } catch (_) {}
  return out;
}

const lavalinkEnvFile = path.join(base, "Lavalink", ".env.lavalink");
const lavalinkEnvFromFile = loadKeyValueEnvFile(lavalinkEnvFile);

/**
 * PM2: sempre `java -jar Lavalink.jar` + `--spring.config.additional-location` (cwd = cartella Lavalink).
 * Non usare `interpreter: bash` + `start-lavalink.sh`: dopo reload PM2 può lasciare `interpreter_args` JVM
 * attaccati a bash → `bash: -X: invalid option` e loop di crash.
 */
const lavalinkPm2App = {
  name: "lavalink",
  cwd: path.join(base, "Lavalink"),
  script: path.join(base, "Lavalink", "Lavalink.jar"),
  interpreter: "java",
  interpreter_args: "-Xms256m -Xmx768m -XX:+UseG1GC -XX:+ParallelRefProcEnabled -jar",
  args: "--spring.config.additional-location=optional:file:./",
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: "1200M",
  env: lavalinkEnvFromFile,
};

module.exports = {
  apps: [
    lavalinkPm2App,
    {
      name: "bots",
      cwd: base,
      script: "wait-for-lavalink.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
    },
  ],
};