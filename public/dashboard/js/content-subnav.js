/* ─────────────────────────────────────────────────────────────
   Channel sub-nav helper (formerly content-subnav)
   Each channel (Meta · WhatsApp · Google · TikTok) renders a
   segmented pill row at the top of every sub-page. Pages drop
   <div data-rp-subnav></div> as first child of their .rp-page
   and this module fills it based on the active channel.

   Public API (back-compat with the old window.rpSubnav):
     window.rpSubnav.html(activePage)       — returns sub-nav markup for the page's channel
     window.rpSubnav.isContentPage(page)    — back-compat: true for any Meta sub-page
     window.rpSubnav.subnavFor(channel,p)   — explicit (channel, active) lookup
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // SVG icon library (kept inline — no extra request)
  const ICON = {
    quickpost: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    schedule:  '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    inmuebles: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    history:   '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    whatsapp:  '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    broadcast: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M3 11l18-8v18l-18-8v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    google:    '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M12 2a14.5 14.5 0 0 1 0 20"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
    pmax:      '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>',
    leads:     '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    video:     '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
  }

  // ─── Channel sub-nav definitions ────────────────────────────
  // Each entry is { id (data-page), label, icon }. The id is also
  // what rmRouter.goTo() expects — flat page ids match index.html.
  const CHANNEL_NAVS = {
    meta: [
      { id: 'quickpost',    label: 'Quick Post', icon: ICON.quickpost },
      { id: 'schedule',     label: 'Campañas',   icon: ICON.schedule },
      { id: 'inmuebles',    label: 'Inmuebles',  icon: ICON.inmuebles },
      { id: 'meta-videos',  label: 'Videos',     icon: ICON.video },
      { id: 'posts',        label: 'Historial',  icon: ICON.history }
    ],
    whatsapp: [
      { id: 'whatsapp',       label: 'Templates',  icon: ICON.whatsapp },
      { id: 'wa-broadcasts',  label: 'Broadcasts', icon: ICON.broadcast },
      { id: 'wa-analytics',   label: 'Analytics',  icon: ICON.analytics }
    ],
    google: [
      { id: 'google-campaigns', label: 'Campañas',          icon: ICON.google },
      { id: 'google-pmax',      label: 'Performance Max',   icon: ICON.pmax },
      { id: 'google-leads',     label: 'Lead Forms',        icon: ICON.leads }
    ],
    tiktok: [
      { id: 'tiktok-videos',    label: 'Videos',    icon: ICON.video },
      { id: 'tiktok-schedule',  label: 'Schedule',  icon: ICON.schedule },
      { id: 'tiktok-analytics', label: 'Analytics', icon: ICON.analytics }
    ]
  }

  // Reverse: page id → channel
  const PAGE_TO_CHANNEL = (() => {
    const m = {}
    for (const ch of Object.keys(CHANNEL_NAVS)) {
      for (const it of CHANNEL_NAVS[ch]) m[it.id] = ch
    }
    return m
  })()

  // Back-compat: which pages are part of the Meta channel
  const META_PAGES = CHANNEL_NAVS.meta.map(it => it.id)
  const ALL_CHANNEL_PAGES = Object.values(CHANNEL_NAVS).flat().map(it => it.id)

  function channelFor (page) {
    return PAGE_TO_CHANNEL[page] || null
  }

  function html (activePage) {
    const channel = channelFor(activePage)
    if (!channel) return ''
    const items = CHANNEL_NAVS[channel]
    return `
      <div class="rp-subnav" role="tablist" aria-label="Navegación del canal">
        ${items.map(it => `
          <button class="rp-subnav-link ${activePage === it.id ? 'active' : ''}"
                  data-page="${it.id}"
                  role="tab"
                  aria-selected="${activePage === it.id}">
            ${it.icon}
            <span>${it.label}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  function subnavFor (channel, activePage) {
    const items = CHANNEL_NAVS[channel] || []
    return `
      <div class="rp-subnav" role="tablist" aria-label="Navegación del canal">
        ${items.map(it => `
          <button class="rp-subnav-link ${activePage === it.id ? 'active' : ''}"
                  data-page="${it.id}" role="tab" aria-selected="${activePage === it.id}">
            ${it.icon}
            <span>${it.label}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  function autofill (activePage) {
    const slot = document.querySelector('section[data-page].is-active [data-rp-subnav]')
    if (slot) slot.innerHTML = html(activePage)
  }

  // Delegated click handling (single listener, all sub-nav links)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.rp-subnav-link[data-page]')
    if (!btn) return
    e.preventDefault()
    const page = btn.dataset.page
    if (page && window.rmRouter) window.rmRouter.goTo(page)
  })

  // Re-render highlight when route changes
  document.addEventListener('rm-page-change', e => {
    if (ALL_CHANNEL_PAGES.includes(e.detail.page)) {
      setTimeout(() => autofill(e.detail.page), 0)
    }
  })

  // Public API (back-compat with the old name)
  window.rpSubnav = {
    html,
    subnavFor,
    isContentPage: p => META_PAGES.includes(p),   // legacy alias
    channelFor
  }
})()
