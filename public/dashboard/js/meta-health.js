/* ─────────────────────────────────────────────────────────────
   Meta Connection Health Watcher
   Polls /api/auth/meta/health on dashboard load + every 5 min.
   Shows a banner when the connection is unhealthy.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const HEALTH_CACHE_MS = 5 * 60 * 1000
  let lastChecked = 0
  let lastResult = null

  function bannerHtml(label, cta) {
    return `
      <div class="rm-meta-banner-inner">
        <span class="rm-meta-banner-icon">⚠</span>
        <span class="rm-meta-banner-label">${label}</span>
        <a class="rm-meta-banner-cta" href="/api/auth/meta/login?source=reconnect">${cta} →</a>
        <button class="rm-meta-banner-close" aria-label="Cerrar">×</button>
      </div>
    `
  }

  function injectStylesOnce() {
    if (document.getElementById('rm-meta-banner-styles')) return
    const css = `
      .rm-meta-banner { position:fixed; top:0; left:0; right:0; z-index:1000; background:#dc2626; color:#fff; font-family:'Inter',-apple-system,sans-serif; font-size:13.5px; padding:10px 18px; box-shadow:0 2px 12px rgba(220,38,38,.25); display:none; }
      .rm-meta-banner.show { display:block; }
      .rm-meta-banner.warn { background:#f59e0b; }
      .rm-meta-banner-inner { max-width:1280px; margin:0 auto; display:flex; align-items:center; gap:12px; }
      .rm-meta-banner-icon { font-size:16px; }
      .rm-meta-banner-label { flex:1; line-height:1.4; }
      .rm-meta-banner-cta { background:rgba(255,255,255,.18); color:#fff; padding:6px 14px; border-radius:5px; font-weight:600; text-decoration:none; font-size:12.5px; transition:background .15s; }
      .rm-meta-banner-cta:hover { background:rgba(255,255,255,.3); }
      .rm-meta-banner-close { background:none; border:none; color:#fff; font-size:22px; line-height:1; cursor:pointer; padding:0 6px; opacity:.85; }
      .rm-meta-banner-close:hover { opacity:1; }
      body.has-meta-banner .ae-app { padding-top:42px; }
    `
    const s = document.createElement('style')
    s.id = 'rm-meta-banner-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  function ensureBanner() {
    let el = document.getElementById('rm-meta-banner')
    if (el) return el
    injectStylesOnce()
    el = document.createElement('div')
    el.id = 'rm-meta-banner'
    el.className = 'rm-meta-banner'
    document.body.insertBefore(el, document.body.firstChild)
    return el
  }

  function bannerHtmlSimple (label, ctaLabel, ctaHref) {
    return `
      <div class="rm-meta-banner-inner">
        <span class="rm-meta-banner-icon">⚠</span>
        <span class="rm-meta-banner-label">${label}</span>
        <a class="rm-meta-banner-cta" href="${ctaHref}">${ctaLabel} →</a>
        <button class="rm-meta-banner-close" aria-label="Cerrar">×</button>
      </div>`
  }

  function show(state) {
    const el = ensureBanner()
    let label, cta, kind = 'show', href = '/api/auth/meta/login?source=reconnect'

    // System User-only: if the connection is a system_user token, "reconnect"
    // means "go to Settings and paste a fresh token" — NOT the OAuth flow.
    const isSut = state.token_type === 'system_user'

    if (state.health === 'expired' || state.health === 'expiring_soon' && isSut === false) {
      label = isSut
        ? 'Tu System User token de Meta no funciona. Genera uno nuevo en Business Manager.'
        : 'Tu conexión con Facebook expiró. Reconecta para seguir publicando.'
      cta = isSut ? 'Ir a Settings' : 'Reconectar'
      href = isSut ? '/dashboard#settings' : '/api/auth/meta/login?source=reconnect'
    } else if (state.health === 'revoked') {
      label = isSut
        ? 'El System User fue eliminado de tu Business Manager. Pega un token nuevo.'
        : 'Revocaste el permiso a Rentmies en Facebook. Vuelve a conectar.'
      cta = isSut ? 'Ir a Settings' : 'Reconectar'
      href = isSut ? '/dashboard#settings' : '/api/auth/meta/login?source=reconnect'
    } else if (state.health === 'expiring_soon') {
      label = `Tu conexión con Facebook expira en ${state.days_until_expiry} día${state.days_until_expiry === 1 ? '' : 's'}. Refresca cuando puedas.`
      cta = 'Refrescar ahora'
      kind = 'show warn'
    } else if (state.health === 'error') {
      label = 'Hay un problema con tu conexión Meta: ' + (state.error || 'desconocido')
      cta = isSut ? 'Ir a Settings' : 'Reconectar'
      href = isSut ? '/dashboard#settings' : '/api/auth/meta/login?source=reconnect'
    } else {
      hide()
      return
    }
    el.innerHTML = bannerHtmlSimple(label, cta, href)
    el.className = 'rm-meta-banner ' + kind
    document.body.classList.add('has-meta-banner')
    el.querySelector('.rm-meta-banner-close')?.addEventListener('click', () => {
      hide()
      sessionStorage.setItem('rm_meta_banner_dismissed', String(Date.now()))
    })
  }

  function hide() {
    const el = document.getElementById('rm-meta-banner')
    if (el) el.classList.remove('show', 'warn')
    document.body.classList.remove('has-meta-banner')
  }

  function shouldSkipDueToDismiss() {
    const t = parseInt(sessionStorage.getItem('rm_meta_banner_dismissed') || '0', 10)
    return t && (Date.now() - t < 60 * 60 * 1000)   // suppress for 1h after dismiss
  }

  async function check(force) {
    if (!force && Date.now() - lastChecked < HEALTH_CACHE_MS) return lastResult
    const token = localStorage.getItem('sb_token')
    if (!token) return null   // not logged in via Supabase — silently skip
    try {
      const r = await fetch('/api/auth/meta/health', {
        headers: { Authorization: 'Bearer ' + token }
      })
      lastChecked = Date.now()
      if (r.status === 404) {
        // No connection — user hasn't run OAuth yet. Don't show banner; signup flow handles it.
        lastResult = { health: 'no_connection' }
        hide()
        return lastResult
      }
      if (!r.ok) {
        // Auth failure or server issue — don't spam the banner, log silently.
        const j = await r.json().catch(() => ({}))
        console.warn('[meta-health]', r.status, j.error)
        lastResult = null
        return null
      }
      lastResult = await r.json()
      if (shouldSkipDueToDismiss() && lastResult.health !== 'expired' && lastResult.health !== 'revoked') {
        hide()
      } else {
        show(lastResult)
      }
      return lastResult
    } catch (err) {
      console.warn('[meta-health] fetch failed:', err.message)
      return null
    }
  }

  // Run on dashboard ready
  document.addEventListener('DOMContentLoaded', () => check(true))
  // Re-check periodically
  setInterval(() => check(false), HEALTH_CACHE_MS)

  window.rmMetaHealth = { check, show, hide, get last() { return lastResult } }
})()
