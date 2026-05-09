/* ─────────────────────────────────────────────────────────────
   Hash-based router · channel-first taxonomy
   Hashes look like #dashboard, #meta/quickpost, #whatsapp/templates,
   #google/campaigns, #tiktok/videos. Single tokens (#quickpost) keep
   working for backward compat — they map to a Meta sub-page.

   Public API:
     window.rmRouter.goTo(name)     -- name is a flat page id or slash form
     window.rmRouter.currentPage()  -- returns flat page id
     window.rmRouter.currentChannel()
     window.showPage(name)          -- legacy alias
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // ─── Channel taxonomy ───────────────────────────────────────
  // Each channel groups a set of flat data-page ids. The first id
  // in the list is the channel's default landing page.
  const CHANNELS = {
    meta:     { default: 'quickpost',       pages: ['quickpost', 'schedule', 'inmuebles', 'meta-videos', 'posts'] },
    whatsapp: { default: 'whatsapp',        pages: ['whatsapp', 'wa-broadcasts', 'wa-analytics', 'wa-template-new', 'wa-template-edit', 'wa-broadcast-new', 'wa-broadcast-detail'] },
    google:   { default: 'google-campaigns', pages: ['google-campaigns', 'google-campaign-new', 'google-pmax', 'google-leads', 'google-analytics', 'google-campaign-detail'] },
    tiktok:   { default: 'tiktok-videos',   pages: ['tiktok-videos', 'tiktok-schedule', 'tiktok-analytics'] }
  }

  // Reverse lookup: page id → channel
  const PAGE_TO_CHANNEL = (() => {
    const m = {}
    for (const ch of Object.keys(CHANNELS)) {
      for (const p of CHANNELS[ch].pages) m[p] = ch
    }
    return m
  })()

  // Top-level pages outside of any channel
  const TOP_LEVEL = ['dashboard', 'analytics', 'history', 'studio', 'settings', 'connect']

  // Full set of valid flat page ids
  const VALID_PAGES = [].concat(TOP_LEVEL, Object.values(CHANNELS).flatMap(c => c.pages))

  const DEFAULT_PAGE = 'dashboard'

  // ─── Hash parsing ───────────────────────────────────────────
  // Accepts:
  //   #dashboard            → 'dashboard'
  //   #quickpost            → 'quickpost' (legacy flat token)
  //   #meta                 → channel home (CHANNELS.meta.default)
  //   #meta/quickpost       → 'quickpost'
  //   #whatsapp/broadcasts  → 'wa-broadcasts'  (sub-route alias)
  //   #google/performance-max → 'google-pmax'
  //   #tiktok/videos        → 'tiktok-videos'
  const SUBROUTE_ALIASES = {
    'whatsapp/templates':           'whatsapp',
    'whatsapp/templates/new':       'wa-template-new',
    'whatsapp/templates/edit':      'wa-template-edit',
    'whatsapp/broadcasts':          'wa-broadcasts',
    'whatsapp/broadcasts/new':      'wa-broadcast-new',
    'whatsapp/broadcasts/detail':   'wa-broadcast-detail',
    'whatsapp/analytics':           'wa-analytics',
    'google/campaigns':             'google-campaigns',
    'google/campaigns/new':         'google-campaign-new',
    'google/campaigns/detail':      'google-campaign-detail',
    'google/performance-max':       'google-pmax',
    'google/lead-forms':            'google-leads',
    'google/analytics':             'google-analytics',
    'tiktok/videos':                'tiktok-videos',
    'tiktok/schedule':              'tiktok-schedule',
    'tiktok/analytics':             'tiktok-analytics',
    'meta/quickpost':               'quickpost',
    'meta/schedule':                'schedule',
    'meta/inmuebles':               'inmuebles',
    'meta/videos':                  'meta-videos',
    'meta/posts':                   'posts'
  }

  function normalizeHash (raw) {
    const h = String(raw || '').replace(/^#/, '').trim()
    if (!h) return DEFAULT_PAGE
    // Slash form: alias lookup, or treat first token as channel home
    if (h.includes('/')) {
      if (SUBROUTE_ALIASES[h]) return SUBROUTE_ALIASES[h]
      const [channel] = h.split('/')
      if (CHANNELS[channel]) return CHANNELS[channel].default
      return DEFAULT_PAGE
    }
    // Bare channel name: route to its default
    if (CHANNELS[h]) return CHANNELS[h].default
    // Flat valid page
    if (VALID_PAGES.includes(h)) return h
    return DEFAULT_PAGE
  }

  function currentPage () {
    return normalizeHash(location.hash)
  }

  function currentChannel () {
    return PAGE_TO_CHANNEL[currentPage()] || null
  }

  // ─── Apply page (DOM updates) ───────────────────────────────
  function applyPage (name) {
    if (!VALID_PAGES.includes(name)) name = DEFAULT_PAGE

    // Section visibility
    document.querySelectorAll('.ae-content > section[data-page], .rp-content > section[data-page]').forEach(section => {
      section.classList.toggle('is-active', section.dataset.page === name)
    })

    const channel = PAGE_TO_CHANNEL[name] || null

    // Top nav active state — channel-link is active when its sub-page is open;
    // page-link is active when its exact page is open.
    document.querySelectorAll('.rp-topbar-link[data-page], .ae-topnav-link[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })
    document.querySelectorAll('.rp-topbar-link[data-channel], .ae-topnav-link[data-channel]').forEach(link => {
      link.classList.toggle('active', link.dataset.channel === channel)
    })

    // Body class for global CSS hooks (channel-aware Camilord, sub-nav, etc.)
    document.body.classList.remove('rm-channel-meta', 'rm-channel-whatsapp', 'rm-channel-google', 'rm-channel-tiktok')
    if (channel) document.body.classList.add('rm-channel-' + channel)

    // Rail (legacy) active state — kept for safety, rail is hidden anyway
    document.querySelectorAll('.ae-rail-link[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Scroll the canvas to top on every page change
    const canvas = document.querySelector('.ae-content, .rp-content')
    if (canvas) canvas.scrollTop = 0

    document.dispatchEvent(new CustomEvent('rm-page-change', {
      detail: { page: name, channel: channel }
    }))
  }

  // ─── Navigation ─────────────────────────────────────────────
  function goTo (name) {
    // Accept both flat ids ('quickpost') and slash form ('meta/quickpost')
    const flat = normalizeHash(name)
    if (!VALID_PAGES.includes(flat)) return
    if (currentPage() === flat) {
      applyPage(flat)
      return
    }
    location.hash = '#' + name
  }

  window.showPage = goTo
  window.rmRouter = { goTo, currentPage, currentChannel, CHANNELS }

  // ─── Bind ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rp-topbar-link[data-page], .ae-topnav-link[data-page]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault()
        goTo(btn.dataset.page)
      })
    })

    // Channel buttons: jump to the channel's default page
    document.querySelectorAll('.rp-topbar-link[data-channel], .ae-topnav-link[data-channel]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault()
        const ch = btn.dataset.channel
        goTo(CHANNELS[ch]?.default || DEFAULT_PAGE)
      })
    })

    // Topbar icon buttons that carry a data-page (e.g. settings cog)
    document.querySelectorAll('.rp-icon-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page))
    })

    document.querySelectorAll('.ae-rail-link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page))
    })

    applyPage(currentPage())
  })

  window.addEventListener('hashchange', () => applyPage(currentPage()))
})()
