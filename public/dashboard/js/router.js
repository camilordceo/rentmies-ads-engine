/* ─────────────────────────────────────────────────────────────
   Hash-based router. Swaps [data-page] sections, syncs topnav
   active state, and dispatches a 'rm-page-change' CustomEvent so
   modules (like Camilord) can react to navigation.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VALID_PAGES = ['studio', 'quickpost', 'schedule', 'inmuebles', 'whatsapp', 'dashboard', 'history', 'analytics', 'settings']
  const DEFAULT_PAGE = 'quickpost'

  function currentPage() {
    const hash = (location.hash || '').replace(/^#/, '')
    return VALID_PAGES.includes(hash) ? hash : DEFAULT_PAGE
  }

  function applyPage(name) {
    if (!VALID_PAGES.includes(name)) name = DEFAULT_PAGE

    // Show only the matching page SECTION (not buttons!).
    // CSS controls visibility via .is-active class — display:none/block
    // declared with !important in layout.css so a JS race can never
    // leave multiple pages stacked.
    document.querySelectorAll('.ae-content > section[data-page]').forEach(section => {
      section.classList.toggle('is-active', section.dataset.page === name)
    })

    // Topnav active state — buttons keep their display, only .active toggles
    document.querySelectorAll('.ae-topnav-link[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Rail active state — same pattern, only .active toggles
    document.querySelectorAll('.ae-rail-link[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Scroll the canvas to top on every page change so the user
    // doesn't land mid-scroll on a different page's old position.
    const canvas = document.querySelector('.ae-content')
    if (canvas) canvas.scrollTop = 0

    // Notify subscribers
    document.dispatchEvent(new CustomEvent('rm-page-change', { detail: { page: name } }))
  }

  function goTo(name) {
    if (!VALID_PAGES.includes(name)) return
    if (currentPage() === name) {
      applyPage(name)   // force refresh
      return
    }
    location.hash = '#' + name
  }

  // Public API
  window.showPage = goTo
  window.rmRouter = { goTo, currentPage }

  document.addEventListener('DOMContentLoaded', () => {
    // Topnav links — explicit selector so we don't grab page sections
    document.querySelectorAll('.ae-topnav-link[data-page]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault()
        goTo(btn.dataset.page)
      })
    })

    // Rail buttons
    document.querySelectorAll('.ae-rail-link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page))
    })

    // Initial render
    applyPage(currentPage())
  })

  window.addEventListener('hashchange', () => applyPage(currentPage()))
})()
