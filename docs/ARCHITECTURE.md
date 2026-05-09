# Rentmies Ads Engine — Architecture

This document is the source of truth for how Rentmies Ads Engine is
organized after the Bloque 1 multi-channel restructure (Mayo 2026).
Read this before touching the dashboard or adding a new feature.

> If you're new and just want to ship: skim `## Adding a fourth
> channel` at the bottom of this doc. The steps there cover ~80% of
> the patterns.

## Why multi-channel

The dashboard used to assume a single ad channel: Meta. The whole
publishing path, every endpoint, the entire visual system was tuned
for Facebook + Instagram. That's strategically fragile — if Meta
changes pricing or suspends an account, every customer of Rentmies
loses service the same day.

The restructure adds three channels as first-class siblings:
**WhatsApp Business** (templates + broadcasts), **Google Ads**
(Search + Display + Performance Max + Lead Forms), and **TikTok**
(scaffolded for a later block). Each channel owns its own folder,
its own database namespace, its own health check, its own page
modules, and its own slice of the API surface.

## Folder layout

```
ads-generator/
├── api/
│   ├── _lib/
│   │   └── auth.js                Shared: getServiceClient + authedEmpresa + cors
│   ├── auth/                      Legacy Meta OAuth flow (preserved)
│   ├── credentials/               Legacy /api/credentials/meta family (preserved)
│   ├── google/
│   │   ├── connection.js          GET status of google_connections
│   │   ├── oauth/{start,callback}.js
│   │   └── campaigns/{list,create}.js
│   ├── whatsapp/
│   │   ├── templates/{list,create}.js
│   │   └── broadcasts/{list,create,start}.js
│   ├── tiktok/
│   │   ├── connection.js
│   │   ├── oauth/{start,callback}.js
│   │   └── videos/list.js
│   ├── posts/                     Legacy Meta publish (kept; will namespace later)
│   ├── ai.js, generate.js, social-post.js, ...   Legacy single-channel endpoints
│   └── health.js, data.js
│
├── public/
│   ├── app/                       Legacy /app dashboard — DO NOT TOUCH
│   └── dashboard/                 Current /dashboard
│       ├── index.html             Shell · 4 channels in topbar · 16+ <section>s
│       ├── README.md              Dashboard reference for devs
│       ├── css/
│       │   ├── tokens.css, typography.css, layout.css        Foundation
│       │   ├── topnav.css, rail.css, camilord.css            Shell chrome
│       │   ├── buttons.css, cards-forms.css, working-pages.css   Element styles
│       │   ├── studio.css, dashboard.css, history.css, ...   Page-specific
│       │   ├── connect-wizard.css                            Wizard
│       │   └── shared/
│       │       └── components.css                            Reusable component CSS (.rmc-)
│       └── js/
│           ├── core/
│           │   └── health.js                                 Health registry + pill
│           ├── shared/
│           │   ├── api-client.js                             window.rmApi (auth + fetch)
│           │   └── components.js                             window.rmc (StatTile, etc.)
│           ├── camilord/
│           │   └── modes.js                                  Channel-aware mode registry
│           ├── meta/                                         (target — files still in flat js/)
│           ├── whatsapp/
│           │   └── health.js
│           ├── google/
│           │   └── health.js
│           ├── tiktok/
│           │   └── health.js
│           ├── router.js, content-subnav.js, coming-soon.js  Channel-aware navigation
│           ├── camilord-modes.js (renderer)                  Reads camilord/modes.js
│           ├── page-quickpost.js, page-settings.js, ...      Existing page modules (Meta-flavored)
│           ├── meta-health.js                                Meta-specific banner
│           └── MIGRATION_PLAN.md                             Per-file migration plan
│
├── supabase/
│   ├── schema-auth-credentials.sql
│   ├── schema-meta-oauth.sql
│   ├── schema-multichannel.sql                               WhatsApp + Google + TikTok tables
│   └── schema-wompi.sql
│
└── docs/
    └── ARCHITECTURE.md                                       This file
