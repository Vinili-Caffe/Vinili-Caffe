---
name: Vinili & Caffè
description: Midnight café turntable — warm espresso community hub for Discord
colors:
  espresso: "#0e0906"
  roast: "#1a110c"
  mocha: "#2a1c14"
  crema: "#f4e9d8"
  sand: "#c4a07a"
  caramel: "#d99a5b"
  ember: "#f0b46e"
  paper: "#f4e9d8"
  ink: "#0e0906"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0em"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.25em"
  script:
    fontFamily: "Great Vibes, cursive"
    fontSize: "inherit"
    fontWeight: 400
    lineHeight: 1.1
rounded:
  xl: "0.75rem"
  "2xl": "1rem"
  "3xl": "1.5rem"
  full: "9999px"
spacing:
  section-x: "1.25rem"
  section-y: "3.5rem"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "linear-gradient(to right, {colors.caramel}, {colors.ember})"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.title}"
  button-primary-lg:
    backgroundColor: "linear-gradient(to right, {colors.caramel}, {colors.ember})"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0.875rem 1.5rem"
  button-ghost:
    backgroundColor: "color-mix(in srgb, {colors.crema} 8%, transparent)"
    textColor: "{colors.crema}"
    rounded: "{rounded.full}"
    padding: "0.5rem 1rem"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "0.625rem 1.25rem"
  chip:
    backgroundColor: "color-mix(in srgb, {colors.crema} 8%, transparent)"
    textColor: "{colors.sand}"
    rounded: "{rounded.full}"
    padding: "0.375rem 1rem"
  card:
    backgroundColor: "color-mix(in srgb, {colors.roast} 70%, transparent)"
    textColor: "{colors.crema}"
    rounded: "{rounded.3xl}"
---

# Design System: Vinili & Caffè

## Overview

**Creative North Star: "The Midnight Café Turntable"**

The site feels like a late-night café where a vinyl is always spinning: deep roast surfaces, warm crema light on type, and caramel accents that catch like brass on a tonearm. Personality is chill Italian community — social, musical, gaming — never corporate SaaS and never loud neon club.

Density stays breathable on marketing surfaces (hero, explore, page heroes) and slightly tighter on Operate boards (feedback, tickets, staff), but the same materials: roast panels, sand rings, pill CTAs. Aesthetic philosophy is soft-luxury espresso: tonal depth over chrome, serif display for brand moments, Inter for work.

Confirmed visual rejections: purple-on-white / indigo SaaS gradients; generic AI cream + terracotta editorial; broadsheet hairline newspaper layouts; neon glow stacks as default decoration.

**Key Characteristics:**
- Espresso–roast–mocha grounds with crema/sand/caramel light
- Cormorant display + Inter body + Great Vibes script accents
- Pill primary CTAs (caramel→ember) with soft press
- Tonal cards + sand rings; shadows reserved for lift/CTA
- `max-w-6xl` content rail, generous page-hero breathing room

## Colors

Warm coffee spectrum: near-black espresso grounds, cream foam text, caramel brass accent. One accent family (caramel/ember); sand is the quiet metal.

### Primary
- **Caramel Brass** (`#d99a5b`): Primary CTA fills (with ember), focus caret, selection tint, brand accent moments.
- **Ember Foam** (`#f0b46e`): Gradient partner to caramel; hot highlights and active ember text.

### Neutral
- **Espresso Ground** (`#0e0906`): Page canvas / darkest ink field.
- **Roast Bar** (`#1a110c`): Panels, cards, chrome surfaces.
- **Mocha Shelf** (`#2a1c14`): Footer fade, deeper shelves.
- **Crema Foam** (`#f4e9d8`): Primary text on dark; also `paper` for physical objects.
- **Sand Rim** (`#c4a07a`): Rings, muted labels, italic accents, secondary type.
- **Ink** (`#0e0906`) / **Paper** (`#f4e9d8`): Physical-object pair (tickets, letters) stable across theme.

### Named Rules
**The One Brass Rule.** Caramel/ember is the scarce accent — CTAs, focus, and intentional brand sparks. Do not flood screens with caramel fills.

**The Physical Objects Rule.** `paper` + `ink` stay locked for “physical” UI (receipts, letters, tracklists) in both themes.

## Typography

**Display Font:** Cormorant Garamond (Georgia, serif)  
**Body Font:** Inter (ui-sans-serif, system-ui, sans-serif)  
**Script Font:** Great Vibes (cursive) — brand wordmark flourishes only

**Character:** Editorial café serif for welcome and page titles; clean Inter for boards and chrome; script only as a brand wink, never for UI chrome.

