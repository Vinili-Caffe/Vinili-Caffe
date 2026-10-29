const MAX_ACTIVE = Math.max(
  1,
  Math.min(2, Math.floor(Number(process.env.VC_ECONOMY_RENDER_CONCURRENCY) || 1)),
);

let active = 0;
const waiters = [];

function drainQueue() {
  while (active < MAX_ACTIVE && waiters.length) {
    const job = waiters.shift();
    if (!job) break;
    active += 1;
    Promise.resolve()
      .then(job.fn)
      .then(
        (value?) => {
          active -= 1;
          job.resolve(value);
          drainQueue();
        },
        (err?) => {
          active -= 1;
          job.reject(err);
          drainQueue();
        },
      );
  }
}

function runEconomyRender(fn?) {
  if (typeof fn !== "function") {
    return Promise.reject(new TypeError("runEconomyRender expects a function"));
  }
  return new Promise((resolve?, reject?) => {
    waiters.push({ fn, resolve, reject });
    drainQueue();
  });
}

export = { runEconomyRender, MAX_ACTIVE };