```

## Database namespacing

Every new table is prefixed by channel. This makes ownership
obvious and prevents accidental cross-channel joins from leaking
state between teams.

| Channel  | Tables |
|---|---|
| WhatsApp | `whatsapp_templates`, `whatsapp_broadcasts`, `whatsapp_broadcast_recipients` |
| Google   | `google_connections`, `google_campaigns`, `google_lead_forms`, `google_leads` |
| TikTok   | `tiktok_connections`, `tiktok_videos` |

Plus the cross-channel view `channel_health_summary` which joins
each channel's connection state for a single dashboard query.

All new tables are RLS-enabled. The frontend NEVER queries them
directly — only `/api/{channel}/*` endpoints (running with
`SUPABASE_SERVICE_KEY`) read or write.

## API surface

Endpoints follow `/api/{channel}/{resource}/{action}`:

```
/api/meta/*                  (TBD — endpoints currently under /api/posts, /api/credentials/meta)
/api/whatsapp/templates/list           GET
/api/whatsapp/templates/create         POST   (501 stub · Bloque 2)
/api/whatsapp/broadcasts/list          GET
/api/whatsapp/broadcasts/create        POST   (501 stub · Bloque 2)
/api/whatsapp/broadcasts/start         POST   (501 stub · Bloque 2)
/api/google/connection                 GET
/api/google/oauth/start                GET    (302 placeholder)
/api/google/oauth/callback             GET    (501 stub · Bloque 3)
/api/google/campaigns/list             GET
/api/google/campaigns/create           POST   (501 stub · Bloque 3)
/api/tiktok/connection                 GET
/api/tiktok/oauth/{start,callback}     GET    (placeholders)
/api/tiktok/videos/list                GET
/api/health/*                          (existing)
/api/credentials/meta/*                (existing — kept for back-compat)
```

Legacy single-channel endpoints (`/api/whatsapp?action=templates`,
`/api/social-post`, etc.) keep responding so the existing /app
surface works. They will be redirected (301) to their namespaced
equivalents once every dashboard caller has migrated. **Do not
remove a legacy endpoint without grepping the codebase first.**

## Health checks

Each channel ships a `health.js` module that polls its connection
state. They all push results into a global registry:

```js
window.rmHealthRegistry.set('whatsapp', { health: 'healthy', label: '...' })
window.rmHealthRegistry.subscribe(fn)
window.rmHealthRegistry.get('google')
window.rmHealthRegistry.all()
```

`js/core/health.js` owns the registry and renders a single
top-right pill that opens a popover when ANY non-Meta channel
needs attention. Meta keeps its own full-width red banner (see
`js/meta-health.js`) because Meta token failures block publishing
TODAY for most users — that severity warrants a separate channel.

## Camilord (the right panel)

The panel content lives in two layers:

1. **`js/camilord/modes.js`** — content registry. One mode per
   page id, each with `{ channel, eyebrow, intro, feedTitle, feed }`.
   This is the most-edited file in the panel system; isolating
   content here keeps the renderer stable.

2. **`js/camilord-modes.js`** — renderer. Consumes the registry,
   draws the panel chrome, applies a channel-themed accent color
   to the eyebrow pill, and wires the tab buttons.

When the user navigates between channels, the body gets a
`rm-channel-{name}` class (set by `router.js`) so CSS can react
without JS.

## Shared components

`window.rmc` exposes pure HTML-string factories for components used
across pages:

| Function | Purpose |
|---|---|
| `rmc.statTile(opts)`     | KPI card |
| `rmc.statusPill(opts)`   | Traffic-light pill (ok/warn/off/busy) |
| `rmc.aiBadge(label)`     | Pulsing teal dot + label |
| `rmc.channelCard(opts)`  | Channel summary with stats + CTA |
| `rmc.emptyState(opts)`   | Empty/coming-soon state |
| `rmc.liveFeed(opts)`     | Terminal-style activity feed |
| `rmc.skeleton(opts)`     | Skeleton loading rows |

CSS uses the `.rmc-` namespace — no conflicts with `.rp-` or
`.ae-`. New pages SHOULD prefer these primitives over rolling
their own card / pill / empty state styles.

## Adding a fourth channel

This is the test. If adding LinkedIn or Pinterest takes more than
a day, the abstraction failed. Steps:

1. **Topbar + router**
   - Add `linkedin: { default, pages }` to `CHANNELS` in `js/router.js`
   - Add the topbar button: `<button data-channel="linkedin">LinkedIn</button>`
   - Add new page sections (`<section data-page="linkedin-...">`) to `index.html`
   - Add the channel and its sub-routes to `CHANNEL_NAVS` in `js/content-subnav.js`

2. **Database**
   - Create `supabase/schema-linkedin.sql` (or extend schema-multichannel)
   - Add `linkedin_connections`, `linkedin_campaigns`, etc.
   - Update `channel_health_summary` view to include LinkedIn

3. **API**
   - Create `api/linkedin/connection.js`
   - Create `api/linkedin/oauth/{start,callback}.js`
   - Create `api/linkedin/{resource}/{action}.js` per feature

4. **Health**
   - Create `js/linkedin/health.js` mirroring the WhatsApp/Google patterns
   - Add `<script src="js/linkedin/health.js" defer>` to index.html

5. **Settings**
   - Add a card in `js/page-settings.js` (`linkedinCardHtml()`) and
     register it in `mount()` along with `loadLinkedInConnection()`
   - Add the channel to the overview tile row

6. **Camilord**
   - Add the LinkedIn channel theme to `CHANNEL_THEMES` in
     `js/camilord/modes.js`
   - Add per-page modes for each LinkedIn sub-route

7. **Coming-soon stubs (optional)**
   - Add LinkedIn entries to `STUBS` in `js/coming-soon.js` if you
     ship the routing before the page modules

The legacy `/app` directory does NOT need to learn about the new
channel — it stays Meta-only by design.

## What NOT to do

- **Never put new content in `public/app/*`.** That's the legacy
  baseline. Adding multi-channel features there forks the codebase
  in two and history shows the legacy fork wins on bug fixes only,
  losing on features.
- **Never share state between channels in tables that aren't
  designed for it.** A WhatsApp broadcast row should not reference
  a `google_lead_forms.id`. If you need a join, it's a separate
  bridge table (e.g., `cross_channel_leads`).
- **Never replace `Bearer demo_*` auth bypass without coordinating
  with /app.** That bypass is how /app sends requests today; if
  you remove it, the legacy surface breaks until /app migrates.
- **Don't reorder the `<script defer>` block in `index.html`
  without re-checking globals.** Several modules depend on
  `window.rmStore`, `window.rmInmuebles`, `window.rmApi`, etc.,
  being available — defer preserves order, but only if the order
  is correct in the first place.

## Useful greps

```bash
# Where is channel X's data fetched on the client?
rg -n "fetch\\('/api/{channel}/" public/dashboard/

# Which page modules read meta_creds directly?
rg -n "localStorage.getItem\\('meta_creds'" public/dashboard/

# Endpoints that still use the legacy auth pattern
rg -n "authedEmpresa" api/ -l
```
