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

    // Show only the matching page section
    document.querySelectorAll('[data-page]').forEach(section => {
      section.style.display = section.dataset.page === name ? '' : 'none'
    })

    // Topnav active state
    document.querySelectorAll('.ae-topnav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === name)
    })

    // Rail active state — match data-page on rail buttons directly
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

    // Rail buttons now use data-page directly — no mapping table needed
    document.querySelectorAll('.ae-rail-link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page))
    })

    // Initial render
    applyPage(currentPage())
  })

  window.addEventListener('hashchange', () => applyPage(currentPage()))
})()
