/* ─────────────────────────────────────────────────────────────
   Mobile interactions — hamburger menu only.
   FAB removed: it was rendering as a giant orphan circle when the
   responsive CSS didn't apply, and on desktop it added clutter
   without value. Camilord is reachable via ⌘/ from the keyboard
   shortcut system + by hiding via the close button on the panel.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function injectControls() {
    const topnav = document.querySelector('.ae-topnav')
    if (topnav && !topnav.querySelector('.ae-topnav-burger')) {
      const burger = document.createElement('button')
      burger.className = 'ae-topnav-burger'
      burger.setAttribute('aria-label', 'Abrir menú')
      burger.innerHTML = '<svg viewBox="0 0 24 18" aria-hidden="true"><line x1="0" y1="2" x2="24" y2="2"/><line x1="0" y1="9" x2="24" y2="9"/><line x1="0" y1="16" x2="24" y2="16"/></svg>'
      const logo = topnav.querySelector('.ae-topnav-logo')
      if (logo) logo.after(burger); else topnav.prepend(burger)

      burger.addEventListener('click', () => {
        const nav = topnav.querySelector('.ae-topnav-nav')
        if (nav) nav.classList.toggle('open')
      })

      topnav.addEventListener('click', e => {
        if (e.target.classList.contains('ae-topnav-link')) {
          topnav.querySelector('.ae-topnav-nav')?.classList.remove('open')
        }
      })
    }
  }

  document.addEventListener('DOMContentLoaded', injectControls)
})()
