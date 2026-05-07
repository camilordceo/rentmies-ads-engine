/* ─────────────────────────────────────────────────────────────
   RENTMIES — Connect Prompt
   Cross-page: when there's no Meta connection, drop a friendly
   banner at the top of Dashboard / Quick Post / Inmuebles, and
   wire the avatar dropdown's "Conectar Meta" link.

   Single fetch on boot, cached in this module's local state.
   Re-runs on rm-page-change so the banner appears on every
   working page that needs it.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGES_NEEDING_BANNER = ['dashboard', 'quickpost', 'inmuebles']

  let connectionStatus = { loaded: false, connected: false }
  let menuOpen = false

  function authToken () { return localStorage.getItem('sb_token') || '' }
  function authHeaders () {
    const t = authToken()
    let empresaId = ''
    try { empresaId = (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || '' } catch (_) {}
    const h = { 'Content-Type': 'application/json' }
    if (t) h.Authorization = 'Bearer ' + t
    else { h.Authorization = 'Bearer demo_local'; h['x-empresa-id'] = empresaId || 'demo' }
    return h
  }

  async function checkConnection () {
    try {
      const r = await fetch('/api/credentials/meta', { headers: authHeaders() })
      if (!r.ok) { connectionStatus = { loaded: true, connected: false }; return }
      const j = await r.json()
      connectionStatus = {
        loaded: true,
        connected: !!(j && j.connected && j.status === 'active'),
        page_name: j && j.page_name,
        status_label: j && j.status
      }
    } catch (_) {
      connectionStatus = { loaded: true, connected: false }
    }
  }

  function bannerHtml () {
    return `
      <div class="cw-banner" role="status">
        <div class="cw-banner-icon">⚠️</div>
        <div class="cw-banner-body">
          <strong>Conecta tu cuenta de Meta</strong> para empezar a publicar.
          La configuración guiada toma <strong>~12 minutos</strong> — te llevamos paso a paso.
        </div>
        <a class="cw-banner-cta" href="#connect">Empezar conexión →</a>
      </div>
    `
  }

  function renderBannerForPage (page) {
    if (connectionStatus.connected) return
    if (!PAGES_NEEDING_BANNER.includes(page)) return

    // Find the section's first child (.rp-page or .ae-page)
    const section = document.querySelector(`section[data-page="${page}"].is-active`)
    if (!section) return

    // If page hasn't rendered yet, retry shortly
    const wrapper = section.querySelector('.rp-page, .ae-page, .ae-page-shell')
    if (!wrapper) { setTimeout(() => renderBannerForPage(page), 200); return }

    if (wrapper.querySelector('.cw-banner')) return // already there

    const div = document.createElement('div')
    div.innerHTML = bannerHtml()
    wrapper.insertBefore(div.firstElementChild, wrapper.firstChild)
  }

  // ── Avatar dropdown ────────────────────────────────────────

  function buildDropdown () {
    if (document.getElementById('rp-avatar-menu')) return
    const menu = document.createElement('div')
    menu.id = 'rp-avatar-menu'
    menu.className = 'rp-avatar-menu'
    menu.setAttribute('role', 'menu')
    menu.innerHTML = `
      <a class="rp-avatar-menu-item accent" href="#connect" data-menu-item="connect">
        ✨ Conectar Meta
      </a>
      <a class="rp-avatar-menu-item" href="#settings" data-menu-item="settings">
        ⚙️ Configuración
      </a>
      <a class="rp-avatar-menu-item" href="#dashboard" data-menu-item="dashboard">
        🏠 Dashboard
      </a>
      <button class="rp-avatar-menu-item" type="button" id="rp-avatar-signout">
        🚪 Cerrar sesión
      </button>
    `
    document.body.appendChild(menu)

    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()))
    document.getElementById('rp-avatar-signout').addEventListener('click', e => {
      e.stopPropagation()
      if (!confirm('¿Cerrar sesión?')) return
      try {
        localStorage.removeItem('sb_token')
        localStorage.removeItem('sb_refresh_token')
        localStorage.removeItem('sb_user')
      } catch (_) {}
      location.href = '/login'
    })
  }

  function refreshDropdownItems () {
    const menu = document.getElementById('rp-avatar-menu')
    if (!menu) return
    const connectItem = menu.querySelector('[data-menu-item="connect"]')
    if (connectItem) {
      // Show/hide the Connect link depending on whether they're connected
      connectItem.style.display = connectionStatus.connected ? 'none' : 'flex'
    }
  }

  function openMenu () {
    const menu = document.getElementById('rp-avatar-menu')
    if (!menu) return
    refreshDropdownItems()
    menuOpen = true
    menu.classList.add('open')
  }
  function closeMenu () {
    const menu = document.getElementById('rp-avatar-menu')
    if (!menu) return
    menuOpen = false
    menu.classList.remove('open')
  }

  function wireAvatar () {
    const avatar = document.querySelector('.rp-avatar, .ae-rail-avatar')
    if (!avatar) return
    avatar.style.cursor = 'pointer'
    avatar.setAttribute('tabindex', '0')
    avatar.setAttribute('aria-haspopup', 'menu')
    avatar.addEventListener('click', e => {
      e.stopPropagation()
      menuOpen ? closeMenu() : openMenu()
    })
    document.addEventListener('click', e => {
      if (!menuOpen) return
      const menu = document.getElementById('rp-avatar-menu')
      if (menu && !menu.contains(e.target) && e.target !== avatar) closeMenu()
    })
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenu()
    })
  }

  // ── Bootstrap ──────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    buildDropdown()
    wireAvatar()
    await checkConnection()
    refreshDropdownItems()
    const page = window.rmRouter?.currentPage() || 'dashboard'
    setTimeout(() => renderBannerForPage(page), 100)
  })

  document.addEventListener('rm-page-change', async e => {
    if (!connectionStatus.loaded) await checkConnection()
    refreshDropdownItems()
    setTimeout(() => renderBannerForPage(e.detail.page), 250)
  })

  // Refresh when wizard finishes (it'll dispatch this if needed)
  document.addEventListener('rm-meta-connected', async () => {
    await checkConnection()
    refreshDropdownItems()
    document.querySelectorAll('.cw-banner').forEach(el => el.remove())
  })
})()
