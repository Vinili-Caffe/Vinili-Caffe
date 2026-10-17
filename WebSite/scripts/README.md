# WebSite/scripts

## Canonici (usare questi)
- `deploy_assets.py` + `../asset-versions.json` — deployUnify1 (unico entrypoint live)
- `bake-broken-placeholders.py` — bake `{{PLACEHOLDER}}` negli HTML
- i18n: `generate-i18n-locales.cjs`, `rebuild-i18n-locales-bundle.cjs`, `check-i18n-locales.cjs`, `find-missing-i18n.mjs`
- build: `build-site.mjs`, `build-local-dev.ps1`

## Archiviato
One-shot / probe / hotfix vecchi → `_archive/oneshot/` (solo archeologia).

## .gz
I `*.gz` accanto a css/js/html servono **solo sul VPS** (nginx `gzip_static`).
Li genera `deploy_assets.py` in deploy. Non vanno in git (vedi `.gitignore`).