### Hierarchy
- **Display** (600, ~3–4.5rem / leading 1.15): Hero and PageHero titles; italic sand accent span allowed.
- **Headline** (600, ~2.25–3rem): Section titles (Explore, Why, Footer tagline).
- **Title** (600, ~1–1.125rem): Card titles, board headers, strong UI labels.
- **Body** (400, 1rem / ~1.6): Leads and board copy; prefer `text-pretty` / measure ~38–65ch on heroes.
- **Label** (600, ~0.65–0.75rem, tracking ~0.2–0.3em, uppercase): Kickers, nav group labels, chips.

### Named Rules
**The Script Is Not Chrome Rule.** Great Vibes appears in brand moments only — never buttons, tables, or form labels.

## Layout

Content rail `max-w-6xl` (~72rem) with horizontal padding `px-5` / `sm:px-6`. Page heroes: tall top padding under fixed nav (`pt-36` / `sm:pt-44`), centered copy, photo full-bleed behind scheme-dark overlay. Homepage first viewport is one composition (brand + lead + CTAs + turntable), not a dashboard. Operate boards: central card stack + scroll; secondary content below. Mobile: 2-column explore grids; touch targets ≥40px on chrome controls. `scroll-padding-top` accounts for sticky nav + safe area.

## Elevation & Depth

Hybrid: **tonal layering first**, soft shadows second. Resting surfaces use roast/mocha fills and `ring-1 ring-sand/12–25`. Shadows appear on primary CTAs, Discord/float controls, and occasional media lift — not under every card.

### Shadow Vocabulary
- **CTA lift** (`0 12px 30px -10px rgba(232,160,90,0.55–0.7)`): Primary caramel pills.
- **Discord lift** (`0 10px 30px -10px rgba(88,101,242,0.8)`): Discord join control only.
- **Float / media** (softer dark offsets): Live corner, contest cards, turntable accents.

### Named Rules
**The Flat-By-Default Rule.** Cards rest flat (tone + ring). Shadow is a response to importance or float state, not decoration on every box.

## Shapes

Language is **soft pill + rounded board**: `rounded-full` for CTAs, chips, icon buttons, pagination; `rounded-2xl` / `rounded-3xl` for cards, empty states, explore panels. Avoid sharp rectangles for primary actions. Rings (`ring-sand/*`, `ring-crema/*`) replace heavy borders.

## Components

Controls feel **tactile and confident**: soft hover lift, press scale ~0.97, 200ms ease-out, no `transition-all`. Shared classes live in `src/lib/ui.ts`; site-wide caramel press also in `globals.css`.

### Buttons
- **Shape:** full pill (`rounded-full`)
- **Primary:** caramel→ember gradient, ink text, optional warm shadow; hover lift + brightness; active scale 0.97
- **Ghost:** crema/8 fill, sand ring, crema text
- **Ink:** ink fill, paper text (composer / secondary strong)
- **Discord:** brand Discord blue `#5865f2`, spring tap via motion where used

### Chips
- **Style:** crema/8 + sand ring, uppercase tracking labels or compact filter pills
- **State:** selected often caramel/15 + ember text + stronger ring

### Cards / Containers
- **Corner:** `rounded-2xl`–`rounded-3xl`
- **Background:** roast/50–70 or gradient roast→espresso
- **Border:** `ring-1 ring-sand/12` (or sand/15)
- **Internal padding:** typically `p-4`–`p-6` / section `py-14`+

### Inputs / Fields
- **Style:** dark roast fields, crema text, sand rings; component-owned focus rings (no double outline with global `:focus-visible`)
- **Focus:** caramel-tinted ring / outline on interactive chrome; inputs opt out of global outline

### Navigation
- Sticky translucent chrome; underline active via `NavUnderline`; mobile drawer with 2-col tile grid, press scale on tiles; language/theme/account menus use crema/8 surfaces

### Signature: PageHero / Turntable
Full-bleed photo + espresso gradient veil; centered kicker chip + Cormorant title. Homepage Turntable is the physical brand object — keep it tactile, not a flat illustration swap.

## Do's and Don'ts

### Do:
- **Do** use caramel→ember pills for primary actions and sand rings for quiet structure.
- **Do** keep Cormorant for titles and Inter for boards; preserve scheme-dark on photo heroes in light theme.
- **Do** respect `prefers-reduced-motion` (global CTA press already no-ops transforms).
- **Do** verify UI on staging/beta before promoting to www when that environment is the agreed gate.

### Don't:
- **Don't** introduce purple/indigo SaaS gradients or neon glow stacks as the default look.
- **Don't** use `transition-all` on interactive controls — list transform/filter/background explicitly.
- **Don't** put Great Vibes or display serif on dense Operate chrome.
- **Don't** fabricate social proof or change factual community claims for visual drama.
