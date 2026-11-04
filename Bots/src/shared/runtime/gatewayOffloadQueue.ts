/**
 * Coda Mongo gateway → worker (boost recovery, activity/EXP ticks, markov reply).
 * Un solo consumer (bot-workers / vinyls-markov) evita race rilevanti.
 */
const mongoose = require("mongoose") as typeof import("mongoose");

const COLLECTION = "gateway_offload_jobs";
const MAX_PENDING_SOFT = Math.max(500, Number(process.env.VC_GATEWAY_OFFLOAD_MAX_PENDING || 8000) || 8000);

function col() {
  const db = mongoose.connection?.db;
  if (!db || mongoose.connection.readyState !== 1) return null;
  return db.collection(COLLECTION);
}

async function enqueueGatewayOffloadJob(kind?, payload?, opts: Record<string, any> = {}) {
  const c = col();
  if (!c) return false;
  const k = String(kind || "").trim();
  if (!k) return false;
  try {
    if (opts.dedupeKey) {
      const existing = await c.findOne(
        { kind: k, "payload.dedupeKey": String(opts.dedupeKey), status: "pending" },
        { projection: { _id: 1 } },
      );
      if (existing) return false;
    }
    const pending = await c.countDocuments({ status: "pending" });
    if (pending >= MAX_PENDING_SOFT) {
      global.logger?.warn?.(`[gatewayOffloadQueue] pending=${pending} >= ${MAX_PENDING_SOFT}, drop ${k}`);
      return false;
    }
    await c.insertOne({
      kind: k,
      payload: payload && typeof payload === "object" ? payload : {},
      status: "pending",
      createdAt: new Date(),
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[gatewayOffloadQueue] enqueue:", err?.message || err);
    return false;
  }
}

async function claimGatewayOffloadJobs(kinds?, limit = 40) {
  const c = col();
  if (!c) return [];
  const kindList = (Array.isArray(kinds) ? kinds : [kinds])
    .map((k?) => String(k || "").trim())
    .filter(Boolean);
  if (!kindList.length) return [];
  const n = Math.max(1, Math.min(200, Number(limit) || 40));
  try {
    const jobs = await c
      .find({ status: "pending", kind: { $in: kindList } })
      .sort({ _id: 1 })
      .limit(n)
      .toArray();
    if (!jobs.length) return [];
    const ids = jobs.map((j?) => j._id);
    await c.deleteMany({ _id: { $in: ids } });
    return jobs;
  } catch (err) {
    global.logger?.warn?.("[gatewayOffloadQueue] claim:", err?.message || err);
    return [];
  }
}

function startGatewayOffloadDrainLoop(label?, kinds?, handler?, intervalMs = 2000) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const jobs = await claimGatewayOffloadJobs(kinds, 40);
      for (const job of jobs) {
        try {
          await handler(job);
        } catch (err) {
          global.logger?.warn?.(`[${label || "offload"}] job ${job?.kind}:`, err?.message || err);
        }
      }
    } finally {
      busy = false;
    }
  };
  tick();
  const timer = setInterval(() => {
    void tick();
  }, Math.max(500, Number(intervalMs) || 2000));
  timer.unref?.();
  return timer;
}

export = {
  enqueueGatewayOffloadJob,
  claimGatewayOffloadJobs,
  startGatewayOffloadDrainLoop,
  OFFLOAD_KINDS: Object.freeze({
    BOOST_RECOVER: "boost-recover",
    BOOST_CONCURRENT: "boost-concurrent",
    ACTIVITY_MESSAGE: "activity-message",
    MARKOV_REPLY: "markov-reply",
  }),
};
