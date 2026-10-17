# Asset pipeline (clean identity)

## Goal

One source of truth for JS/CSS. No more hotfix stamped copies living in git.

## Hard rules

1. **Edit only canonical files** — e.g. `js/vc-perf.js`, `css/vc-look-core.css`.
2. **Never commit stamped copies** — `*.YYYYMMDDlabelN.js/css` are **deploy artifacts** only.
3. **Layout/design lock** — cleanup and identity work must keep the live look **identical**. Do not “normalize” pages onto a different CSS/JS byte stream without an explicit visual pass.
4. **Versions live in** `asset-versions.json` — deploy reads this; do not invent ad-hoc `?v=` strings in one-off scripts.
5. **One deploy entrypoint** — `scripts/deploy_assets.py` (see below). Archive old `_tmp_deploy_*` / `deploy-*` instead of adding more.

## Flow

```
edit canonical → set version in asset-versions.json → deploy_assets.py
  → copy canonical to /var/www/.../stem.{ver}.ext
  → rewrite HTML refs for listed stems
  → Cloudflare purge
  → assert markers / hashes
```

## Phase status

- **Phase 1 (assetIdentity1):** dead unreferenced stamps removed from repo; registry + this policy added; deploy helper scaffolded.
- **Phase 2 (deployUnify1):** legacy `deploy-*.py` (~450) and `_tmp_*` (~667) moved to `WebSite/scripts/_archive/`; `deploy/_stage_*` old stages → `deploy/_archive/`. **Only** `scripts/deploy_assets.py` is the hot deploy entrypoint.
- **Phase 3 (bootGraph1):** `vc-asset-versions.js` + `runtime_inject` in registry; `discord-auth` / `vc-landing` / `vc-site-chrome` read `__VC_ASSET_VERS` (fallbacks identical). Boot order documented in `asset-versions.json` → `boot_order`. Page shell stays XOR landing|chrome (no mega merge).
- **Phase 4a (megaSplit1):** `ensureSiteHelperScripts` extracted to `js/vc-auth-inject.js` (~91KB); `discord-auth.js` keeps OAuth/UI.
- **Phase 4b (notifStaffLazy1):** staff inbox queue/expand → `vc-landing-notif-staff.js` (lazy; public bell never loads it). Main notif URL still `LANDING_NOTIF_VER`.
- **Phase 4c (ticketsComposerLazy1):** composer/interact → `web-tickets-page-composer.js` (~90KB lazy). List first paint stays in `web-tickets-page.js`.
- **Not yet:** mass HTML rewrite of all CSS stems; CSS layers (phase 5).

## Archive

| Path | Contents |
|------|----------|
| `WebSite/scripts/_archive/deploy_legacy/` | old `deploy-*.py` |
| `WebSite/scripts/_archive/tmp_legacy/` | old `_tmp_*` probes/deploys |
| `deploy/_archive/` | old `_stage_*` / `_tmp_*` deploy folders |
