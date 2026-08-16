function runCronDetached(logLabel, fn) {
  return function cronDetachedHandler() {
    // Never await work inside node-cron's heartbeat: it `await`s onMatch and
    // late heartbeats produce "missed execution" warnings.
    setImmediate(() => {
      void Promise.resolve()
        .then(fn)
        .catch((err) => {
          global.logger?.error?.(logLabel, err);
        });
    });
  };
}

module.exports = { runCronDetached };
