# RENTMIES STYLE EVOLUTION — Brand Guide Update + Dashboard Refactor Prompt
## From "Clean SaaS" to "Editorial Concierge" | 12 April 2026

---

# PART 1: UPDATED BRAND GUIDE (for `/mnt/skills/user/rentmies-brand-guide/SKILL.md`)

Replace the ENTIRE content of SKILL.md with the following:

---

```markdown
---
name: rentmies-brand-guide
description: >
  Rentmies brand identity, color palette, typography, component patterns, and design system for all frontend work,
  combined with UI/UX Pro Max design intelligence rules. ALWAYS use this skill when building any UI, page, component,
  artifact, landing page, dashboard, form, or visual element for Rentmies. Trigger on ANY mention of Rentmies, any
  reference to the Rentmies product, CRM, dashboard, landing page, or when the user asks to build/style/design
  anything related to the Rentmies platform. Also trigger when the user mentions "brand guide", "brand colors",
  "design system", "style guide", or "Pro Max" in a Rentmies context. If in doubt whether this skill applies,
  use it — it prevents off-brand output.
---

# Rentmies Brand & Design System v2.0 — "The Editorial Concierge"

## Creative Direction

Rentmies is NOT a generic SaaS. It is a **Digital Concierge for Real Estate**. The aesthetic is **Organic Editorialism** — think high-end architectural magazine meets AI-powered workspace. The UI must feel like a premium tool curating real estate intelligence, not a dashboard listing data.

### Three Pillars
1. **Gallery over Grid** — Tonal layering, asymmetric compositions, cinematic imagery. Never a rigid spreadsheet feel.
2. **AI as Protagonist** — EMA (the AI) is visually present: proactive insights, strategic recommendations, contextual tips. The AI speaks through the UI, not just in a chat box.
3. **No-Line Philosophy** — Section boundaries defined by background tonal shifts, not borders. Luxury is space. Crowded = cheap.

---

## 1. Color Palette — The "New Growth" Spectrum

### Core Action Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `brand-teal` | `#40d99d` | Primary CTAs, active states, success indicators, AI accent |
| `brand-mint` | `#4fffb4` | Hover glow, accent chips, micro-highlights |
| `authority-green` | `#006c4a` | Text emphasis, section labels, AI identity color |

