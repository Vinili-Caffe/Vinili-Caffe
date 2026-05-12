function runCronDetached(logLabel, fn) {
  return function cronDetachedHandler() {
    void Promise.resolve()
      .then(fn)
      .catch((err) => {
        global.logger?.error?.(logLabel, err);
      });
  };
}

module.exports = { runCronDetached };