function formatDurationMs(durationMs) {
  const totalMs = Math.max(0, Math.floor(Number(durationMs || 0)));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}m ${seconds}s ${millis}ms`;
}

async function runTimedTask({ label, run, onStart, onSuccess, onError }) {
  const startedAt = Date.now();
  onStart?.(label);
  try {
    const value = await run();
    onSuccess?.(label, startedAt, value);
    return {
      status: "fulfilled",
      label,
      value,
      durationMs: Date.now() - startedAt,
    };
  } catch (reason) {
    onError?.(label, startedAt, reason);
    return {
      status: "rejected",
      label,
      reason,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runTaskGroup(tasks, hooks = {}) {
  return Promise.all(
    tasks.map((task) =>
      runTimedTask({
        label: task.label,
        run: task.run,
        onStart: hooks.onStart,
        onSuccess: hooks.onSuccess,
        onError: hooks.onError,
      }),
    ),
  );
}

async function runTaskSequence(tasks, hooks = {}) {
  const results = [];
  for (const task of tasks) {
    if (task.enabled === false) continue;
    results.push(
      await runTimedTask({
        label: task.label,
        run: task.run,
        onStart: hooks.onStart,
        onSuccess: hooks.onSuccess,
        onError: hooks.onError,
      }),
    );
  }
  return results;
}

async function runTaskPool(tasks, hooks = {}, concurrency = 3) {
  const enabled = tasks.filter((task) => task.enabled !== false);
  if (!enabled.length) return [];
  const limit = Math.max(1, Math.min(12, Number(concurrency) || 3));
  const results = new Array(enabled.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < enabled.length) {
      const index = nextIndex;
      nextIndex += 1;
      const task = enabled[index];
      results[index] = await runTimedTask({
        label: task.label,
        run: task.run,
        onStart: hooks.onStart,
        onSuccess: hooks.onSuccess,
        onError: hooks.onError,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, enabled.length) }, () => worker()));
  return results;
}

function sortStartupTasksByWeight(tasks) {
  return [...tasks].sort((a, b) => {
    const wa = Number.isFinite(Number(a?.weight)) ? Number(a.weight) : 50;
    const wb = Number.isFinite(Number(b?.weight)) ? Number(b.weight) : 50;
    if (wa !== wb) return wa - wb;
    return String(a?.label || "").localeCompare(String(b?.label || ""));
  });
}

/**
 * Esegue i task di startup in fasi per peso: veloci in sequenza, medi in pool parallelo,
 * pesanti in parallelo senza bloccare il resto del bot.
 */
async function runPhasedStartupTasks(tasks, hooks = {}, options = {}) {
  const fastMax = Number.isFinite(Number(options.fastMax)) ? Number(options.fastMax) : 20;
  const mediumMax = Number.isFinite(Number(options.mediumMax)) ? Number(options.mediumMax) : 55;
  const mediumConcurrency = Number.isFinite(Number(options.mediumConcurrency))
    ? Number(options.mediumConcurrency)
    : 4;
  const enabled = sortStartupTasksByWeight(tasks.filter((task) => task.enabled !== false));
  const fast = enabled.filter((task) => (Number(task.weight) || 50) <= fastMax);
  const medium = enabled.filter((task) => {
    const w = Number(task.weight) || 50;
    return w > fastMax && w <= mediumMax;
  });
  const heavy = enabled.filter((task) => (Number(task.weight) || 50) > mediumMax);
  const fastResults = await runTaskSequence(fast, hooks);
  const mediumResults = await runTaskPool(medium, hooks, mediumConcurrency);
  if (heavy.length) {
    void (async () => {
      for (const task of heavy) {
        await runTimedTask({
          label: task.label,
          run: task.run,
          onStart: hooks.onStart,
          onSuccess: hooks.onSuccess,
          onError: hooks.onError,
        });
        // Cede l'event loop tra task pesanti (evita miss node-cron).
        await new Promise((resolve) => setImmediate(resolve));
      }
    })();
  }
  return { fastResults, mediumResults, heavyCount: heavy.length };
}

module.exports = {
  formatDurationMs,
  runPhasedStartupTasks,
  runTaskGroup,
  runTaskSequence,
  runTaskPool,
  sortStartupTasksByWeight,
};
