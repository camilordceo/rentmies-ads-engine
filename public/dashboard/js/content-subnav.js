/* ─────────────────────────────────────────────────────────────
   Content sub-nav helper
   The "Content" section in the top bar groups four pages:
   Quick Post · Inmuebles · Historial · WhatsApp.
   Each page renders <div data-rp-subnav></div> as the first child
   of its .rp-page; this module fills it with the segmented pill
   row, marks the active page, and routes clicks via rmRouter.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const CONTENT_PAGES = ['quickpost', 'inmuebles', 'posts', 'whatsapp']

  const ITEMS = [
    {
      id: 'quickpost',
      label: 'Quick Post',
      icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
    },
    {
      id: 'inmuebles',
      label: 'Inmuebles',
      icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    },
    {
      id: 'posts',
      label: 'Historial',
      icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
    }
  ]

  function html(active) {
    return `
      <div class="rp-subnav" role="tablist" aria-label="Navegación de Content">
        ${ITEMS.map(it => `
          <button class="rp-subnav-link ${active === it.id ? 'active' : ''}"
                  data-page="${it.id}"
                  role="tab"
                  aria-selected="${active === it.id}">
            ${it.icon}
            <span>${it.label}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  // Public helper — page modules can call this to mount the sub-nav inline
  function inject(active) {
    return html(active)
  }

  // Auto-fill any [data-rp-subnav] placeholder in the active page
  function autofill(activePage) {
    const slot = document.querySelector('section[data-page].is-active [data-rp-subnav]')
    if (slot) slot.innerHTML = html(activePage)
  }

  // Wire delegated clicks once at page load
  document.addEventListener('click', e => {
    const btn = e.target.closest('.rp-subnav-link[data-page]')
    if (!btn) return
    e.preventDefault()
    const page = btn.dataset.page
    if (page && window.rmRouter) window.rmRouter.goTo(page)
  })

  // Re-render highlight when route changes
  document.addEventListener('rm-page-change', e => {
    if (CONTENT_PAGES.includes(e.detail.page)) {
      // Defer one tick so page modules finish rendering first
      setTimeout(() => autofill(e.detail.page), 0)
    }

    // Mark the top "Content" link as active when any Content sub-route is active
    document.querySelectorAll('[data-page="quickpost"]').forEach(btn => {
      if (btn.classList.contains('rp-topbar-link') || btn.classList.contains('ae-topnav-link')) {
        btn.classList.toggle('active', CONTENT_PAGES.includes(e.detail.page))
      }
    })
  })

  window.rpSubnav = {
    html: inject,
    isContentPage: p => CONTENT_PAGES.includes(p)
  }
})()
