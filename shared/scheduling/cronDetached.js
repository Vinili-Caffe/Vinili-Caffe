function runCronDetached(logLabel, fn) {
  return function cronDetachedHandler() {
    // Return a Promise so node-cron `noOverlap: true` waits for completion.
    // Previously setImmediate returned immediately → overlap allowed.
    return new Promise((resolve) => {
      setImmediate(() => {
        void Promise.resolve()
          .then(fn)
          .catch((err) => {
            global.logger?.error?.(logLabel, err);
          })
          .finally(() => resolve());
      });
    });
  };
}

module.exports = { runCronDetached };
