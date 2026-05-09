/* ─────────────────────────────────────────────────────────────
   WhatsApp Broadcasts list
   /dashboard#wa-broadcasts · #whatsapp/broadcasts

   Lists broadcasts for the empresa with status pills and live
   counters (sent/delivered/read/failed). On mount, polls
   /api/whatsapp/broadcasts/list. The cron processor (Step 19)
   handles actual sending; this page reads state.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'wa-broadcasts'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  const state = {
    broadcasts: [],
    loading: true,
    error: null
  }

  function statusKind (s) {
    s = (s || '').toLowerCase()
    if (s === 'completed') return 'ok'
    if (s === 'sending')   return 'busy'
    if (s === 'scheduled') return 'busy'
    if (s === 'paused')    return 'warn'
    if (s === 'failed')    return 'rejected'
    if (s === 'cancelled') return 'off'
    return 'off'
  }

  function timeAgo (iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)    return 'hace unos seg'
    if (diff < 3600)  return `hace ${Math.round(diff/60)} min`
    if (diff < 86400) return `hace ${Math.round(diff/3600)}h`
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
  }

  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html(PAGE_ID) : ''

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">WHATSAPP · BROADCASTS</span>
            <h1 class="rp-display">Envíos <em>masivos</em></h1>
            <p class="rp-subhead">Sube CSV, mapea variables y dispara templates aprobadas. Camilo respeta tu tier de WhatsApp para que tu quality rating no baje.</p>
          </div>
          <a class="ae-btn-primary" href="#whatsapp/broadcasts/new" style="text-decoration:none;">+ Nuevo broadcast</a>
        </div>

        ${state.error ? `
          <div class="ae-help warn" style="margin-bottom:18px;">
            <strong>${esc(state.error)}</strong>
          </div>
        ` : ''}

        ${state.loading ? `
          <div class="ae-formcard"><div class="rmc-skel">
            <div class="rmc-skel-row"></div>
            <div class="rmc-skel-row"></div>
            <div class="rmc-skel-row"></div>
          </div></div>
        ` : state.broadcasts.length === 0 ? `
          ${window.rmc?.emptyState ? window.rmc.emptyState({
            icon: '📤',
            eyebrow: 'NINGÚN BROADCAST TODAVÍA',
            title: 'Lanza tu primer envío masivo',
            body: 'Selecciona una plantilla aprobada, sube un CSV de contactos, y Camilo se encarga del rate limiting + tracking.',
            ctaLabel: '+ Nuevo broadcast',
            ctaHref: '#whatsapp/broadcasts/new'
          }) : ''}
        ` : `
          <div class="wa-bcs-list">
            ${state.broadcasts.map(b => rowHtml(b)).join('')}
          </div>
        `}
      </section>
    `
  }

  function rowHtml (b) {
    const total = b.total_recipients || 0
    const sent = b.sent_count || 0
    const delivered = b.delivered_count || 0
    const read = b.read_count || 0
    const failed = b.failed_count || 0
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0
    const kind = statusKind(b.status)

    return `
      <div class="wa-bcs-row" data-bcast-id="${esc(b.id)}">
        <div class="wa-bcs-row-h">
          <div>
            <div class="wa-bcs-row-name">${esc(b.name)}</div>
            <div class="wa-bcs-row-meta">${esc(timeAgo(b.created_at))}${b.scheduled_at ? ` · agendado ${esc(timeAgo(b.scheduled_at))}` : ''}</div>
          </div>
          <span class="wa-status-pill wa-status-pill--${kind}">${esc((b.status || 'draft').toUpperCase())}</span>
        </div>
        <div class="wa-bcs-row-progress">
          <div class="wa-bcs-row-bar"><div class="wa-bcs-row-bar-fill" style="width:${pct}%"></div></div>
          <div class="wa-bcs-row-stats">
            <span><strong>${total}</strong> totales</span>
            <span class="wa-bcs-stat-sent"><strong>${sent}</strong> enviados</span>
            <span class="wa-bcs-stat-delivered"><strong>${delivered}</strong> entregados</span>
            <span class="wa-bcs-stat-read"><strong>${read}</strong> leídos</span>
            ${failed > 0 ? `<span class="wa-bcs-stat-failed"><strong>${failed}</strong> fallaron</span>` : ''}
          </div>
        </div>
      </div>
    `
  }

  function injectStylesOnce () {
    if (document.getElementById('wa-bcs-styles')) return
    const css = `
      .wa-bcs-list { display: flex; flex-direction: column; gap: 12px; }
      .wa-bcs-row { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; padding: 16px 20px; transition: border-color .15s, box-shadow .15s; cursor: pointer; }
      .wa-bcs-row:hover { border-color: var(--rp-teal, #40d99d); box-shadow: 0 4px 14px rgba(0,0,0,.04); }
      .wa-bcs-row-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
      .wa-bcs-row-name { font-size: 14.5px; font-weight: 700; color: var(--rm-ink, #0f1410); }
      .wa-bcs-row-meta { font-size: 11.5px; color: var(--rm-muted, #7a7e79); margin-top: 2px; font-family: var(--rm-mono); }
      .wa-bcs-row-bar { height: 4px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
      .wa-bcs-row-bar-fill { height: 100%; background: linear-gradient(90deg, #25D366, var(--rp-teal, #40d99d)); transition: width .3s; }
      .wa-bcs-row-stats { display: flex; gap: 18px; font-size: 12px; color: var(--rm-ink-2, #3a3f3b); flex-wrap: wrap; font-family: var(--rm-mono); }
      .wa-bcs-row-stats strong { color: var(--rm-ink, #0f1410); font-weight: 700; margin-right: 3px; }
      .wa-bcs-stat-sent      strong { color: var(--rm-green-deep, #004d35); }
      .wa-bcs-stat-delivered strong { color: #25D366; }
      .wa-bcs-stat-read      strong { color: #4285F4; }
      .wa-bcs-stat-failed    strong { color: var(--rm-red, #c0392b); }
    `
    const s = document.createElement('style')
    s.id = 'wa-bcs-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  async function load () {
    state.loading = true
    state.error = null
    render()
    try {
      const r = await window.rmApi.get('/api/whatsapp/broadcasts/list')
      state.broadcasts = r.broadcasts || []
    } catch (err) {
      state.error = err.message
    } finally {
      state.loading = false
      render()
    }
  }

  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    // Important: do NOT overwrite if coming-soon already rendered something
    // — but since we mount on rm-page-change, slot will be filled with coming-soon content
    // first, then this overrides. That's fine — full takeover.
    slot.innerHTML = html()
    document.querySelectorAll('[data-bcast-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.bcastId
        try { sessionStorage.setItem('wa_broadcast_view_id', id) } catch (_) {}
        window.rmRouter?.goTo('wa-broadcast-detail')
      })
    })
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) load() })
  document.addEventListener('DOMContentLoaded', () => {
    if (window.rmRouter?.currentPage() === PAGE_ID) load()
  })
})()
