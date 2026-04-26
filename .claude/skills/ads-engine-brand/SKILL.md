
---

# Rentmies Ads Engine — Brand & Design System
name: ads-engine-brand
description: >
  Rentmies Ads Engine specific brand and design system. Editorial B2B aesthetic
  combining Linear/Attio precision with Colombian high-fidelity warmth. Three-column
  fixed architecture: dark rail (64px) + warm canvas + dark Camilord AI panel (320px).
  ALWAYS use this skill when building any UI, screen, page, component, form, dashboard,
  or visual element for the Rentmies Ads Engine product. Trigger on: ads engine,
  ad engine, AdEngine AI, creative studio, parrilla de contenidos, scheduled posts,
  Camilord, ad analytics, or any work on the rentmies-ads-engine repo.
## Creative North Star

The Ads Engine is the professional B2B counterpart of the Living Atlas portal.
Where the Atlas is cinematic and emotional (for buyers), the Ads Engine is
**editorial and operational** (for marketing professionals).

Aesthetic: **Premium Editorial B2B** — Linear meets Attio meets a high-end
architectural magazine. Warm, grounded, unmistakably professional, with serif
italics that punctuate data with storytelling.

### Core Vibe
"Colombian High-Fidelity" — warm earth tones as canvas, deep authority green
for action, italic serif for editorial moments, monospace for engineered data.
Never neon. Never corporate-blue. Never pure white or pure black.

---

## 1. Color System

### 1.1 Surfaces (warm earth palette)
| Token | Hex | Usage |
|-------|-----|-------|
| `--rm-bg` | `#f6f3ee` | Page canvas. Warm off-white. NEVER use #ffffff for page bg. |
| `--rm-surface` | `#ffffff` | Cards lifted above canvas. White creates clear hierarchy. |
| `--rm-surface-2` | `#faf8f4` | Subtle surface (input backgrounds, secondary cards). |
| `--rm-surface-3` | `#f1ede6` | Chip backgrounds, deepest neutral. |
| `--rm-ink` | `#0f1410` | Primary text. Dark green-black. NEVER #000000. |
| `--rm-ink-2` | `#3a3f3b` | Secondary text. |
| `--rm-muted` | `#7a7e79` | Tertiary text, timestamps, labels. |
| `--rm-border` | `#e8e3dc` | Default border. Warm light. |
| `--rm-border-strong` | `#d4cec3` | Emphasized border. |

### 1.2 Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--rm-teal` | `#40d99d` | Active states, AI presence, success indicators. |
| `--rm-mint` | `#4fffb4` | Hover glow, AI accents on dark. |
| `--rm-green` | `#006c4a` | Authority — text emphasis, eyebrows on white. |
| `--rm-green-deep` | `#004d35` | Dark gradients, primary CTA backgrounds, deep accents. |

### 1.3 Ad Engine Specific Tokens
| Token | Hex | Usage |
|-------|-----|-------|
| `--ae-energy-1` | `#c8e7d4` | Energy meter — basic level |
| `--ae-energy-2` | `#6fbf8e` | Energy meter — optimized |
| `--ae-energy-3` | `#2d9968` | Energy meter — high conversion |
| `--ae-energy-4` | `#006c4a` | Energy meter — max power |
| `--ae-bolt` | `#93eabf` | Mint accent on deep green backgrounds |
| `--ae-input-bg` | `#faf8f4` | Form input background |
| `--ae-card-radius` | `6px` | All Ad Engine card corners |

### 1.4 Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `--rm-red` | `#c14f3a` | Errors, paused ads, urgent alerts |
| `--rm-amber` | `#d29836` | Pending status, warnings |

### 1.5 PROHIBITED
- Pure `#000000` anywhere (Camilord panel uses `#000` ONLY for the AI panel — Camilord-only exception)
- Pure `#ffffff` as page background
- Purple, indigo, violet, pink as primary accents
- Material Design blue, neon greens, gradient meshes
- Drop shadows above 8% opacity

---

## 2. Typography

### 2.1 Font Stack (3-tier system)
```css
--rm-font:  'Inter', system-ui, sans-serif;        /* UI workhorse */
--rm-serif: 'Instrument Serif', Georgia, serif;    /* Editorial moments */
--rm-mono:  'JetBrains Mono', ui-monospace;        /* Data, IDs, timestamps */
```

