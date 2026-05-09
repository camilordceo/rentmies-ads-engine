/* ─────────────────────────────────────────────────────────────
   Channel Health Registry + Orchestrator
   The four per-channel health watchers (meta-health, whatsapp,
   google, tiktok) push their state into rmHealthRegistry. This
   module:
     1. Owns the registry — a thin Map + change emitter.
     2. Renders a single, polite top-right "channels need
        attention" pill that, on click, opens a popover listing
        each channel and its action.

   Why a separate banner from meta-health: Meta is the only
   channel where a broken token blocks publishing TODAY for most
   users. So meta-health.js keeps its full-width red banner. This
   module handles the secondary status of WhatsApp / Google /
   TikTok, where "unhealthy" is informational (the user can still
   work in other channels). Mixing them in one banner stack would
   add noise to the working flow.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // ── Registry ─────────────────────────────────────────────
  const _state = new Map()
  const _listeners = new Set()

  function set (channel, info) {
    _state.set(channel, info || null)
    _listeners.forEach(fn => { try { fn(channel, info) } catch (_) {} })
  }
  function get (channel) { return _state.get(channel) || null }
  function all () { return Object.fromEntries(_state) }
  function subscribe (fn) { _listeners.add(fn); return () => _listeners.delete(fn) }

  window.rmHealthRegistry = { set, get, all, subscribe }

  // ── Status pill (top-right, next to icon buttons) ─────────
  // Visibility rules:
  //   - Hide while no channels are loaded yet
  //   - Hide if ALL non-Meta channels are "healthy" or "not_connected"
  //     (a not-connected channel shouldn't nag — that's a setup choice)
  //   - Show if ANY of WhatsApp/Google/TikTok is in {expired, revoked, expiring_soon, unhealthy, error}
  const PROBLEM_HEALTHS = new Set(['expired', 'revoked', 'expiring_soon', 'unhealthy', 'error'])
  const NON_META = ['whatsapp', 'google', 'tiktok']

  function injectStyles () {
    if (document.getElementById('rm-health-pill-styles')) return
    const css = `
      .rm-health-pill { display:none; align-items:center; gap:8px; padding:8px 14px; height:38px; border-radius:999px; background:#fef3c7; color:#92400e; border:1px solid #fcd34d; cursor:pointer; font-family:'Inter',sans-serif; font-size:12.5px; font-weight:600; transition:background .15s, transform .15s; flex-shrink:0; margin-right:8px; }
      .rm-health-pill.show { display:inline-flex; }
      .rm-health-pill:hover { background:#fde68a; transform:translateY(-1px); }
      .rm-health-pill-dot { width:7px; height:7px; border-radius:50%; background:#f59e0b; box-shadow:0 0 6px #f59e0b; animation:ae-pulse 1.6s ease-in-out infinite; }
      .rm-health-pop { position:absolute; top:48px; right:140px; z-index:1100; background:#fff; border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; box-shadow:0 12px 32px rgba(0,0,0,.10); width:300px; padding:8px; display:none; }
      .rm-health-pop.open { display:block; }
      .rm-health-pop-h { padding:8px 12px; font-size:11px; font-weight:700; letter-spacing:0.1em; color:var(--rm-muted, #7a7e79); text-transform:uppercase; }
      .rm-health-pop-row { display:grid; grid-template-columns:24px 1fr auto; gap:10px; align-items:center; padding:10px 12px; border-radius:6px; text-decoration:none; color:inherit; cursor:pointer; }
      .rm-health-pop-row:hover { background:var(--rp-surface-raised, #f6f3ee); }
      .rm-health-pop-row-emoji { font-size:18px; }
      .rm-health-pop-row-label { font-size:13px; font-weight:600; color:var(--rm-ink, #0f1410); }
      .rm-health-pop-row-msg { font-size:11.5px; color:var(--rm-muted, #7a7e79); margin-top:1px; }
      .rm-health-pop-row-cta { font-family:var(--rm-mono); font-size:10px; font-weight:700; letter-spacing:0.08em; color:var(--rm-green-deep, #004d35); white-space:nowrap; }
    `
    const s = document.createElement('style')
    s.id = 'rm-health-pill-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  function ensurePill () {
    let pill = document.getElementById('rm-health-pill')
    if (pill) return pill
    injectStyles()
    pill = document.createElement('button')
    pill.id = 'rm-health-pill'
    pill.className = 'rm-health-pill'
    pill.type = 'button'
    pill.setAttribute('aria-haspopup', 'menu')
    pill.innerHTML = `<span class="rm-health-pill-dot"></span><span data-pill-label>1 canal necesita atención</span>`

    // Insert before the first icon button in the topbar right cluster
    const right = document.querySelector('.rp-topbar-right')
    if (right) {
      right.insertBefore(pill, right.firstChild)
    } else {
      document.body.appendChild(pill)
    }

    pill.addEventListener('click', e => {
      e.stopPropagation()
      togglePopover()
    })
    return pill
  }

  function ensurePopover () {
    let pop = document.getElementById('rm-health-pop')
    if (pop) return pop
    pop = document.createElement('div')
    pop.id = 'rm-health-pop'
    pop.className = 'rm-health-pop'
    document.body.appendChild(pop)

    document.addEventListener('click', e => {
      if (!pop.classList.contains('open')) return
      const pill = document.getElementById('rm-health-pill')
      if (e.target === pill || pill?.contains(e.target) || pop.contains(e.target)) return
      pop.classList.remove('open')
    })
    return pop
  }

  function togglePopover () {
    const pop = ensurePopover()
    pop.classList.toggle('open')
    if (pop.classList.contains('open')) renderPopover()
  }

  function ctaForState (state) {
    if (state.health === 'expired' || state.health === 'revoked' || state.health === 'expiring_soon' || state.health === 'unhealthy' || state.health === 'error') {
      return { label: 'ARREGLAR', href: '#settings' }
    }
    if (state.health === 'not_connected') {
      return { label: 'CONECTAR', href: '#settings' }
    }
    return { label: 'OK', href: '#settings' }
  }

  function rowEmoji (channel) {
    return channel === 'meta' ? '📘' : channel === 'whatsapp' ? '💬' : channel === 'google' ? '🔍' : '🎵'
  }

  function rowLabel (channel) {
    return channel === 'meta' ? 'Meta' : channel === 'whatsapp' ? 'WhatsApp' : channel === 'google' ? 'Google Ads' : 'TikTok'
  }

  function renderPopover () {
    const pop = ensurePopover()
    const channels = ['meta', 'whatsapp', 'google', 'tiktok']
    pop.innerHTML = `
      <div class="rm-health-pop-h">Estado de tus canales</div>
      ${channels.map(ch => {
        const s = get(ch) || { health: 'unknown', label: '...' }
        const cta = ctaForState(s)
        return `
          <a class="rm-health-pop-row" href="${cta.href}">
            <span class="rm-health-pop-row-emoji">${rowEmoji(ch)}</span>
            <div>
              <div class="rm-health-pop-row-label">${rowLabel(ch)}</div>
              <div class="rm-health-pop-row-msg">${s.label || s.health}</div>
            </div>
            <span class="rm-health-pop-row-cta">${cta.label}</span>
          </a>
        `
      }).join('')}
    `
  }

  function refreshPill () {
    const pill = ensurePill()
    const problems = NON_META.filter(ch => {
      const s = get(ch)
      return s && PROBLEM_HEALTHS.has(s.health)
    })
    if (problems.length === 0) {
      pill.classList.remove('show')
      return
    }
    pill.classList.add('show')
    const label = pill.querySelector('[data-pill-label]')
    if (label) label.textContent = problems.length === 1
      ? `${rowLabel(problems[0])} necesita atención`
      : `${problems.length} canales necesitan atención`
  }

  // ── Wire ─────────────────────────────────────────────────
  subscribe(() => refreshPill())

  document.addEventListener('DOMContentLoaded', () => {
    ensurePill()
    setTimeout(refreshPill, 300)   // give per-channel watchers time to populate
  })
})()