### Surface System (Tonal Layering)
| Token | Hex | Usage |
|-------|-----|-------|
| `surface` | `#fcf9f8` | Page canvas (warm off-white, NEVER pure #fff for backgrounds) |
| `surface-dim` | `#dcd9d9` | Divider tone, disabled backgrounds |
| `surface-container-lowest` | `#ffffff` | Inner cards (Level 2 — sits on container) |
| `surface-container-low` | `#f6f3f2` | Insight blocks, sub-sections within cards |
| `surface-container` | `#f0eded` | Section backgrounds (Level 1) |
| `surface-container-high` | `#eae7e7` | Hover states on sections, subtle emphasis |
| `surface-container-highest` | `#e5e2e1` | Strong emphasis backgrounds |

### Text & Outline
| Token | Hex | Usage |
|-------|-----|-------|
| `on-surface` | `#1c1b1b` | Primary text (NEVER use #000000) |
| `on-surface-variant` | `#3c4a42` | Secondary text, descriptions |
| `muted` | `#6b7280` | Tertiary text, timestamps, metadata |
| `outline` | `#6c7a71` | Subtle icon strokes |
| `outline-variant` | `#bbcabf` | Ghost borders for form inputs (15% opacity) |

### Semantic States
| State | Color |
|-------|-------|
| Success | `#40d99d` |
| Error | `#dc2626` (red-600) |
| Warning | `#f59e0b` (amber-500) |
| Info | `#3b82f6` (blue-500) |
| Positive trend | `#40d99d` |
| Negative trend | `#dc2626` |

### PROHIBITED
- Pure `#000000` anywhere
- Pure `#ffffff` as page background (use `#fcf9f8`)
- Purple, indigo, violet, pink as primary accents
- Heavy saturated gradients as backgrounds
- Raw Tailwind color classes (`bg-gray-200`, `text-blue-500`) — always use brand tokens

---

## 2. The "No-Line" Rule — CRITICAL

**Explicit instruction: Do NOT use `border-gray-*`, `border-[#e5e5e5]`, `divide-y`, or any 1px solid border to separate sections or content blocks.**

### How to create visual separation:
- **Tonal shift:** A card (`surface-container-lowest`) sitting on a section (`surface-container`) creates natural distinction — like layers of fine paper.
- **Insight blocks:** Use `surface-container-low` background inside a card for AI insights, metadata, or secondary info.
- **Spacing:** 24-32px between sections. Luxury is space.

### When borders ARE acceptable:
- **Active/highlight states:** `ring-1 ring-brand-teal/30` on cards, `ring-2 ring-brand-teal` on focus
- **Form inputs:** Ghost border using `outline-variant` at 15% opacity, transitioning to `brand-teal/20` on focus
- **AI insight blocks:** A subtle `border-l-2 border-brand-teal` left accent stripe (the only decorative border allowed)
- **Navigation active state:** Left `border-l-2 border-brand-teal` indicator on sidebar items

---

## 3. Typography — Inter Editorial

Font: `Inter` exclusively. Loaded with weights 300-800.

### Dashboard/App Hierarchy
| Element | Class | Notes |
|---------|-------|-------|
| Page title | `text-3xl font-bold tracking-tight` | Letter-spacing: -0.02em. Display-level. |
| Section eyebrow | `text-[11px] font-bold uppercase tracking-[0.15em] text-authority-green` | Above page titles. e.g., "EXECUTIVE OVERVIEW" |
| Section title | `text-xl font-semibold` | 64px top margin to breathe |
| Card title | `text-base font-semibold text-on-surface` | |
| Body | `text-sm leading-relaxed text-on-surface` | Max 70 chars per line |
| Utility label | `text-[10px] font-bold uppercase tracking-widest text-muted` | Metadata headers: "SQUARE FOOTAGE", "LAST UPDATED" |
| Big metric | `text-4xl font-bold text-authority-green` | KPI numbers, percentages |
| Metric label | `text-[11px] uppercase tracking-widest text-muted` | Below metrics |

### AI Voice Typography
| Element | Class |
|---------|-------|
| AI insight header | `text-[11px] font-bold uppercase tracking-[0.15em] text-brand-teal` with ✦ icon |
| AI recommendation body | `text-base font-medium text-on-surface leading-relaxed` |
| AI proactive chip | `text-[10px] font-bold uppercase tracking-widest text-brand-teal` |

---

## 4. Shadows & Elevation

### The Layering Principle (tonal, not structural)
- **Level 0:** `surface` — the canvas
- **Level 1:** `surface-container` — section blocks
- **Level 2:** `surface-container-lowest` — cards sitting on sections

### Shadow Rules
| Token | Value | Usage |
|-------|-------|-------|
| `shadow-editorial` | `0 32px 64px -12px rgba(28,27,27,0.04)` | Cards at rest — barely visible, like morning light |
| `shadow-glow-active` | `0 0 20px 2px rgba(64,217,157,0.4)` | Active/highlighted cards, AI focus |
| `shadow-glow-subtle` | `0 0 12px 1px rgba(64,217,157,0.2)` | Hover state on interactive cards |
| `shadow-float` | `0 8px 32px -4px rgba(28,27,27,0.08)` | Floating elements (command bar, drawers) |

**NEVER:** `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` from default Tailwind. If it's visible at first glance, it's too heavy.

---

## 5. Component Patterns — The Editorial System

### A. Cards (The Core Element)
```
bg-surface-container-lowest rounded-xl shadow-editorial
hover:shadow-glow-subtle hover:ring-1 hover:ring-brand-teal/20
transition-all duration-200
```
- NO inner borders or dividers. Use tonal sub-sections instead.
- Padding: `p-6` standard, `p-8` for hero cards.
- Property cards: image (rounded-lg, aspect-video) + content side by side.

### B. AI Insight Block (Inside Cards)
```
bg-surface-container-low rounded-lg p-4
border-l-2 border-brand-teal
```
- Header: sparkle icon + "EMA INSIGHT" in `text-[10px] font-bold uppercase tracking-widest text-brand-teal`
- Body: italic text in `text-[13px] text-on-surface-variant leading-relaxed`

### C. AI Strategic Card (Full-Width)
```
bg-authority-green rounded-xl p-8 text-white
```
- Used for proactive recommendations from the AI
- Header: "SIGUIENTE ACCIÓN" eyebrow + bold recommendation text
- Action buttons inside: ghost white buttons

### D. Metric Tiles
```
bg-surface-container-lowest rounded-xl p-6
```
- Big number: `text-4xl font-bold text-authority-green`
- Label below: `text-[10px] uppercase tracking-widest text-muted`
- Trend indicator: `text-brand-teal text-sm font-bold` for positive, `text-red-500` for negative
- NO borders. The tonal shift from the section background is enough.

### E. Buttons
| Type | Classes |
|------|---------|
| Primary | `bg-brand-teal text-white rounded-lg px-6 py-3 font-semibold hover:bg-brand-teal/90 active:scale-[0.97] transition-all shadow-editorial` |
| Secondary | `bg-surface-container-lowest text-on-surface rounded-lg px-6 py-3 font-semibold hover:bg-surface-container transition-all` |
| Ghost | `text-brand-teal font-semibold hover:bg-brand-teal/5 rounded-lg px-4 py-2 transition-colors` |
| AI Action | `bg-authority-green text-white rounded-lg px-5 py-2.5 text-sm font-bold` |
| Chip/Tag | `bg-brand-teal/10 text-authority-green text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full` |

### F. Sidebar Navigation
- Width: `w-56` (expanded), `w-16` (collapsed)
- Background: `bg-surface` (same as page — seamless)
- Items: `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted`
- Active item: `bg-brand-teal/10 text-brand-teal border-l-2 border-brand-teal`
- Hover: `bg-surface-container text-on-surface`
- AI agent status at top: avatar + "EMA" + "PROACTIVE MODE: ACTIVE" in `text-[10px] uppercase text-brand-teal tracking-widest`
- Bottom: "+ New Listing" CTA button (full-width, brand-teal) + Settings + Support links

### G. Top Bar
- `bg-surface/80 backdrop-blur-xl` for glassmorphism
- Height: `h-16`
- Left: Brand name or page tabs
- Center: Search bar with `bg-surface-container rounded-full` and mic icon
- Right: Voice (Mic), Notifications (Bell), User avatar, "Inquire" CTA

### H. Tables (Property Lists, Agent Rosters)
- NO visible `<table>` borders. Use card-style rows.
- Each row: `bg-surface-container-lowest rounded-xl p-4 mb-3` — like stacked cards
- Column headers: `text-[10px] font-bold uppercase tracking-widest text-muted`
- Hover: `bg-surface-container` transition
- AI data inline: progress bars in `bg-brand-teal`, percentage badges

### I. Conversation View (The Neural Thread)
- Three-column layout: Active Roster (left sidebar) | Thread (center) | Context Panel (right)
- User messages: `bg-surface-container-lowest rounded-xl p-4 shadow-sm`
- AI messages: `bg-brand-teal/5 rounded-xl p-4 border-l-2 border-brand-teal`
- AI analysis blocks: dark card `bg-authority-green/90 text-white rounded-xl p-5` with "SARAH AI ANALYSIS" eyebrow
- Action chips below AI messages: row of buttons (Primary, Secondary, Ghost)
- Input bar at bottom: dark `bg-on-surface/95 backdrop-blur-2xl rounded-full` with text input + mic + send

### J. Form Inputs
```
bg-surface-container-low rounded-lg px-4 py-3
border border-transparent
focus:border-brand-teal/20 focus:ring-1 focus:ring-brand-teal/10
text-sm text-on-surface placeholder:text-muted
transition-all duration-200
```
- NO visible border at rest (just the tonal background)
- Focus: subtle brand-teal ghost border appears
- Labels: `text-[10px] font-bold uppercase tracking-widest text-muted mb-2`
- Validation success: checkmark icon in `text-brand-teal`

---

## 6. AI Presence Patterns

The AI (EMA) is NOT hidden in a chat box. It is woven into every view:

### Proactive Insights
- On Dashboard: full-width `bg-authority-green` card with strategic recommendation + action buttons
- On Portfolio: "EMA TIP" cards with italic insights about specific properties
- On Agent view: "Perspectiva de Sarah" floating card with coaching recommendations

### AI Status Indicator
- Sidebar: Agent avatar + "PROACTIVE MODE: ACTIVE" in green
- Can also show at bottom of sidebar: small avatar + status

### AI Action Chips
After any AI insight, always show 1-3 actionable chips:
- "Ejecutar Recomendación" (primary)
- "Ver Detalles" (secondary)
- "Descartar" (ghost text link)

### Voice Waveform
When voice is active, show animated bars:
```css
.waveform-bar {
  animation: wave 1.2s ease-in-out infinite;
}
@keyframes wave {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}
```
8 bars with staggered `animation-delay` (0.1s increments), alternating opacity.

---

## 7. Page Layout Patterns

### Dashboard (Resumen del Concierge)
```
[Eyebrow: "EXECUTIVE OVERVIEW" in authority-green]
[Title: "Panel de Analytics Inteligente" in text-3xl font-bold]
[Subtitle: description text]

[Row 1: AI Strategic Insight Card (2/3 width) | Metric Tile (1/3)]
[Row 2: Chart Card (2/3) | Inventory Status + AI Tip (1/3)]
[Row 3: "Propiedades Críticas" table — card-style rows]
```

### Portfolio (Curaduría Editorial IA)
```
[Eyebrow + Title + Description]
[Filter chips row: AI filter (brand-teal pill) + location + price range]
[Property cards: image left (w-1/3) | details center | price + AI metrics right]
[Pagination at bottom]
```

### Conversation (The Neural Thread)
```
[Three columns: Roster | Thread | Context]
[Roster: contact cards with sentiment + priority badges]
[Thread: messages with AI analysis blocks interspersed]
[Context: Property focus card + Negotiation levers + One-tap actions + Market alert]
```

---

## 8. Animation & Motion

| Type | Duration | Easing | Properties |
|------|----------|--------|------------|
| Hover | 200ms | ease-out | transform, opacity, box-shadow |
| Page transition | 300ms | ease-out | opacity, transform(y) |
| Card stagger | 100ms delay per card | spring(damping:22) | opacity, y |
| AI insight appear | 400ms | spring | opacity, y, scale |
| Voice pulse | 2s infinite | ease-in-out | box-shadow |

Respect `prefers-reduced-motion`. Only animate `transform` and `opacity` — never width, height, top, left.

---

## 9. Icon Rules

- **Library:** lucide-react ONLY. Import individually.
- **Stroke:** `strokeWidth={1.5}` — thin editorial feel, never thick/rounded "friendly" icons
- **Sizes:** `w-4 h-4` compact, `w-5 h-5` default, `w-6 h-6` nav
- **Colors:** `text-muted` default, `text-brand-teal` active, `text-on-surface` emphasized
- **AI sparkle:** Use `Sparkles` icon from lucide for all AI-related markers
- **NEVER:** emoji as icons, Material Symbols, thick rounded icons, decorative icons without function

---

## 10. Tech Stack

```
Framework:      Next.js 14 + React 18 + TypeScript
Styles:         Tailwind CSS (brand overrides in tailwind.config.ts)
State:          Zustand (portal agent store)
Data:           @tanstack/react-query + Supabase
Components:     shadcn/ui (brand overrides always)
Icons:          lucide-react (SVG, strokeWidth 1.5)
Font:           Inter (Google Fonts, 300-800)
Animation:      Framer Motion
Notifications:  sonner
Dates:          date-fns (locale es)
Charts:         recharts (brand-teal palette)
DnD:            @hello-pangea/dnd
```

---

## 11. Pre-Delivery Checklist

Before shipping ANY Rentmies UI:

**No-Line Check:** Zero `border-gray-*` dividers. All separation via tonal backgrounds.
**AI Presence:** Every view has at least one EMA insight, tip, or status indicator.
**Typography:** Eyebrow labels present on all page titles. Metrics use utility label pattern.
**Shadows:** Only editorial/glow/float shadows. Zero default Tailwind shadows.
**Colors:** No #000000, no pure #ffffff backgrounds, no raw Tailwind colors.
**Icons:** All lucide-react, strokeWidth 1.5, proper sizes.
**Spacing:** Generous. When in doubt, add more space. 24-32px between sections minimum.
**Accessibility:** Contrast ≥4.5:1, aria-labels, keyboard nav, focus rings in brand-teal.
**Touch:** 44×44px targets, press feedback (active:scale-[0.97]) on all buttons.
**Mobile:** 375px tested, no horizontal scroll, responsive layouts.
```

---

# PART 2: DASHBOARD REFACTOR PROMPT FOR CLAUDE CODE

Copy everything below this line and feed it to Claude Code as the refactoring instruction.

---

```markdown
# RENTMIES DASHBOARD STYLE REFACTOR — "Editorial Concierge" Upgrade
## For Claude Code | Execute in Order

You are refactoring the Rentmies dashboard from its current "clean SaaS" look to the "Editorial Concierge" aesthetic. This is a STYLE-ONLY refactor — no backend changes, no new API routes, no database changes. Every page keeps its existing functionality but gets a visual upgrade.

Read the brand guide at `/mnt/skills/user/rentmies-brand-guide/SKILL.md` FIRST. It is the single source of truth for every design decision.

## WHAT CHANGES

### Global Changes (Do First)
1. **tailwind.config.ts** — Add the new surface color tokens, shadows, and animations from the brand guide. MERGE with existing config, don't replace.
2. **app/globals.css** — Add: `.hide-scrollbar` utility, `.waveform-bar` animation, update CSS variables to include new surface tokens.
3. **app/layout.tsx** — Change body class from `bg-background` to `bg-surface` (#fcf9f8).

### Sidebar (`components/dashboard/sidebar.tsx`)
- Background: `bg-surface` (seamless with page, not white)
- Add EMA agent status block at top: Sparkles icon + "EMA" + "PROACTIVE MODE: ACTIVE" in brand-teal uppercase
- Nav items: Remove all `border` classes. Use `rounded-lg` items with `text-muted` default
- Active item: `bg-brand-teal/10 text-brand-teal font-medium` — NO border, tonal shift only
- Hover: `bg-surface-container text-on-surface`
- Bottom: "+ New Listing" CTA in brand-teal full-width button. Settings and Support links below.
- Remove any `border-r` or `divide-y` separators between sections

### Top Bar (`components/dashboard/topbar.tsx`)
- Background: `bg-surface/80 backdrop-blur-xl`
- Remove `border-b`. The glassmorphism blur provides enough visual separation.
- Add search bar: `bg-surface-container rounded-full px-4 py-2` with Search icon + Mic icon
- Right side: Bell (notifications), UserCircle (avatar), "Inquire" CTA button

### Dashboard Page (`app/(dashboard)/dashboard/page.tsx`)
- Add eyebrow: `text-[11px] font-bold uppercase tracking-[0.15em] text-authority-green` saying "EXECUTIVE OVERVIEW"
- Page title: `text-3xl font-bold tracking-tight text-on-surface`
- Add AI Strategic Insight card: full-width `bg-authority-green text-white rounded-xl p-8` with:
  - Sparkles icon + "EMA STRATEGIC INSIGHT" eyebrow
  - Bold headline insight text
  - Two action buttons: "Ejecutar Recomendación" (white bg) + "Ver Detalles del Lead" (white/20 bg)
- Metric tiles: Remove all borders. Use `bg-surface-container-lowest rounded-xl p-6 shadow-editorial`
- Big numbers: `text-4xl font-bold text-authority-green`
- Labels: `text-[10px] uppercase tracking-widest text-muted`
- Charts: Replace any border-enclosed charts with cards using tonal backgrounds
- Add "Tip de EMA" card in the sidebar area: `bg-surface-container-low rounded-xl p-5` with sparkle icon + italic insight text

### CRM/Kanban (`components/crm/kanban-board.tsx`)
- Column headers: `text-[10px] font-bold uppercase tracking-widest text-muted`
- Column backgrounds: `bg-surface-container rounded-xl`
- Cards: `bg-surface-container-lowest rounded-xl p-4 shadow-editorial`
- Remove all `border` classes from cards. Hover: `shadow-glow-subtle`
- Drag handle: subtle `text-muted/30`
- Stage colors: Use brand-teal for active stages, authority-green for won, red for lost

### Conversations Page (`app/(dashboard)/conversaciones/page.tsx` + related components)
This is the biggest visual change. Transform from basic chat into "The Neural Thread":

**Three-column layout:**
- Left (w-80): Active conversations list. Each conversation card: `bg-surface-container-lowest rounded-xl p-4 mb-2`. Active: `shadow-glow-active ring-1 ring-brand-teal/30`. Show contact name, last message preview, sentiment badge, priority indicator.
- Center (flex-1): Message thread. 
  - User messages: `bg-surface-container-lowest rounded-xl p-4`
  - AI/Agent messages: `bg-brand-teal/5 rounded-xl p-5 border-l-2 border-brand-teal`
  - AI analysis blocks (when EMA provides insights): `bg-authority-green/90 text-white rounded-xl p-5` with "EMA AI ANALYSIS" eyebrow
  - After AI messages: action chips row ("Execute Strategy", "Fine-tune Response", "Schedule Tour")
  - Input bar at bottom: `bg-on-surface/95 backdrop-blur-2xl rounded-full p-2` with text input + mic + send
- Right (w-80): Context panel.
  - Property focus card (if conversation references a property)
  - Negotiation levers / lead info
  - "One-tap Actions" list: buttons for "Draft Contract", "Schedule Tour", "Verify Funds"
  - Market alert card: `bg-surface-container rounded-xl p-4` with alert icon

### Agents/Team Page (`app/(dashboard)/empresa/page.tsx`)
- Add eyebrow: "EXECUTIVE MANAGEMENT"
- Title: "Gestión de Agentes" in `text-3xl font-bold tracking-tight`
- Add summary card: `bg-surface-container rounded-xl p-6` with "Colaboración IA-Humano" metrics (efficiency %, daily hours saved)
- Add AI action card: `bg-authority-green text-white rounded-xl p-6` with "SIGUIENTE ACCIÓN" recommendation
- Agent rows: card-style (not table rows). Each agent: avatar + name + role + performance bar (brand-teal) + AI support level dots + action button
- AI coaching cards: floating `bg-surface-container-lowest rounded-xl shadow-float p-4` with "Perspectiva de EMA" insights

### Settings/Config Page
- Add eyebrow chip: `bg-brand-teal/10 text-authority-green rounded-full px-4 py-1 text-[11px] font-bold uppercase`
- Section cards: `bg-surface-container-lowest rounded-xl p-6`
- Inside cards: NO borders between fields. Use spacing (24px gap) and tonal sub-sections
- Color picker/brand section: Show color swatch + hex input
- AI voice tone selector: Three cards (Autoritario, Diplomático, Dinámico) as selectable tiles
- Language complexity slider: horizontal slider with "CONVERSACIONAL" ↔ "ACADÉMICO" labels

### Analytics Page
- Full metric tiles with big numbers in `text-4xl font-bold text-authority-green`
- Charts in cards with `shadow-editorial`
- AI commentary below charts: "Tip de EMA" blocks
- Lead distribution chart: use brand-teal gradient bars
- Remove all visible grid lines from charts, keep only essential axis labels

### Property Inventory (empresa/inventario-tab)
- Property list as card rows (like Portfolio view): image left + details center + price right
- Add AI metrics per property: "Potencial de Cierre" progress bar + "ROI Estimado" badge
- "Preguntar a EMA" floating action button in bottom-right

## EXECUTION ORDER

1. tailwind.config.ts + globals.css (tokens, shadows, animations, utilities)
2. app/layout.tsx (body bg)
3. sidebar.tsx (EMA status, nav styling, no-line)
4. topbar.tsx (glassmorphism, search, no border)
5. Dashboard page (eyebrow, AI insight card, metric tiles)
6. Conversations page (three-column Neural Thread)
7. CRM kanban (tonal cards, no borders)
8. Agents page (card rows, AI coaching)
9. Analytics page (editorial metrics, AI tips)
10. Settings page (editorial forms, AI voice config)
11. Full typecheck: `npx tsc --noEmit`
12. Build: `npm run build`

## RULES DURING REFACTOR

- NEVER add new dependencies. Everything needed is already installed.
- NEVER change API routes, database queries, or backend logic.
- NEVER delete existing functionality. This is visual only.
- Every `border-gray-*`, `divide-y`, `border-[#e5e5e5]` you find → REMOVE and replace with tonal background or spacing.
- Every `shadow-sm`, `shadow-md` → replace with `shadow-editorial`.
- Every `bg-white` page background → replace with `bg-surface`.
- Every `#000000` → replace with `text-on-surface` (#1c1b1b).
- Every page gets an eyebrow label above the title.
- Every page gets at least one AI insight/tip element.
- Typecheck after EACH file change.
```
