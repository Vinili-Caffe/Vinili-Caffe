# Recovery Policy

## Persist
- Security/runtime state that changes behavior after reboot (`panic`, `raid`, `active load`, command queues, TTS/music queues, cooldowns).
- User-facing session state that would otherwise break flows (`ticket reopen sessions`, voice sessions).
- Scheduler state that could skip tasks if lost (`chat reminder scheduled hours`).

## Do Not Persist
- Short-lived caches only used to reduce API calls or logs (`entity cache`, dedupe caches, warning throttles).
- Computable state derivable from DB/source of truth with low cost.
- Transient process locks used only for in-process concurrency.

## Constraints
- All snapshots use `snapshotStore` with `version`, `checksum`, `WAL` fallback, and circuit breaker.
- Every persisted runtime must register a shutdown flush via `shutdownCheckpoint`.
- Persisted queue/session state must have TTL or size caps to avoid stale replay.