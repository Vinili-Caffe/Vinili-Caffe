/**
 * @param {object} options
 * @param {object} options.baseLogs - consoleLogs API
 * @param {() => string} [options.resolveLogLevel]
 */
function createBotLogger(options: Record<string, any> = {}) {
  const baseLogs = options.baseLogs;
  if (!baseLogs) throw new Error("createBotLogger: baseLogs required");
  const levels = { debug: 0, info: 1, success: 1, logging: 1, warn: 2, error: 3 };

  function resolveConfiguredLogLevel() {
    if (typeof options.resolveLogLevel === "function") {
      return String(options.resolveLogLevel() || "info").toLowerCase();
    }
    const fromEnv = String(process.env.LOG_LEVEL || process.env.VC_LOG_LEVEL || "")
      .trim()
      .toLowerCase();
    if (fromEnv) return fromEnv;
    return "info";
  }

  function getMinLevel() {
    const configured = resolveConfiguredLogLevel();
    if (configured === "silent") return Infinity;
    return levels[configured] ?? levels.info;
  }

  function shouldLog(level?) {
    if (resolveConfiguredLogLevel() === "silent") return level === "error";
    return (levels[level] ?? levels.info) >= getMinLevel();
  }

  function buildPayload(args?) {
    if (!args.length) return "";
    if (args.length === 1) return args[0];
    return args;
  }

  function write(level?, clientOrMessage?, ...rest) {
    let logger = baseLogs;
    let args = [clientOrMessage, ...rest];
    if (clientOrMessage?.logs && typeof clientOrMessage.logs[level] === "function") {
      logger = clientOrMessage.logs;
      args = rest;
    }
    if (!shouldLog(level)) return;
    const payload = buildPayload(args);
    if (typeof logger[level] === "function") return logger[level](payload);
    return baseLogs.info(payload);
  }

  return {
    info: (...args) => write("info", ...args),
    log: (...args) => write("info", ...args),
    warn: (...args) => write("warn", ...args),
    error: (...args) => write("error", ...args),
    debug: (...args) => write("debug", ...args),
    success: (...args) => write("success", ...args),
    logging: (...args) => write("logging", ...args),
  };
}

export = { createBotLogger };
