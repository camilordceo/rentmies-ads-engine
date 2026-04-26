/* ─────────────────────────────────────────────────────────────
   Hash-based router. Swaps [data-page] sections, syncs topnav
   active state, and dispatches a 'rm-page-change' CustomEvent so
   modules (like Camilord) can react to navigation.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VALID_PAGES = ['studio', 'dashboard', 'history', 'analytics']
  const DEFAULT_PAGE = 'studio'

  function currentPage() {
    const hash = (location.hash || '').replace(/^#/, '')
    return VALID_PAGES.includes(hash) ? hash : DEFAULT_PAGE
  }

  function applyPage(name) {
    if (!VALID_PAGES.includes(name)) name = DEFAULT_PAGE

    // Show only the matching page section
    document.querySelectorAll('[data-page]').forEach(section => {
      section.style.display = section.dataset.page === name ? '' : 'none'
    })

    // Topnav active state
    document.querySelectorAll('.ae-topnav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Rail active state (the rail uses its own routing via data-route)
    const railMap = {
      studio:    'studio',
      dashboard: 'parrilla',
      history:   'analytics',     // History sits under analytics rail icon for FASE 3
      analytics: 'analytics'
    }
    document.querySelectorAll('.ae-rail-link').forEach(link => {
      link.classList.toggle('active', link.dataset.route === railMap[name])
    })

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

  // Wire the topnav data-page buttons
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-page]').forEach(el => {
      // Only buttons (not page sections) get click handlers
      if (el.tagName === 'BUTTON' || el.tagName === 'A') {
        el.addEventListener('click', e => {
          if (el.dataset.page === '') return
          e.preventDefault()
          goTo(el.dataset.page)
        })
      }
    })

    // Wire rail icons to pages
    const railToPage = { studio: 'studio', parrilla: 'dashboard', analytics: 'analytics' }
    document.querySelectorAll('.ae-rail-link[data-route]').forEach(btn => {
      const target = railToPage[btn.dataset.route]
      if (target) btn.addEventListener('click', () => goTo(target))
    })

    // Initial render
    applyPage(currentPage())
  })

  window.addEventListener('hashchange', () => applyPage(currentPage()))
})()
