#!/usr/bin/env python3
"""Safe leftover {{PLACEHOLDER}} bake values.

Never map URL / API / webhook placeholders to '#'. That produced live bugs like
apiUrl: "#" (tickets). Prefer documented defaults, empty string (clients reject),
or fail loud for unknown API keys.
"""
from __future__ import annotations

import re
from typing import Mapping

PH_RE = re.compile(r"\{\{[A-Z0-9_]+\}\}")


def placeholder_key(ph: str) -> str:
    s = str(ph or "").strip()
    if s.startswith("{{") and s.endswith("}}"):
        return s[2:-2]
    return s


def is_url_like_placeholder(ph: str) -> bool:
    key = placeholder_key(ph).upper()
    if not key:
        return False
    if key.endswith("_URL") or key.endswith("_URL_LOCAL"):
        return True
    if "API_URL" in key or "WEBHOOK" in key:
        return True
    compact = key.replace("_", "")
    if compact in {"APIURL", "APIURLLOCAL", "WEBHOOKURL"}:
        return True
    if "URL" in key:
        return True
    return False


def is_api_or_webhook_placeholder(ph: str) -> bool:
    key = placeholder_key(ph).upper()
    if not key:
        return False
    if key.endswith("_LOCAL"):
        return False  # optional localhost overrides → empty
    if "API_URL" in key or key.endswith("_API_URL"):
        return True
    if "WEBHOOK" in key:
        return True
    compact = key.replace("_", "")
    return compact in {"APIURL", "WEBHOOKURL"}


def is_seo_placeholder(ph: str) -> bool:
    """Titles / OG / meta / descriptions must never bake to empty (Discord embeds)."""
    key = placeholder_key(ph).upper()
    if not key:
        return False
    markers = (
        "OG_TITLE",
        "OG_DESCRIPTION",
        "META_DESCRIPTION",
        "PAGE_TITLE",
        "SITE_NAME",
        "OG_SITE_NAME",
        "OG_IMAGE",
        "_OG_TITLE",
        "_OG_URL",
        "_META_",
        "_PAGE_TITLE",
    )
    if key in {"OG_TITLE", "OG_DESCRIPTION", "OG_URL", "OG_SITE_NAME", "SITE_NAME"}:
        return True
    if key.endswith("_OG_TITLE") or key.endswith("_OG_DESCRIPTION") or key.endswith("_OG_URL"):
        return True
    if key.endswith("_META_DESCRIPTION") or key.endswith("_PAGE_TITLE"):
        return True
    if key.startswith("OG_IMAGE"):
        return True
    return any(m in key for m in ("PAGE_TITLE", "META_DESCRIPTION", "OG_TITLE"))


def leftover_placeholder_value(
    ph: str,
    known: Mapping[str, str] | None = None,
    *,
    strict_api: bool = True,
) -> str:
    """Return a safe replacement for an unknown leftover placeholder.

    - Never returns '#' for URL-like keys.
    - Optional *_LOCAL / BLOCK / BOOT / SOCIAL → "".
    - Unknown API/webhook keys raise ValueError when strict_api=True.
    - SEO/OG/title leftovers raise (never empty — empty Discord embeds).
    - Other URL-like leftovers → "" (rejected by fetch clients; not '#').
    """
    if known is not None and ph in known:
        return str(known[ph])
    key = placeholder_key(ph)
    if any(x in key for x in ("BLOCK", "BOOT", "SOCIAL")):
        return ""
    if "LOCAL" in key:
        return ""
    if is_seo_placeholder(ph):
        raise ValueError(
            f"Unknown SEO/OG placeholder {ph}: add to COMMON_REPS "
            "(never bake to empty — breaks Discord link embeds)."
        )
    if is_api_or_webhook_placeholder(ph):
        if strict_api:
            raise ValueError(
                f"Unknown API/webhook placeholder {ph}: add to COMMON_REPS "
                "(never bake to '#')."
            )
        return ""
    if is_url_like_placeholder(ph):
        return ""
    return ""


def replace_leftover_placeholders(
    text: str,
    known: Mapping[str, str] | None = None,
    *,
    strict_api: bool = True,
) -> str:
    """Replace remaining {{A_Z0-9_}} placeholders with safe defaults."""
    out = text
    leftover = sorted(set(PH_RE.findall(out)))
    unknown: list[str] = []
    for ph in leftover:
        try:
            val = leftover_placeholder_value(ph, known, strict_api=strict_api)
        except ValueError as e:
            unknown.append(str(e))
            continue
        out = out.replace(ph, val)
    if unknown:
        raise SystemExit(
            "Unknown placeholders (add to COMMON_REPS): " + "; ".join(unknown)
        )
    return out
