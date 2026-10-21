# WebSite/scripts

## Canonici (usare questi)
- `deploy_assets.py` + `../asset-versions.json` — deployUnify1 (unico entrypoint live)
- `probe_guardrails.py` — fase4Guard1: budget CSS/JS, no page-bundle su scoped (`--assert-fase4` in deploy)
- `purge_orphan_stamps.py` — chiamato da deploy_assets (disk only, visual lock)
- `bake-broken-placeholders.py` + `bake_url_safe.py` — bake `{{PLACEHOLDER}}` negli HTML
- i18n: `extract-i18n-keys.cjs`, `generate-i18n-locales.cjs`, `rebuild-i18n-locales-bundle.cjs`, `check-i18n-locales.cjs`, `find-missing-i18n.mjs`
- build: `build-site.mjs`, `build-local-dev.ps1`, `build_vc_shell.cjs`, `build_fa_subset.py`, `minify-obfuscate-dist.mjs`
- wiki/boards: `wiki-command-discovery.mjs`, `wiki-help-visibility.mjs`, `gen-wiki-panes.mjs`, `generate-boards-pages.cjs`, `generate-static-content-packs.cjs`
- nginx helpers: `build-og-i18n-nginx.py` / `.cjs`, `patch-nginx-adsense-csp.py`, `patch-nginx-adtraffic-frame-csp.py`

## Non toccare / non ricreare
- Mega `vc-page-bundle` / `css/_split_bundle` — morti (stack = chrome + `vc-page-*`)
- One-shot bake/prune/patch/split — non ripristinare; fix → `asset-versions.json` → `deploy_assets.py`

## .gz
I `*.gz` accanto a css/js/html servono **solo sul VPS** (nginx `gzip_static`).
Li genera `deploy_assets.py` in deploy. Non vanno in git (vedi `.gitignore`).
