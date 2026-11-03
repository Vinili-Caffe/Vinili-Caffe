const { inspect } = require("node:util") as typeof import("node:util");

const color = {
  red: "\x1b[31m",
  orange: "\x1b[38;5;202m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  pink: "\x1b[38;5;213m",
  torquise: "\x1b[38;5;45m",
  purple: "\x1b[38;5;57m",
  reset: "\x1b[0m",
};

const ERROR_BUFFER_MAX = 300;
const CONSOLE_BUFFER_MAX = 1200;
const errorBuffer = [];
const consoleBuffer = [];

function normalizeToText(message?) {
  if (typeof message === "string") return message;
  try {
    return inspect(message, { depth: 3, colors: false });
  } catch {
    return String(message);
  }
}

function pushConsole(level?, message?, enabled = true) {
  if (!enabled) return;
  try {
    consoleBuffer.unshift({
      at: Date.now(),
      level: String(level || "info"),
      message: normalizeToText(message),
    });
    if (consoleBuffer.length > CONSOLE_BUFFER_MAX) {
      consoleBuffer.length = CONSOLE_BUFFER_MAX;
    }
  } catch (_) {}
}

function getTimestamp() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

function write(message = "", prefix = "", colors = true) {
  if (typeof message === "string") {
    const lines = message.split("\n");
    const isMultiline = lines.length > 1;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      console.log(!isMultiline && i === 0 ? prefix + line : line);
    }
    return;
  }
  const properties = inspect(message, {
    depth: 3,
    colors: Boolean(colors && typeof message !== "string"),
  });
  const regex = /^\s*["'`](.*)["'`]\s*\+?$/gm;
  const lines = properties.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(regex, "$1");
    console.log(i === 0 ? prefix + line : line);
  }
}

function createConsoleLogs(options: Record<string, any> = {}) {
  const withBuffers = options.withBuffers !== false;

  function info(message?) {
    pushConsole("info", message, withBuffers);
    return write(message, `${color.yellow}[${getTimestamp()}]${color.reset} `);
  }
  function warn(message?) {
    pushConsole("warn", message, withBuffers);
    return write(message, `${color.orange}[${getTimestamp()}]${color.reset} `);
  }
  function error(message?) {
    pushConsole("error", message, withBuffers);
    if (withBuffers) {
      try {
        errorBuffer.unshift({ at: Date.now(), message: normalizeToText(message) });
        if (errorBuffer.length > ERROR_BUFFER_MAX) errorBuffer.length = ERROR_BUFFER_MAX;
      } catch (_) {}
    }
    return write(message, `${color.red}[${getTimestamp()}] `, false);
  }
  function success(message?) {
    pushConsole("success", message, withBuffers);
    return write(message, `${color.green}[${getTimestamp()}]${color.reset} `);
  }
  function debug(message?) {
    pushConsole("debug", message, withBuffers);
    return write(message, `${color.blue}[${getTimestamp()}]${color.reset} `);
  }
  function logging(message?) {
    pushConsole("logging", message, withBuffers);
    return write(message, `${color.pink}[${getTimestamp()}]${color.reset} `);
  }
  function torquise(message?) {
    pushConsole("info", message, withBuffers);
    return write(message, `${color.torquise}[${getTimestamp()}]${color.reset} `);
  }
  function purple(message?) {
    pushConsole("info", message, withBuffers);
    return write(message, `${color.purple}[${getTimestamp()}]${color.reset} `);
  }

  return {
    getTimestamp,
    write,
    info,
    warn,
    error,
    success,
    debug,
    logging,
    torquise,
    purple,
    color,
    errorBuffer: withBuffers ? errorBuffer : undefined,
    consoleBuffer: withBuffers ? consoleBuffer : undefined,
  };
}

export = { createConsoleLogs, color, getTimestamp };
