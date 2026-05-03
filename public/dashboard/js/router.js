/* ─────────────────────────────────────────────────────────────
   Hash-based router. Swaps [data-page] sections, syncs topbar
   active state, and dispatches a 'rm-page-change' CustomEvent so
   modules (like Camilo) can react to navigation.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VALID_PAGES = ['studio', 'quickpost', 'schedule', 'inmuebles', 'whatsapp', 'dashboard', 'history', 'analytics', 'settings', 'posts']
  const DEFAULT_PAGE = 'dashboard'

  function currentPage() {
    const hash = (location.hash || '').replace(/^#/, '')
    return VALID_PAGES.includes(hash) ? hash : DEFAULT_PAGE
  }

  // Content section in the top bar groups four sub-routes
  const CONTENT_GROUP = ['quickpost', 'inmuebles', 'posts', 'whatsapp']

  function applyPage(name) {
    if (!VALID_PAGES.includes(name)) name = DEFAULT_PAGE

    document.querySelectorAll('.ae-content > section[data-page], .rp-content > section[data-page]').forEach(section => {
      section.classList.toggle('is-active', section.dataset.page === name)
    })

    // Top nav active state — Content link stays active for any of its sub-routes
    document.querySelectorAll('.rp-topbar-link[data-page], .ae-topnav-link[data-page]').forEach(link => {
      const isContentLink = link.dataset.page === 'quickpost'
      const isActive = isContentLink
        ? CONTENT_GROUP.includes(name)
        : link.dataset.page === name
      link.classList.toggle('active', isActive)
    })

    // Rail (legacy) active state — kept for safety, rail is hidden anyway
    document.querySelectorAll('.ae-rail-link[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Scroll the canvas to top on every page change
    const canvas = document.querySelector('.ae-content, .rp-content')
    if (canvas) canvas.scrollTop = 0

    document.dispatchEvent(new CustomEvent('rm-page-change', { detail: { page: name } }))
  }

  function goTo(name) {
    if (!VALID_PAGES.includes(name)) return
    if (currentPage() === name) {
      applyPage(name)
      return
    }
    location.hash = '#' + name
  }

  window.showPage = goTo
  window.rmRouter = { goTo, currentPage }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rp-topbar-link[data-page], .ae-topnav-link[data-page]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault()
        goTo(btn.dataset.page)
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
