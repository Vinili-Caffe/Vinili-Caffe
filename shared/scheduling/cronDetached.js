function runCronDetached(logLabel, fn) {
  return function cronDetachedHandler() {
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
