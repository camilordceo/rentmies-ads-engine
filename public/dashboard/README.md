# Rentmies AdEngine AI — Dashboard (FASE 1-3 complete)

Premium Editorial B2B dashboard built greenfield in `public/dashboard/`.
Vercel serves it at `/dashboard`. The original `/app` route remains
untouched and continues hosting the working IG/FB publishing,
multi-post scheduling, and Meta credentials flows.

## Quick start

- Live at `https://rentmies-ads-engine.vercel.app/dashboard`
- All assets are static — no build step required
- Auth state is shared with `/app` via `localStorage.sb_token`

## Pages

| Route | What it is |
|-------|------------|
| `#studio`   (default) | Creative Studio — energy meter, AI recommendations, property form, photo grid, psychological angles, live phone preview |
| `#dashboard` | Parrilla de Contenidos — scheduled posts grid with Camilord optimization blocks |
| `#history`  | Decision Log — auditable AI actions table + drawer + live terminal feed |
| `#analytics` | Performance dashboard — KPIs, daily stacked bar, channel CTR, decision impact table |

## Keyboard shortcuts

| Combo | Action |
|-------|--------|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘N` | Studio (new campaign) |
| `⌘D` | Dashboard / Parrilla |
| `⌘H` | History |
| `⌘A` | Analytics |
| `⌘/` | Toggle Camilord panel |
| `ESC` | Close any modal / drawer / palette |

## Design system

Source of truth: `.claude/skills/ads-engine-brand/SKILL.md`

- **Surfaces**: warm off-white system. Page bg `#f6f3ee`. Cards `#fff`.
  Pure black ONLY in the Camilord panel.
- **Type**: Inter (UI body) · Instrument Serif italic (editorial moments) ·
  JetBrains Mono (data, IDs, timestamps)
- **Brand**: `--rm-teal #40d99d` (active/AI presence) · `--rm-green-deep
  #004d35` (authority CTAs) · `--rm-mint #4fffb4` (hover glow on dark)
- **Shadows**: XS only (`0 1px 2px rgba(15,20,16,0.04)`). Never above 8% opacity.

CSS files (`public/dashboard/css/`):

```
tokens.css        variables, animations, a11y utilities, focus rings
typography.css    .ae-display / .ae-eyebrow / .ae-subhead / mono utilities
layout.css        .ae-app 3-column grid + main canvas wrapper
rail.css          left 64px dark nav with active accent
topnav.css        horizontal nav, search, launch CTA
camilord.css      pure black AI panel + insight cards + feedback list
buttons.css       .ae-btn-primary | -authority | -ghost | -icon | .ae-launch-btn
cards-forms.css   .ae-formcard | -h | inputs | stats | AI badge | channels | status
studio.css        Creative Studio layout, energy meter, photo grid, angles
phone.css         iOS phone preview mockup with live update
launch.css        slide-over wizard
toast.css         top-right notification stack
dashboard.css     parrilla post grid + KPI row
history.css       decision log table + slide drawer
feed.css          black terminal AI feed
analytics.css     performance dashboard + impact table
responsive.css    mobile breakpoints + FAB
states.css        empty + skeleton + thinking
kbd.css           command palette + .ae-kbd chips
```

JS modules (`public/dashboard/js/`, vanilla — no build):

```
toast.js          rmToast(message, kind, opts)
store.js          single source of truth + computeEnergy + persistence
persist.js        rmPersistCampaign() — Supabase or localStorage
router.js         hash routing + page-change events
data-bridge.js    rmData.listCampaigns / listAiLogs (server → local fallback)
auth.js           soft session check + avatar + sign-out wiring
energy.js         reactive energy meter
reco.js           priority-ordered AI recommendation
property-form.js  description + price + location, focus-safe
photos.js         photo grid + upload + drag-reorder
angles.js         psychological angles with unlock predicates
phone.js          live phone preview (sticky right column)
camilord-brain.js studio-mode quote + suggestions reactive to form state
camilord-modes.js panel template swap by page (studio/dashboard/history/analytics)
launch.js         3-step wizard (channels → budget → review)
dashboard.js      parrilla render
history.js        decision log + drawer
feed.js           live terminal stream (mock; rmFeedAppend/Remount API)
analytics.js      KPIs + lazy-loaded Chart.js
mobile.js         hamburger + Camilord FAB injection
states.js         rmStates.empty / skeleton / thinking + presets
kbd.js            ⌘K palette + global shortcuts
```

## Backend

API endpoint added in step 29: `POST /api/campaigns?action=create` and
`GET ?action=list | ?action=ai-logs`.

Required Supabase tables — provision via `docs/supabase-schema.sql`:

- `ad_campaigns` — campaigns with prompt_config + platforms + budget + schedule
- `ad_ai_logs` — every Camilord action with reasoning + metric trigger
- `ad_performance_logs` — daily aggregates per campaign per channel

Until the SQL is run, every page falls back to localStorage drafts +
mock data so the demo reads as live.

## Accessibility

- Skip-to-content link at top (becomes visible on Tab focus)
- All icon-only buttons carry `aria-label`
- Rail has `role="navigation"`, Camilord has `role="complementary"`,
  main canvas has `role="main"`
- `:focus-visible` ring is a 2px teal outline at 2px offset on every
  interactive element
- All animations wrapped in `prefers-reduced-motion: no-preference`,
  with a global override that kills animation/transition durations
  when the user prefers reduced motion
- All touch targets ≥ 44×44px on mobile (`<768px` breakpoint)
- Color contrast targets ≥ 4.5:1 on body text

## Performance

- Chart.js lazy-loaded only when Analytics page is opened (~80kb saved
  on every other page's first paint)
- Google Fonts preconnect + `font-display: swap` (Inter / Instrument
  Serif italic / JetBrains Mono)
- All form input handlers debounced via the store's 300ms persist
- Live feed FIFO at 50 lines so the DOM doesn't grow unbounded
- Charts always destroyed before recreate to prevent memory leaks

## Manual screenshot checklist

(Auto-screenshot isn't available from the build environment — please
take these manually after deploy and commit to `docs/`):

- [ ] `docs/01-creative-studio.png` — `/dashboard#studio` desktop
- [ ] `docs/02-dashboard-parrilla.png` — `/dashboard#dashboard`
- [ ] `docs/03-history-decisions.png` — `/dashboard#history`
- [ ] `docs/04-analytics.png` — `/dashboard#analytics`
- [ ] `docs/05-camilord-panel.png` — close-up of the right panel
- [ ] `docs/06-mobile.png` — `/dashboard` at iPhone SE width (375px)

## What's next (FASE 4+)

- Migrate working features from `/app` → `/dashboard`:
  Quick Post, Campañas multi-post, WhatsApp Templates, Settings
- Wire Camilord chat input to OpenAI Responses with tools
- Run `docs/supabase-schema.sql` and switch from mock data to real
  Supabase queries (data-bridge.js already handles the swap)
- Switch Vercel entry point from `/app` to `/dashboard` once parity
  is reached
