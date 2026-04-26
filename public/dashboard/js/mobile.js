/* ─────────────────────────────────────────────────────────────
   Mobile interactions — hamburger menu + Camilord FAB.
   Touch-only at <768px. Desktop is unaffected.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function injectControls() {
    const topnav = document.querySelector('.ae-topnav')
    if (topnav && !topnav.querySelector('.ae-topnav-burger')) {
      const burger = document.createElement('button')
      burger.className = 'ae-topnav-burger'
      burger.setAttribute('aria-label', 'Abrir menú')
      burger.innerHTML = '<svg viewBox="0 0 24 18"><line x1="0" y1="2" x2="24" y2="2"/><line x1="0" y1="9" x2="24" y2="9"/><line x1="0" y1="16" x2="24" y2="16"/></svg>'
      // Insert after the logo
      const logo = topnav.querySelector('.ae-topnav-logo')
      if (logo) logo.after(burger); else topnav.prepend(burger)

      burger.addEventListener('click', () => {
        const nav = topnav.querySelector('.ae-topnav-nav')
        if (nav) nav.classList.toggle('open')
      })

      // Tapping a link in the open menu closes it
      topnav.addEventListener('click', e => {
        if (e.target.classList.contains('ae-topnav-link')) {
          topnav.querySelector('.ae-topnav-nav')?.classList.remove('open')
        }
      })
    }

    if (!document.querySelector('.ae-fab')) {
      const fab = document.createElement('button')
      fab.className = 'ae-fab'
      fab.setAttribute('aria-label', 'Abrir Camilord')
      fab.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9 12 2"/></svg>'
      document.body.appendChild(fab)

      fab.addEventListener('click', () => {
        const cam = document.querySelector('.ae-camilord')
        if (!cam) return
        const open = cam.classList.toggle('open-mobile')
        // When opening, attach a close button if not present
        if (open && !cam.querySelector('.ae-cam-mobile-close')) {
          const close = document.createElement('button')
          close.className = 'ae-cam-mobile-close'
          close.setAttribute('aria-label', 'Cerrar Camilord')
          close.style.cssText = 'position:absolute; top:12px; right:12px; width:32px; height:32px; border-radius:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#fff; cursor:pointer; z-index:5; display:flex; align-items:center; justify-content:center;'
          close.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          close.addEventListener('click', () => cam.classList.remove('open-mobile'))
          cam.appendChild(close)
        }
      })
    }
  }

  document.addEventListener('DOMContentLoaded', injectControls)

  // Re-inject if Camilord panel gets re-rendered by camilord-modes.js
  document.addEventListener('rm-page-change', () => {
    setTimeout(injectControls, 100)
  })
})()