Import from Google Fonts:
```html

```

### 2.2 Hierarchy

| Element | Spec |
|---------|------|
| **Display editorial** | `Instrument Serif` italic, 38-48px, weight 400, tracking -0.025em, line-height 1.05 |
| **Display prefix** (italic green) | Same as above + `color: var(--rm-green-deep)` |
| **Headline** | `Inter` 32px, weight 600, tracking -0.02em |
| **Section title** | `Inter` 24px, weight 600, tracking -0.01em |
| **Card title** | `Inter` 15-16px, weight 600 |
| **Body** | `Inter` 14px, weight 400, line-height 1.55 |
| **Subhead** | `Inter` 14px, color `--rm-ink-2`, max-width 540px |
| **Eyebrow** | `JetBrains Mono` 11px, weight 600, tracking 0.18em, UPPERCASE, color `--rm-ink-2` |
| **Eyebrow muted** | Same + color `--rm-muted` |
| **Mono micro** | `JetBrains Mono` 9-10px, weight 600-700, tracking 0.12-0.15em |
| **Stat value** | `Inter` 22-26px, weight 700-800, tracking -0.02em |
| **Stat XL** | `Inter` 30px, weight 800, tracking -0.02em, color `--rm-green-deep` |

### 2.3 Editorial Moments — When to use Instrument Serif italic
- Page hero titles ("Parrilla de *Contenidos*", "Fuel your Ads: *Villa Victoria*")
- Camilord panel quotes (the AI's "voice")
- Pull quotes inside cards
- Top nav logo wordmark

NEVER use Instrument Serif for body, buttons, or labels. Reserve it for moments
where editorial character is wanted.

### 2.4 Display Composition Pattern
```html

  Fuel your Ads:
  Villa Victoria Luxury

```
The italic prefix in green-deep + the italic name creates the signature look.

---

## 3. Layout — 3-Column Fixed Architecture
┌──────┬─────────────────────────────────────┬──────────────┐
│ RAIL │         MAIN CANVAS                  │  CAMILORD AI │
│ 64px │         (1fr, fluid)                 │     320px    │
│ dark │     warm bg #f6f3ee                  │     dark     │
│      │     white cards lifted               │  #0f1410     │
│      │                                      │  or #000     │
└──────┴─────────────────────────────────────┴──────────────┘

### 3.1 Grid CSS
```css
.ae-app {
  display: grid;
  grid-template-columns: 64px 1fr 320px;
  height: 100vh;
  width: 100vw;
  background: var(--rm-bg);
  overflow: hidden;
}
```

### 3.2 Spacing System (8px base)
- `--gutter`: 24px (between major cards)
- `--margin-main`: 32px (canvas external margin)
- `--stack-xs`: 4px
- `--stack-sm`: 8px
- `--stack-md`: 16px (component internal padding default)
- `--stack-lg`: 24px (between sections)
- `--stack-xl`: 48px (between major blocks)

---

## 4. Top Navigation (the Ad Engine signature)

The Ad Engine uses a **horizontal top nav** inside the main canvas, NOT a left
sidebar inside the canvas. This is what differentiates the Ad Engine layout.

```html
<header class="ae-topnav">
  <div class="ae-topnav-logo">AdEngine AI</div>
  <a class="ae-topnav-link active">CREATIVE STUDIO</a>
  <a class="ae-topnav-link">DASHBOARD</a>
  <a class="ae-topnav-link">HISTORY</a>
  <div class="ae-search">⌕ Buscar campañas...</div>
  <button class="ae-launch-btn">⚡ LANZAR CAMPAÑA</button>
</header>
```

Specs:
- Height: 56px
- Background: `var(--rm-surface)` (white)
- Bottom border: 1px solid `var(--rm-border)`
- Logo: `Instrument Serif` italic 600, 17px, tracking -0.01em
- Links: `JetBrains Mono` 11px, weight 600, tracking 0.12em, UPPERCASE
- Active link: color `--rm-green-deep` + 2px bottom border `--rm-green-deep`
- Launch button: dark `--rm-ink` background, mono 11px weight 700 white text

---

## 5. Cards & Containers

### 5.1 Standard Card (`.ae-formcard`)
```css
background: var(--rm-surface);
border: 1px solid var(--rm-border);
border-radius: 6px;
padding: 22px 24px;
box-shadow: 0 1px 2px rgba(15,20,16,0.04);  /* XS shadow only */
```

### 5.2 Card Header
```css
display: flex; align-items: center; justify-content: space-between;
font-size: 15px; font-weight: 600; color: var(--rm-ink);
margin-bottom: 18px;
padding-bottom: 14px;
border-bottom: 1px solid var(--rm-border);
```
Right side often holds a counter, badge, or check icon in `--rm-green-deep`.

### 5.3 Recommendation Block (deep green editorial)
For AI suggestions and contextual nudges. Bold authoritative voice:
```css
background: var(--rm-green-deep);
color: #ffffff;
border-radius: 6px;
padding: 22px;
position: relative;
overflow: hidden;
min-height: 220px;
```
With a giant ⚡ bolt icon at 12% opacity in mint, positioned bottom-right rotated -12deg.

Eyebrow: `JetBrains Mono` 10px, color `--ae-bolt` (#93eabf).
Body: 17px, weight 500, white.
CTA: transparent button, white border at 30% opacity, mono uppercase 10px.

---

## 6. Energy Meter (signature Ad Engine component)

Used to show "Ad Power" / "Potencia del Anuncio" — the gamified score that
shows how much data has been provided to fuel AI generation.
[████████████████░░░░░░░░] 84%
BÁSICO  OPTIMIZADO  ALTA CONVERSIÓN  POTENCIA MÁXIMA

4 segments. Filled segments use linear gradient `--ae-energy-3` to `--ae-energy-4`.
Empty segments use `--rm-surface-3`.
Labels in mono 9px, tracking 0.12em, last label in `--rm-green-deep`.
Score: 30px weight 800 in `--rm-green-deep` with `%` at 16px.

---

## 7. Phone Preview Mockup

When showing how the ad will look published, render an iOS-style phone card:

```css
background: #fff;
border: 1px solid var(--rm-border);
border-radius: 8px;
padding: 14px;
box-shadow: 0 2px 6px rgba(15,20,16,0.05);
```

Inside:
- Meta row: green avatar (32px, --rm-green bg, white "R", radius 6px) + name + "Publicidad" label + ··· dots
- Image: aspect-ratio 4/3, border-radius 4px, gradient or actual image
- Caption: 11px, color `--rm-muted`, line-height 1.45
- CTA button: dark `--rm-green-deep` bg, white text, mono 11px weight 700, tracking 0.1em

Above the phone: live indicator
- Green pulsing dot 7px + "VISTA PREVIA AI · REAL-TIME" mono 10px tracking 0.12em weight 600

---

## 8. Camilord AI Panel (right 320px)

The Ad Engine version uses **pure black** (`#000000`) — the only place pure
black is allowed. This makes it feel "harder" / more powerful than the Atlas
copilot which uses dark green-black.

### 8.1 Header
```css
padding: 18px 20px 0;
```
- Title: "Camilord AI" — Inter 13px weight 600, color `--rm-teal`
- Status: 11px, color rgba(255,255,255,0.5), "Listo para asistir" / "Active"

### 8.2 Quote Card (the AI's voice)
```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 4px;
padding: 14px;
margin: 14px 16px 0;
```
Text: `Instrument Serif` italic 13.5px, line-height 1.45, white.

This is where Camilord "speaks" — analyses, recommendations, observations.
Always italic serif. The AI's words feel literary, not robotic.

Example: *"He analizado el mercado local en Marbella. Para esta zona, los
anuncios con el ángulo de 'Estatus' rinden un 40% mejor. ¿Quieres que ajuste
el copy automáticamente?"*

### 8.3 Section Headers (inside panel)
```css
font-family: var(--rm-mono);
font-size: 9px;
letter-spacing: 0.18em;
color: rgba(255,255,255,0.4);
font-weight: 600;
padding: 22px 20px 8px;
```
Examples: "SUGERENCIAS DE HOY", "FEEDBACK EN VIVO", "DECISIONES IA"

### 8.4 Suggestion Items
```css
margin: 0 16px 6px;
background: rgba(255,255,255,0.04);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 4px;
padding: 11px 14px;
display: flex; justify-content: space-between;
font-size: 12px; color: #fff;
```
Right side holds a chevron `>` in muted white.
Hover: background rgba(255,255,255,0.08).

---

## 9. Live Feed (the AI working in real time)

A terminal-aesthetic view of what the AI is doing right now — generation,
publication, optimization decisions.

```css
background: #050605;
color: #c8e7d4;
font-family: var(--rm-mono);
font-size: 12px; line-height: 1.55;
padding: 18px 22px;
border-radius: 6px;
```

Each line:
00:42  [GEN]    Generating headline for Villa Victoria
00:43  [PUB]    Published to Meta Feed → ad_id_8472
00:44  [OPT]    Scaling budget +50% for top performer
00:45  [PAUSE]  Paused 'Pain Point' — CTR 0.4% below threshold

Tag colors:
- `[GEN]` mint bg + mint text
- `[PUB]` white bg + white text  
- `[OPT]` amber bg + amber text
- `[PAUSE]` red bg + red text

Time column: 56px wide, color rgba(200,231,212,0.4)
Highlighted text inside lines uses `<em>` styled mint, not italic.

---

## 10. Stats & KPIs

### 10.1 Stat Tile
```css
background: var(--rm-surface);
border: 1px solid var(--rm-border);
border-radius: 6px;
padding: 16px 18px;
```
- Label: `JetBrains Mono` 9px tracking 0.15em UPPERCASE, color `--rm-muted`, margin-bottom 8px
- Value: 26px weight 700 tracking -0.02em
- Delta: 10px weight 600
  - `up`: color `--rm-green-deep` (▲)
  - `down`: color `--rm-red` (▼)

### 10.2 Energy KPI variant
For Creative Studio energy displays — same as stat tile but the value uses
`--rm-green-deep` color for emphasis.

---

## 11. Forms & Inputs

### 11.1 Field Label
```css
font-size: 12px;
font-weight: 600;
color: var(--rm-ink-2);
margin-bottom: 6px;
display: block;
```

### 11.2 Input / Textarea
```css
width: 100%;
padding: 10px 12px;
background: var(--ae-input-bg);  /* #faf8f4 */
border: 1px solid var(--rm-border);
border-radius: 4px;
font-family: var(--rm-font);
font-size: 13px;
color: var(--rm-ink);
transition: border-color 0.15s, background 0.15s;

&:focus {
  border-color: var(--rm-teal);
  background: var(--rm-surface);
}
```

Placeholder: `--rm-muted`. NEVER placeholder-only labels — always show label above.

---

## 12. Buttons

### 12.1 Primary (dark)
```css
background: var(--rm-ink);
color: #fff;
border: none;
padding: 9px 16px;
border-radius: 4px;
font-family: var(--rm-mono);
font-size: 11px;
letter-spacing: 0.1em;
font-weight: 700;
display: inline-flex; align-items: center; gap: 6px;
```
Hover: background `--rm-green-deep`.
Use for: "LANZAR CAMPAÑA", "PUBLICAR", main CTAs.

### 12.2 Authority (deep green)
```css
background: var(--rm-green-deep);
color: #fff;
/* same shape as primary */
```
Use for: most emphatic actions — "MÁS INFORMACIÓN" inside ads, "Confirmar".

### 12.3 Ghost
```css
background: var(--rm-surface);
color: var(--rm-ink);
border: 1px solid var(--rm-border);
padding: 7px 12px;
border-radius: 4px;
font-size: 12px;
font-weight: 500;
```

### 12.4 Active Press State
All buttons: `active:transform: scale(0.98)` with `transition: 0.15s`.

---

## 13. AI Badge (the "this is AI-generated" marker)

Small pill that signals AI activity:
```css
display: inline-flex; align-items: center; gap: 5px;
padding: 3px 8px; border-radius: 999px;
background: rgba(64,217,157,0.12);
color: var(--rm-green-deep);
font-family: var(--rm-mono);
font-size: 9px;
font-weight: 700;
letter-spacing: 0.1em;
```

Before pseudo-element: 5px pulsing teal dot with `ae-pulse` 1.6s animation.

Example uses: "AI ACTIVE", "4 GENERADOS", "CAMILORD ACTIVE".

---

## 14. Channel Pills

For showing distribution channels (Instagram, TikTok, Meta, WhatsApp):
```css
display: inline-flex; align-items: center; gap: 5px;
font-size: 10px; font-weight: 600;
padding: 3px 8px;
border-radius: 999px;
background: var(--rm-surface-3);
color: var(--rm-ink-2);
```

Channel icons go inline as inline SVG, 10x10px, currentColor stroke.

---

## 15. Status Indicators

### 15.1 Schedule Pills
- `SCHEDULED`: bg rgba(64,217,157,0.12), color `--rm-green-deep`
- `PENDING`: bg rgba(210,152,54,0.14), color `--rm-amber`
- `PAUSED`: bg rgba(193,79,58,0.12), color `--rm-red`
- `LIVE`: bg rgba(64,217,157,0.18), color `--rm-green-deep`, with pulsing dot

All use mono 9px tracking 0.12em UPPERCASE.

### 15.2 Live Status Dot
```css
width: 6px; height: 6px;
border-radius: 50%;
background: var(--rm-teal);
box-shadow: 0 0 8px var(--rm-teal);
animation: ae-pulse 1.6s ease-in-out infinite;
```

---

## 16. Charts & Data Visualization

### 16.1 Bar Chart
```css
.ae-bar {
  background: linear-gradient(180deg, var(--ae-energy-2), var(--ae-energy-4));
  border-radius: 3px 3px 0 0;
}
.ae-bar.muted {
  background: var(--ae-energy-1);  /* lightest, for low values */
}
```
Bars share a flex row, gap 4-6px, border-bottom: 1px solid `--rm-border` for axis.

### 16.2 Sparkline (inline trend)
- Width: 60-90px, height: 24-32px
- Stroke: `--rm-green-deep`, stroke-width 1.5
- Optional fill: `--rm-teal` at 8% opacity
- No axes, no labels, no tooltips

### 16.3 Chart.js Defaults
```js
Chart.defaults.font.family = 'Inter';
Chart.defaults.color = '#7a7e79';
Chart.defaults.scale.grid.color = 'rgba(232,227,220,0.6)';
Chart.defaults.scale.grid.drawBorder = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#0f1410';
Chart.defaults.plugins.tooltip.cornerRadius = 4;
Chart.defaults.plugins.tooltip.padding = 10;
```

Always destroy chart instances before recreating: `if(charts[id]) charts[id].destroy()`.

---

## 17. Decision Log Table

For the AI's decision history — what it paused, scaled, tested:

```css
.ae-log-row {
  display: grid;
  grid-template-columns: 90px 110px 1fr 140px 80px;
  gap: 14px; align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--rm-border);
  font-size: 12px;
}
.ae-log-row.head {
  font-family: var(--rm-mono); font-size: 9px; letter-spacing: 0.15em;
  color: var(--rm-muted); font-weight: 600; text-transform: uppercase;
  background: var(--rm-surface-2);
}
```

Columns: TIME · ACTION · TARGET · METRIC · STATUS

NO visible table borders (no `<table>`). Each row is a flex/grid div.

---

## 18. Animations

Restrained. Only transform and opacity. Always under 500ms.

```css
@keyframes ae-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(1.3); }
}

@keyframes ae-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes ae-feed-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Apply:
- `.ae-rise` to all top-level page content on load (200ms ease)
- `.ae-feed-in` to live feed lines as they arrive (150ms ease)
- `ae-pulse` to all live status dots
- Stagger card entrances with `animation-delay: 60ms * n`

Always wrap animations in:
```css
@media (prefers-reduced-motion: no-preference) { /* animations here */ }
```

---

## 19. Page Layout Patterns

### 19.1 Every Ad Engine Page Must Have
- **Eyebrow** above the title (mono uppercase 11px tracking 0.18em)
- **Editorial display title** using Instrument Serif italic for emphasis words
- **Subhead paragraph** (max 540px wide, `--rm-ink-2`)
- 24px gap before first content card
- 32px external margins on the canvas

### 19.2 Creative Studio Pattern
EYEBROW
Display title with italic accent
Subhead paragraph
[Energy Meter]                    [AI Recommendation]
[Form: Property Context]          [Phone Preview]
[Form: Visual Content]            (sticky/follows scroll)
[Form: Psychological Angles]
Grid: `1.5fr 1fr` for the two columns.

### 19.3 Dashboard / Parrilla Pattern
Breadcrumb (DASHBOARD > SCHEDULED POSTS)
Eyebrow
Display title
[Stat tiles row — 4 columns]
[Content card grid — Instagram | TikTok | Facebook | (+ new)]

### 19.4 History / Decision Log Pattern
Eyebrow
Display title
[Filters row — channel pills + date range]
[Decision log table]
[Live feed (terminal style)]

---

## 20. Component Class Reference

Quick-pick class names (all prefixed `.ae-` for Ad Engine specific, `.rm-` for shared with portal):

| Class | What it is |
|-------|------------|
| `.ae-app` | 3-column grid container |
| `.ae-rail` | Left 64px dark nav |
| `.ae-canvas` | Center main content area |
| `.ae-camilord` | Right 320px black AI panel |
| `.ae-topnav` | Horizontal top nav bar |
| `.ae-eyebrow` | Mono uppercase label |
| `.ae-display` | Editorial serif title |
| `.ae-display-prefix` | Italic green prefix span |
| `.ae-subhead` | Body subtitle |
| `.ae-formcard` | Standard white form container |
| `.ae-formcard-h` | Card header with title + accessory |
| `.ae-field-label` | Form field label |
| `.ae-input`, `.ae-textarea` | Form inputs |
| `.ae-energy` | Energy meter card |
| `.ae-energy-bars` | 4-segment bar grid |
| `.ae-reco` | Deep green recommendation card |
| `.ae-phone` | iOS phone mockup |
| `.ae-feed` | Terminal-style live feed |
| `.ae-stat` | KPI tile |
| `.ae-ai-badge` | Pulsing AI activity badge |
| `.ae-ch` | Channel pill |
| `.ae-launch-btn` | Primary "LAUNCH" button |
| `.ae-cam-quote` | Italic AI quote in panel |
| `.ae-log-row` | Decision log row |

---

## 21. Pre-Delivery Checklist

Before shipping ANY Ad Engine UI:

- [ ] No `#000000` except in `.ae-camilord` panel
- [ ] No `#ffffff` as page bg (use `--rm-bg`)
- [ ] No raw Tailwind color classes
- [ ] Inter for UI, Instrument Serif italic for editorial moments only
- [ ] JetBrains Mono on all eyebrows, IDs, timestamps, button labels
- [ ] Every page has eyebrow + display title + subhead
- [ ] All cards 6px radius, 1px border, XS shadow
- [ ] Camilord panel always present (320px right)
- [ ] AI badges pulse with mint dot
- [ ] Live status dots glow teal
- [ ] Buttons have `active:scale(0.98)` press feedback
- [ ] Forms: labels above inputs, never placeholder-only
- [ ] Inputs use `--ae-input-bg` (#faf8f4) not white
- [ ] Tables use card-row pattern, no `<table>` borders
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Touch targets ≥ 44×44px
- [ ] Contrast ≥ 4.5:1 on all text

---

## Quick Decision Tree

1. **Page background?** → `var(--rm-bg)` (#f6f3ee)
2. **Card background?** → `var(--rm-surface)` (#fff) with 6px radius + XS shadow
3. **Editorial moment?** → Instrument Serif italic + display-prefix pattern
4. **Data, ID, or timestamp?** → JetBrains Mono
5. **Primary CTA?** → `.ae-launch-btn` (ink bg) or deep green for emphatic
6. **AI presence?** → Mint pulsing dot + mono "ACTIVE" label
7. **Camilord speaking?** → Italic serif white text in dark panel card
8. **Status indicator?** → Mono 9-10px uppercase pill, semantic color
9. **Empty state?** → Eyebrow + serif italic title + outlined dashed area
10. **Showing AI working?** → Black terminal feed with colored tags