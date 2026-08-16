#!/usr/bin/env python3
import os
import re
import sys
import time

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/var/www/viniliecaffe"
NEWV = str(int(time.time() * 1000))
print("NEWV=" + NEWV)

# numeric ?v=123 OR template placeholder
js_css_v = re.compile(r"(\.(?:js|css))\?v=(?:\d+|\{\{BUILD_ASSET_VERSION\}\})", re.I)
local_src = re.compile(
    r'(src=["\'])((?:\.\./)*(?:/)?js/[^"\'?]+\.js)(?:\?v=(?:\d+|\{\{BUILD_ASSET_VERSION\}\}))?(["\'])',
    re.I,
)
local_href = re.compile(
    r'(href=["\'])((?:\.\./)*(?:/)?css/[^"\'?]+\.css)(?:\?v=(?:\d+|\{\{BUILD_ASSET_VERSION\}\}))?(["\'])',
    re.I,
)

def bump_local(m):
    return f"{m.group(1)}{m.group(2)}?v={NEWV}{m.group(3)}"

n_files = 0
for dirpath, _dirs, files in os.walk(ROOT):
    for name in files:
        if not name.lower().endswith(".html"):
            continue
        path = os.path.join(dirpath, name)
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                html = f.read()
        except OSError:
            continue
        next_html = js_css_v.sub(rf"\1?v={NEWV}", html)
        next_html = local_src.sub(bump_local, next_html)
        next_html = local_href.sub(bump_local, next_html)
        if next_html != html:
            with open(path, "w", encoding="utf-8") as f:
                f.write(next_html)
            n_files += 1

print("updated_html", n_files)
