# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are people already in the Vinili & Caffè Discord: members using the site as the community hub (tools, events, profile, contests, feedback, tickets, personalization). Recruitment of new members matters too, but member tooling and belonging come first. Secondary audiences: staff/moderators (staff console), and server owners who use bot/dashboard features where those exist.

## Product Purpose

Vinili & Caffè is the official web surface of an Italian Discord community built around music, coffee-shop warmth, social life, and gaming. The site makes the community usable beyond chat: explore the offer, join Discord, run community workflows (feedback, tickets, appeals, applications, contests, wrapped, personalizza, bacheca, events), and operate staff tools. Success means members can do real community jobs on the site without friction, newcomers understand and join the Discord, and staff can run moderation/ops from the same brand surface.

## Positioning

Official community hub for Vinili & Caffè: homemade bots, seasonal events, and Discord-tied tools (feedback, tickets, contests, personalizza, and more) that a generic “Discord server website” could not truthfully claim as this community’s own system.

## Operating Context

- Staging site: `https://beta.viniliecaffe.it` (Cloudflare Access) → VPS `/var/www/viniliecaffe-beta` — default verify/deploy gate.
- Public prod: `https://www.viniliecaffe.it` (Vercel) — promote only with explicit owner OK.
- Bot and site API on VPS (`discord.viniliecaffe.gg` / `api.viniliecaffe.it`), config under `/opt/bot`.
- Discord is the social and identity backbone for server-related flows; invite `discord.gg/viniliecaffe`.
- Seasonal and event surfaces (e.g. Halloween contests, Star Wars evento) sit beside evergreen community pages.
- Live workflow: fix → deploy **beta** → verify (Access) → www only if asked.

## Capabilities and Constraints

- Community pages and boards: feedback, tickets, confessionale, candidature, appelli, wordle/puzzle, classifiche, perks, donate, sponsor, bacheca, notifications, personalizza, wrapped, contest, serata film, evento hubs, legal/data pages.
- Member auth and Discord-linked features rely on Discord; Discord is fundamental for anything that concerns the server. Other auth methods are allowed in principle where a flow is not Discord-specific, but must not weaken Discord-tied security or identity.
- Internationalization: not limited to Italian and English — support as many languages as the product maintains; do not hard-code a two-locale ceiling into product decisions.
- Site deploy is Vercel only for www; bot/media/API stay on VPS. Do not publish the React www by copying build output onto the VPS document root.
- Incumbent visual system already ships (caramel/crema, vinyl + café brand). Visual world documentation is separate (`DESIGN.md` via document/new-work); this file is product truth only.
- Open: exact non-Discord auth products (if any) are undecided until introduced.

## Brand Commitments

- Name: **Vinili & Caffè**.
- Personality and metaphor: vinyl records + café warmth; community chill, Italian roots, music/social/gaming.
- Voice and copy live in site i18n; do not invent testimonials, member counts, or awards not present in product data.
- Binding visual constraints volunteered elsewhere (e.g. intentional Hero gradient wordmark) are brand commitments for polish; full visual system is not defined here.

## Evidence on Hand

- Live production site and API; Discord invite and official Instagram/TikTok links in `src/lib/site.ts`.
- Real community content surfaces (reviews, feedback threads, contests, live server stats) fed by bot/API — do not fabricate social proof.
- Brand and seasonal imagery under `WebSiteReact/public/images/` and related assets.
- No fabricated case studies or press claims.

## Product Principles

1. **Members first, join second** — deepen belonging and usable tools for people already in; recruitment supports that, it does not replace it.
2. **Discord-honest** — anything about the server stays truthful to Discord identity, roles, and ops; Discord remains fundamental there.
3. **One community, many languages** — ship for the locales we maintain; never treat IT/EN as a permanent product ceiling.
4. **Live is the bar** — UI claims are proven on production (Vercel www / VPS bot), not only locally.
5. **Access for everyone** — pursue the strongest practical accessibility; do not trade inclusion for decorative novelty.

## Accessibility & Inclusion

Pursue the strongest practical accessibility across the site: keyboard and focus clarity, contrast, motion respect (`prefers-reduced-motion`), usable touch targets, semantic structure, and inclusive copy (including gendered welcome variants where they exist). Prefer WCAG-aligned patterns wherever feasible; treat accessibility as a standing product requirement, not an optional polish pass.
