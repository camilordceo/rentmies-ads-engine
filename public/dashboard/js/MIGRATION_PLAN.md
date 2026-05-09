# JS Module Migration Plan

The dashboard is mid-migration from a flat `js/` directory to a channel-first
modular structure. New work should land in the right folder; legacy modules
stay where they are until they're rewritten or paired with a sibling that
calls the same APIs (see "Defer-order risk" below).

## Target structure

```
public/dashboard/
├── js/
│   ├── core/         router, auth, page lifecycle helpers, api client wrappers
│   ├── meta/         quickpost, schedule, inmuebles, posts-history, page-settings
│   ├── whatsapp/     templates, broadcasts, broadcast recipients, analytics, health
│   ├── google/       campaigns, performance-max, lead-forms, oauth, health
│   ├── tiktok/       videos, schedule, analytics, oauth, health
│   ├── camilord/     panel contextual por canal (modes, brain, channel-aware)
│   └── shared/       api-client, components, formatters, channel-subnav
└── css/
    ├── core/
    ├── meta/
    ├── whatsapp/
    ├── google/
    └── shared/
```

## Where each existing file *will eventually* live

| Current path                          | Target path                                  | Notes |
|---|---|---|
| js/router.js                          | js/core/router.js                           | Channel-aware, slash-hashes |
| js/auth.js                            | js/core/auth.js                             |  |
| js/toast.js                           | js/shared/toast.js                          |  |
| js/store.js                           | js/shared/store.js                          | Studio mock |
| js/persist.js                         | js/shared/persist.js                        |  |
| js/data-bridge.js                     | js/shared/data-bridge.js                    |  |
| js/inmuebles-source.js                | js/meta/inmuebles-source.js                 | Used by quickpost + inmuebles + campaign builder |
| js/upload-asset.js                    | js/shared/upload-asset.js                   |  |
| js/csv-import.js                      | js/shared/csv-import.js                     | Reused by WA broadcasts |
| js/meta-health.js                     | js/meta/health.js                           |  |
| js/page-quickpost.js                  | js/meta/page-quickpost.js                   |  |
| js/page-settings.js                   | js/meta/page-settings.js                    | Will split into per-channel cards |
| js/page-connect-wizard.js             | js/meta/page-connect-wizard.js              |  |
| js/connect-prompt.js                  | js/meta/connect-prompt.js                   |  |
| js/page-posts-history.js              | js/meta/page-posts-history.js               |  |
| js/page-inmuebles.js                  | js/meta/page-inmuebles.js                   |  |
| js/page-whatsapp.js                   | js/whatsapp/page-templates.js               | Rename when moved |
| js/page-campaign-builder.js           | js/meta/page-campaign-builder.js            |  |
| js/dashboard.js                       | js/core/dashboard.js                        | Cross-channel overview |
| js/history.js                         | js/meta/history.js                          | Mock — preview |
| js/feed.js                            | js/meta/feed.js                             | Mock — preview |
| js/analytics.js                       | js/meta/analytics.js                        | Mock — preview |
| js/mobile.js, states.js, kbd.js       | js/shared/{mobile,states,kbd}.js            |  |
| js/energy.js, reco.js, etc.           | js/meta/studio/*.js                         | Studio internals |
| js/launch.js                          | js/meta/launch.js                           | Studio launch wizard |
| js/phone.js                           | js/shared/phone.js                          | Reused for previews |
| js/camilord-brain.js                  | js/camilord/brain.js                        |  |
| js/camilord-modes.js                  | js/camilord/modes.js                        | Channel-aware modes |
| js/camilord-quickpost.js              | js/camilord/quickpost-mode.js               |  |
| js/property-form.js, photos.js, angles.js | js/meta/studio/*.js                     |  |
| js/content-subnav.js                  | js/shared/channel-subnav.js                 | Already handles all 4 channels |
| js/coming-soon.js                     | js/shared/coming-soon.js                    | Renders stub pages |

## New files in this PRD's Bloque 1

* `js/shared/api-client.js` — auth headers + fetch wrapper (DRY)
* `js/shared/components.js` — StatTile, StatusPill, AIBadge, ChannelCard, EmptyState, LiveFeed
* `js/whatsapp/health.js` — WABA health check (mirrors meta-health pattern)
* `js/google/health.js` — Google Ads OAuth health
* `js/tiktok/health.js` — TikTok token health
* `js/core/health.js` — orchestrator across all 4 channels
* `js/camilord/modes.js` — refactor of camilord-modes with per-channel state

## Defer-order risk

`<script defer>` execution order is preserved by the browser. Today the
order is set in `index.html` and several modules depend on globals being
available (e.g., `inmuebles-source.js` exposes `window.rmInmuebles` that
`page-quickpost.js` reads). **Moving an existing file to a sub-folder
requires updating the `src=""` in `index.html`** — it does not break order
by itself, but every move is a chance to forget a dependency.

Migration policy:
1. New files always land in the right folder. Add the new `<script>` tag
   in `index.html` near related modules.
2. Old files stay until we have a paired rewrite of all of their callers.
3. Each batch of moves should be its own commit titled `refactor(arch):
   move <files> to <folder>`.
