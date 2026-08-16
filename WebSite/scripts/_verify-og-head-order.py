#!/usr/bin/env python3
from pathlib import Path

h = Path("/var/www/viniliecaffe/index.html").read_text(encoding="utf-8", errors="replace")
i = h.lower().find("<head")
j = h.find(">", i) + 1
print("--- first 700 chars after <head> ---")
print(h[j : j + 700])
print("--- og before first script? ---")
first_script = h.lower().find("<script", j)
first_og = h.lower().find('property="og:image"', j)
print("first_og", first_og, "first_script", first_script, "og_before_script", first_og < first_script)
