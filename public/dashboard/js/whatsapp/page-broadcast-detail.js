/* ─────────────────────────────────────────────────────────────
   WhatsApp Broadcast Detail (Step 20)
   /dashboard#wa-broadcast-detail (id in sessionStorage)

   Two phases:
     SENDING / SCHEDULED  → real-time progress view
       - Big progress bar, 4 live counters, ETA, Pausar/Cancelar
       - Live log (last 50 events) terminal-styled
       - Polls /api/whatsapp/broadcasts/get every 5s
     COMPLETED / FAILED   → analytics view
       - Funnel (Sent → Delivered → Read → Replied)
       - Hourly delivery heatmap
       - Paginated recipients table with status filter
       - "Descargar reporte CSV" + "Enviar a no leídos"
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'wa-broadcast-detail'
  const POLL_MS = 5000
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  const state = {
    id: null,
    loading: true,
    broadcast: null,
    recipients: [],          // recent + filtered
    filterStatus: 'all',     // 'all' | 'sent' | 'delivered' | 'read' | 'failed' | 'pending'
    page: 1,
    pageSize: 25,
    pollHandle: null,
    actionInFlight: null,
    error: null
  }

  // ─── Helpers ─────────────────────────────────────────────
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

  function fmtTime (iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function fmtTimeShort (iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function fmtDuration (msTotal) {
    if (!msTotal || msTotal < 0) return '—'
    const sec = Math.floor(msTotal / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} min`
    const hr = Math.floor(min / 60)
    return `${hr}h ${min % 60}m`
  }

  function computeEta (b) {
    if (!b) return null
    const total = b.total_recipients || 0
    const done = (b.sent_count || 0) + (b.failed_count || 0)
    const remaining = Math.max(0, total - done)
    if (!b.started_at || done === 0 || remaining === 0) return null
    const elapsedMs = Date.now() - new Date(b.started_at).getTime()
    const rate = done / elapsedMs   // msgs per ms
    return remaining / Math.max(rate, 1e-9)
  }

  // ─── Phase: SENDING (live progress) ──────────────────────
  function progressHtml (b) {
    const total = b.total_recipients || 0
    const sent = b.sent_count || 0
    const delivered = b.delivered_count || 0
    const read = b.read_count || 0
    const failed = b.failed_count || 0
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0
    const etaMs = computeEta(b)

    const isSending = b.status === 'sending'
    const isPaused = b.status === 'paused'
    const isCancelled = b.status === 'cancelled'

    return `
      <div class="wa-bcd-hero">
        <div class="wa-bcd-hero-h">
          <div>
            <div class="wa-bcd-hero-eyebrow">${esc((b.status || '').toUpperCase())}</div>
            <h2 class="wa-bcd-hero-title">${esc(b.name || 'Broadcast')}</h2>
            <div class="wa-bcd-hero-sub">
              ${b.template?.name ? `<span class="wa-tpl-name">${esc(b.template.name)}</span>` : ''}
              ${b.template?.category ? `<span class="wa-cat-badge wa-cat-${b.template.category === 'MARKETING' ? 'mkt' : b.template.category === 'AUTHENTICATION' ? 'auth' : 'util'}">${esc(b.template.category)}</span>` : ''}
              <span class="wa-bcd-hero-meta">${esc(total.toLocaleString('es-CO'))} destinatarios · empezó ${esc(fmtTime(b.started_at))}</span>
            </div>
          </div>
          <div class="wa-bcd-hero-actions">
            ${isSending ? `<button type="button" class="ae-btn-ghost" id="wa-bcd-pause" ${state.actionInFlight ? 'disabled' : ''}>${state.actionInFlight === 'pause' ? '…' : 'Pausar'}</button>` : ''}
            ${isPaused ? `<button type="button" class="ae-btn-primary" id="wa-bcd-resume" ${state.actionInFlight ? 'disabled' : ''}>${state.actionInFlight === 'resume' ? '…' : 'Reanudar'}</button>` : ''}
            ${(isSending || isPaused) ? `<button type="button" class="ae-btn-ghost" id="wa-bcd-cancel" style="color: var(--rm-red);" ${state.actionInFlight ? 'disabled' : ''}>Cancelar</button>` : ''}
            ${!isCancelled && b.status !== 'completed' ? '' : `<a class="ae-btn-ghost" href="#whatsapp/broadcasts">← Volver</a>`}
          </div>
        </div>

        <div class="wa-bcd-progress-big">
          <div class="wa-bcd-progress-bar"><div class="wa-bcd-progress-fill" style="width:${pct}%"></div></div>
          <div class="wa-bcd-progress-meta">
            <span class="wa-bcd-progress-count"><strong>${sent.toLocaleString('es-CO')}</strong> / ${total.toLocaleString('es-CO')} enviados</span>
            <span class="wa-bcd-progress-pct">${pct}%</span>
            ${etaMs && isSending ? `<span class="wa-bcd-progress-eta">Termina en ~${fmtDuration(etaMs)}</span>` : ''}
          </div>
        </div>

        <div class="wa-bcd-counters">
          <div class="wa-bcd-counter">
            <div class="wa-bcd-counter-label">ENVIADOS</div>
            <div class="wa-bcd-counter-value">${sent.toLocaleString('es-CO')}</div>
          </div>
          <div class="wa-bcd-counter wa-bcd-counter--delivered">
            <div class="wa-bcd-counter-label">ENTREGADOS</div>
            <div class="wa-bcd-counter-value">${delivered.toLocaleString('es-CO')}</div>
            <div class="wa-bcd-counter-pct">${total ? Math.round(delivered / total * 100) : 0}%</div>
          </div>
          <div class="wa-bcd-counter wa-bcd-counter--read">
            <div class="wa-bcd-counter-label">LEÍDOS</div>
            <div class="wa-bcd-counter-value">${read.toLocaleString('es-CO')}</div>
            <div class="wa-bcd-counter-pct">${total ? Math.round(read / total * 100) : 0}%</div>
          </div>
          <div class="wa-bcd-counter wa-bcd-counter--failed">
            <div class="wa-bcd-counter-label">FALLIDOS</div>
            <div class="wa-bcd-counter-value">${failed.toLocaleString('es-CO')}</div>
            <div class="wa-bcd-counter-pct">${total ? Math.round(failed / total * 100) : 0}%</div>
          </div>
        </div>
      </div>
    `
  }

  function logFromRecipients (recipients) {
    // Build the last 50 events from recipient state
    const events = []
    for (const r of recipients) {
      if (r.failed_at)    events.push({ ts: r.failed_at,    title: 'Falló',    body: `${r.phone_e164}${r.error_code ? ' · ' + r.error_code : ''}`, channel: 'fail' })
      if (r.read_at)      events.push({ ts: r.read_at,      title: 'Leído',    body: r.phone_e164, channel: 'read' })
      if (r.delivered_at) events.push({ ts: r.delivered_at, title: 'Entregado', body: r.phone_e164, channel: 'delivered' })
      if (r.sent_at)      events.push({ ts: r.sent_at,      title: 'Enviado',  body: r.phone_e164, channel: 'sent' })
    }
    events.sort((a, b) => new Date(b.ts) - new Date(a.ts))
    return events.slice(0, 50)
  }

  function liveLogHtml (events) {
    if (!events.length) return `<div class="wa-bcd-log-empty">Esperando primer evento…</div>`
    return events.map(e => `
      <div class="wa-bcd-log-row wa-bcd-log-${esc(e.channel)}">
        <span class="wa-bcd-log-time">${esc(fmtTimeShort(e.ts))}</span>
        <span class="wa-bcd-log-tag">${esc(e.title.toUpperCase())}</span>
        <span class="wa-bcd-log-body">${esc(e.body)}</span>
      </div>
    `).join('')
  }

  // ─── Phase: COMPLETED (analytics) ────────────────────────
  function funnelHtml (b) {
    const total = b.total_recipients || 0
    const sent = b.sent_count || 0
    const delivered = b.delivered_count || 0
    const read = b.read_count || 0
    const replied = b.replied_count || 0
    const stages = [
      { label: 'Enviados',   value: sent,      pct: 100 },
      { label: 'Entregados', value: delivered, pct: sent ? Math.round(delivered / sent * 100) : 0 },
      { label: 'Leídos',     value: read,      pct: sent ? Math.round(read / sent * 100)      : 0 },
      { label: 'Respondidos',value: replied,   pct: sent ? Math.round(replied / sent * 100)   : 0 }
    ]
    return `
      <div class="wa-bcd-funnel">
        ${stages.map((s, i) => `
          <div class="wa-bcd-funnel-stage" style="width:${Math.max(20, s.pct)}%;">
            <div class="wa-bcd-funnel-label">${esc(s.label)}</div>
            <div class="wa-bcd-funnel-bar">
              <span class="wa-bcd-funnel-val">${s.value.toLocaleString('es-CO')}</span>
              <span class="wa-bcd-funnel-pct">${s.pct}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  function heatmapHtml (recipients) {
    // 24 hours x 7 days last week. We only have one broadcast so usually
    // it'll be one diagonal; still useful for completion-time analytics.
    const buckets = new Array(24).fill(0)
    for (const r of recipients) {
      const t = r.delivered_at || r.sent_at
      if (!t) continue
      const h = new Date(t).getHours()
      buckets[h]++
    }
    const max = Math.max(1, ...buckets)
    return `
      <div class="wa-bcd-heatmap">
        ${buckets.map((v, h) => `
          <div class="wa-bcd-heatmap-cell" title="${h}:00 — ${v} mensajes" style="--intensity: ${v / max};">
            <div class="wa-bcd-heatmap-fill"></div>
            <div class="wa-bcd-heatmap-hour">${h}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function recipientsTableHtml (recipients) {
    const filtered = state.filterStatus === 'all' ? recipients : recipients.filter(r => (r.status || '').toLowerCase() === state.filterStatus)
    const start = (state.page - 1) * state.pageSize
    const slice = filtered.slice(start, start + state.pageSize)
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize))

    return `
      <div class="wa-bcd-recipients">
        <div class="wa-bcd-recipients-h">
          <div class="wa-chips">
            ${[
              ['all',       'Todos'],
              ['sent',      'Enviados'],
              ['delivered', 'Entregados'],
              ['read',      'Leídos'],
              ['failed',    'Fallidos'],
              ['pending',   'Pendientes']
            ].map(([k, label]) => `
              <button type="button" class="wa-chip ${state.filterStatus === k ? 'is-active' : ''}" data-rec-filter="${esc(k)}">
                ${esc(label)} <span class="wa-chip-count">${k === 'all' ? recipients.length : recipients.filter(r => (r.status || '').toLowerCase() === k).length}</span>
              </button>
            `).join('')}
          </div>
          <div class="wa-bcd-recipients-actions">
            <button type="button" class="ae-btn-ghost" id="wa-bcd-export">⬇ Descargar CSV</button>
            <button type="button" class="ae-btn-authority" id="wa-bcd-resend-unread" ${state.actionInFlight === 'resend' ? 'disabled' : ''}>
              ${state.actionInFlight === 'resend' ? '…' : 'Re-enviar a no leídos'}
            </button>
          </div>
        </div>

        <div class="wa-bcd-recipients-table">
          <table>
            <thead>
              <tr>
                <th>Teléfono</th>
                <th>Status</th>
                <th>Enviado</th>
                <th>Entregado</th>
                <th>Leído</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${slice.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--rm-muted);">Ningún destinatario en este filtro</td></tr>` : slice.map(r => `
                <tr>
                  <td><span class="wa-bcd-phone">${esc(r.phone_e164)}</span></td>
                  <td><span class="wa-status-pill wa-status-pill--${recStatusKind(r.status)}">${esc((r.status || '').toUpperCase())}</span></td>
                  <td>${esc(fmtTimeShort(r.sent_at))}</td>
                  <td>${esc(fmtTimeShort(r.delivered_at))}</td>
                  <td>${esc(fmtTimeShort(r.read_at))}</td>
                  <td><span class="wa-bcd-err">${esc(r.error_code || r.error_message || '')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${totalPages > 1 ? `
          <div class="wa-bcd-pagination">
            <button type="button" class="ae-btn-ghost" data-page-rel="-1" ${state.page === 1 ? 'disabled' : ''}>← Anterior</button>
            <span class="wa-bcd-pagination-info">Página ${state.page} de ${totalPages}</span>
            <button type="button" class="ae-btn-ghost" data-page-rel="+1" ${state.page === totalPages ? 'disabled' : ''}>Siguiente →</button>
          </div>
        ` : ''}
      </div>
    `
  }

  function recStatusKind (s) {
    s = (s || '').toLowerCase()
    if (s === 'sent' || s === 'delivered' || s === 'read' || s === 'replied') return 'ok'
    if (s === 'sending')  return 'busy'
    if (s === 'failed')   return 'rejected'
    return 'off'
  }

  function camilordTipsHtml (b) {
    if (!b) return ''
    const total = b.total_recipients || 0
    const read = b.read_count || 0
    const failed = b.failed_count || 0
    const readRate = total ? read / total : 0

    const tips = []
    if (readRate > 0.6) tips.push({ icon: '⚡', text: `Excelente read rate (${Math.round(readRate*100)}%). Considera repetir esta combinación template+horario.` })
    if (readRate < 0.3 && total > 50) tips.push({ icon: '⚠', text: `Read rate bajo (${Math.round(readRate*100)}%). Probemos otro horario o copy más conciso.` })
    if (failed / total > 0.05) tips.push({ icon: '🚨', text: `${failed} fallos detectados. Limpia tu lista de contactos antes del próximo broadcast.` })
    if (b.status === 'completed' && readRate > 0.5) tips.push({ icon: '🎯', text: `Considera lanzar un follow-up a quienes no respondieron — ese pool ya validó tu canal.` })

    if (tips.length === 0) return ''
    return `
      <div class="wa-bcd-tips">
        <div class="wa-bcd-tips-h">${window.rmc?.aiBadge ? window.rmc.aiBadge('Camilo · insights') : 'Camilo · insights'}</div>
        ${tips.map(t => `
          <div class="wa-bcd-tip"><span class="wa-bcd-tip-icon">${t.icon}</span><span>${esc(t.text)}</span></div>
        `).join('')}
      </div>
    `
  }

  // ─── Page wrapper ────────────────────────────────────────
  function html () {
    if (state.loading) {
      return `
        <section class="rp-page rp-rise">
          <div class="rp-page-header">
            <span class="rp-eyebrow">WHATSAPP · BROADCAST</span>
            <h1 class="rp-display">Cargando…</h1>
          </div>
          <div class="ae-formcard"><div class="rmc-skel">
            <div class="rmc-skel-row"></div><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div>
          </div></div>
        </section>
      `
    }

    if (state.error) {
      return `
        <section class="rp-page rp-rise">
          <div class="ae-help warn"><strong>${esc(state.error)}</strong></div>
          <a class="ae-btn-ghost" href="#whatsapp/broadcasts">← Volver a broadcasts</a>
        </section>
      `
    }

    const b = state.broadcast
    const isLive = b.status === 'sending' || b.status === 'scheduled' || b.status === 'paused'
    const isDone = b.status === 'completed' || b.status === 'cancelled' || b.status === 'failed'
    const events = isLive ? logFromRecipients(state.recipients.slice(0, 50)) : []

    return `
      <section class="rp-page rp-rise">
        <div class="rp-page-header" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom: 14px;">
          <a href="#whatsapp/broadcasts" class="ae-btn-ghost">← Broadcasts</a>
          <span class="rp-eyebrow" style="margin:0;">WHATSAPP · BROADCAST</span>
        </div>

        ${progressHtml(b)}

        ${isLive ? `
          <div class="wa-bcd-section">
            <h3 class="wa-bcd-section-h">${window.rmc?.aiBadge ? window.rmc.aiBadge('Live') : 'LIVE'} · Eventos en tiempo real</h3>
            <div class="wa-bcd-log">
              ${liveLogHtml(events)}
            </div>
          </div>
        ` : ''}

        ${isDone ? `
          ${camilordTipsHtml(b)}

          <div class="wa-bcd-section">
            <h3 class="wa-bcd-section-h">Funnel de conversión</h3>
            ${funnelHtml(b)}
          </div>

          <div class="wa-bcd-section">
            <h3 class="wa-bcd-section-h">Distribución horaria de delivery</h3>
            ${heatmapHtml(state.recipients)}
            <div class="wa-bcd-heatmap-legend">
              <span>0h</span>
              <span style="margin-left:auto;">23h</span>
            </div>
          </div>

          <div class="wa-bcd-section">
            <h3 class="wa-bcd-section-h">Destinatarios</h3>
            ${recipientsTableHtml(state.recipients)}
          </div>
        ` : ''}
      </section>
    `
  }

  // ─── Wire ────────────────────────────────────────────────
  function wire () {
    document.getElementById('wa-bcd-pause')?.addEventListener('click',  () => doAction('pause'))
    document.getElementById('wa-bcd-resume')?.addEventListener('click', () => doAction('resume'))
    document.getElementById('wa-bcd-cancel')?.addEventListener('click', () => doAction('cancel'))
    document.getElementById('wa-bcd-export')?.addEventListener('click', exportCsv)
    document.getElementById('wa-bcd-resend-unread')?.addEventListener('click', () => doAction('resend'))

    document.querySelectorAll('[data-rec-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filterStatus = btn.dataset.recFilter
        state.page = 1
        render()
      })
    })
    document.querySelectorAll('[data-page-rel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rel = parseInt(btn.dataset.pageRel, 10)
        state.page = Math.max(1, state.page + rel)
        render()
      })
    })
  }

  // ─── Actions ─────────────────────────────────────────────
  async function doAction (action) {
    if (state.actionInFlight) return
    if (action === 'cancel' && !confirm('¿Cancelar este broadcast? Los mensajes pendientes no se enviarán.')) return
    state.actionInFlight = action
    render()

    try {
      const path = action === 'pause'  ? '/api/whatsapp/broadcasts/pause'
                 : action === 'resume' ? '/api/whatsapp/broadcasts/resume'
                 : action === 'cancel' ? '/api/whatsapp/broadcasts/cancel'
                 : action === 'resend' ? '/api/whatsapp/broadcasts/resend-unread'
                 : null
      if (!path) throw new Error('unknown action')
      const r = await window.rmApi.post(path + '?id=' + encodeURIComponent(state.id), {})
      if (action === 'resend' && r.id) {
        window.rmToast?.('✓ Nuevo broadcast creado para no leídos', 'success')
        try { sessionStorage.setItem('wa_broadcast_view_id', r.id) } catch (_) {}
        location.reload()
        return
      }
      window.rmToast?.('✓ Acción aplicada', 'success')
      await loadOnce()
    } catch (err) {
      window.rmToast?.(`✗ ${err.message}`, 'error')
    } finally {
      state.actionInFlight = null
      render()
    }
  }

  function exportCsv () {
    const rows = state.recipients
    if (!rows.length) { window.rmToast?.('No hay destinatarios para exportar', 'info'); return }
    const headers = ['phone_e164','status','sent_at','delivered_at','read_at','failed_at','error_code','error_message']
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push(headers.map(h => csvEsc(r[h])).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `broadcast_${state.id}_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function csvEsc (v) {
    if (v == null) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  // ─── Loading + polling ───────────────────────────────────
  async function loadOnce () {
    try {
      const r = await window.rmApi.get('/api/whatsapp/broadcasts/get?id=' + encodeURIComponent(state.id))
      state.broadcast = r.broadcast
      state.recipients = r.recipients || []
      state.loading = false
      state.error = null
    } catch (err) {
      state.loading = false
      state.error = err.message || 'Error cargando broadcast'
    }
    render()
  }

  function startPolling () {
    stopPolling()
    state.pollHandle = setInterval(async () => {
      const b = state.broadcast
      const stillLive = b && (b.status === 'sending' || b.status === 'scheduled' || b.status === 'paused')
      if (!stillLive) { stopPolling(); return }
      await loadOnce()
    }, POLL_MS)
  }
  function stopPolling () {
    if (state.pollHandle) { clearInterval(state.pollHandle); state.pollHandle = null }
  }

  // ─── Styles ──────────────────────────────────────────────
  function injectStylesOnce () {
    if (document.getElementById('wa-bcd-styles')) return
    const css = `
      .wa-bcd-hero { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; padding: 24px 28px; margin-bottom: 22px; }
      .wa-bcd-hero-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
      .wa-bcd-hero-eyebrow { font-family: var(--rm-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--rp-teal-deep, var(--rm-green-deep, #004d35)); text-transform: uppercase; margin-bottom: 5px; }
      .wa-bcd-hero-title { font-family: var(--rp-font); font-weight: 800; font-size: 26px; line-height: 1.18; letter-spacing: -0.02em; margin: 0 0 8px; color: var(--rp-ink, #1c1b1b); }
      .wa-bcd-hero-sub { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--rm-ink-2, #3a3f3b); }
      .wa-bcd-hero-meta { font-family: var(--rm-mono); font-size: 11.5px; color: var(--rm-muted, #7a7e79); }
      .wa-bcd-hero-actions { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }

      .wa-bcd-progress-big { margin: 8px 0 22px; }
      .wa-bcd-progress-bar { height: 12px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; overflow: hidden; margin-bottom: 10px; }
      .wa-bcd-progress-fill { height: 100%; background: linear-gradient(90deg, #25D366, var(--rp-teal, #40d99d)); transition: width .3s ease-out; box-shadow: 0 0 8px rgba(37,211,102,0.4); }
      .wa-bcd-progress-meta { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; font-size: 13px; }
      .wa-bcd-progress-count strong { font-size: 17px; font-weight: 800; }
      .wa-bcd-progress-pct { font-family: var(--rm-mono); font-size: 11.5px; color: var(--rm-muted, #7a7e79); }
      .wa-bcd-progress-eta { margin-left: auto; font-family: var(--rm-mono); font-size: 12px; color: var(--rp-teal-deep, var(--rm-green-deep, #004d35)); }

      .wa-bcd-counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .wa-bcd-counter { padding: 14px 16px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; }
      .wa-bcd-counter-label { font-family: var(--rm-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); margin-bottom: 5px; }
      .wa-bcd-counter-value { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: var(--rm-ink, #0f1410); }
      .wa-bcd-counter-pct { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); margin-top: 2px; }
      .wa-bcd-counter--delivered { background: rgba(37,211,102,0.06); }
      .wa-bcd-counter--delivered .wa-bcd-counter-value { color: #25D366; }
      .wa-bcd-counter--read      { background: rgba(66,133,244,0.06); }
      .wa-bcd-counter--read      .wa-bcd-counter-value { color: #4285F4; }
      .wa-bcd-counter--failed    { background: rgba(192,57,43,0.06); }
      .wa-bcd-counter--failed    .wa-bcd-counter-value { color: var(--rm-red, #c0392b); }

      @media (max-width: 768px) {
        .wa-bcd-counters { grid-template-columns: repeat(2, 1fr); }
        .wa-bcd-hero-h { flex-direction: column; }
      }

      .wa-bcd-section { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; padding: 22px 26px; margin-bottom: 20px; }
      .wa-bcd-section-h { font-family: var(--rp-font); font-size: 15px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; color: var(--rm-ink, #0f1410); }

      /* Live log — terminal style */
      .wa-bcd-log { background: #0c0d0c; color: #d6e2dc; border-radius: 6px; padding: 14px 16px; font-family: var(--rm-mono, 'JetBrains Mono', monospace); font-size: 11.5px; line-height: 1.6; max-height: 360px; overflow-y: auto; }
      .wa-bcd-log-empty { color: rgba(255,255,255,.5); padding: 18px 0; text-align: center; font-style: italic; }
      .wa-bcd-log-row { display: grid; grid-template-columns: 76px 90px 1fr; gap: 10px; padding: 3px 0; }
      .wa-bcd-log-row + .wa-bcd-log-row { border-top: 1px solid rgba(255,255,255,.06); padding-top: 5px; margin-top: 2px; }
      .wa-bcd-log-time { color: #7a8a82; }
      .wa-bcd-log-tag  { font-weight: 700; }
      .wa-bcd-log-body { color: #a5b4ad; }
      .wa-bcd-log-sent      .wa-bcd-log-tag { color: #5fe5b3; }
      .wa-bcd-log-delivered .wa-bcd-log-tag { color: #25D366; }
      .wa-bcd-log-read      .wa-bcd-log-tag { color: #6FA8FF; }
      .wa-bcd-log-fail      .wa-bcd-log-tag { color: #ff6e6e; }

      /* Funnel */
      .wa-bcd-funnel { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
      .wa-bcd-funnel-stage { padding: 0 14px; transition: width .3s; }
      .wa-bcd-funnel-stage:nth-child(1) .wa-bcd-funnel-bar { background: linear-gradient(90deg, var(--rp-teal-deep, #004d35), var(--rp-teal, #40d99d)); }
      .wa-bcd-funnel-stage:nth-child(2) .wa-bcd-funnel-bar { background: #25D366; }
      .wa-bcd-funnel-stage:nth-child(3) .wa-bcd-funnel-bar { background: #4285F4; }
      .wa-bcd-funnel-stage:nth-child(4) .wa-bcd-funnel-bar { background: #6f4ed4; }
      .wa-bcd-funnel-label { font-size: 11.5px; font-weight: 600; color: var(--rm-ink-2, #3a3f3b); margin-bottom: 4px; }
      .wa-bcd-funnel-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-radius: 4px; color: white; }
      .wa-bcd-funnel-val { font-family: var(--rp-font); font-size: 15px; font-weight: 700; }
      .wa-bcd-funnel-pct { font-family: var(--rm-mono); font-size: 11.5px; opacity: 0.85; }

      /* Heatmap */
      .wa-bcd-heatmap { display: grid; grid-template-columns: repeat(24, 1fr); gap: 4px; }
      .wa-bcd-heatmap-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .wa-bcd-heatmap-fill { width: 100%; height: 36px; border-radius: 4px; background: rgba(64,217,157, calc(0.08 + var(--intensity) * 0.78)); border: 1px solid rgba(64,217,157, calc(0.12 + var(--intensity) * 0.8)); }
      .wa-bcd-heatmap-hour { font-family: var(--rm-mono); font-size: 9px; color: var(--rm-muted, #7a7e79); }
      .wa-bcd-heatmap-legend { display: flex; margin-top: 6px; font-family: var(--rm-mono); font-size: 10px; color: var(--rm-muted, #7a7e79); }

      /* Recipients */
      .wa-bcd-recipients-h { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
      .wa-bcd-recipients-actions { margin-left: auto; display: flex; gap: 8px; }
      .wa-chip-count { background: var(--rp-surface, #fff); padding: 1px 6px; border-radius: 999px; margin-left: 4px; font-size: 10px; }
      .wa-chip.is-active .wa-chip-count { background: rgba(255,255,255,.18); color: #fff; }
      .wa-bcd-recipients-table { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; overflow: hidden; overflow-x: auto; }
      .wa-bcd-recipients-table table { width: 100%; border-collapse: collapse; }
      .wa-bcd-recipients-table thead th { padding: 10px 14px; font-family: var(--rm-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); text-align: left; border-bottom: 1px solid var(--rm-border, #e8e3dc); background: var(--rp-surface-raised, #f6f3ee); text-transform: uppercase; }
      .wa-bcd-recipients-table tbody td { padding: 10px 14px; border-bottom: 1px solid var(--rm-border, #e8e3dc); font-size: 12.5px; color: var(--rm-ink, #0f1410); }
      .wa-bcd-recipients-table tbody tr:last-child td { border-bottom: none; }
      .wa-bcd-phone { font-family: var(--rm-mono); font-size: 12px; }
      .wa-bcd-err   { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-red, #c0392b); }

      .wa-bcd-pagination { display: flex; align-items: center; gap: 14px; margin-top: 14px; justify-content: center; }
      .wa-bcd-pagination-info { font-family: var(--rm-mono); font-size: 11.5px; color: var(--rm-muted, #7a7e79); }

      /* Tips */
      .wa-bcd-tips { padding: 16px 18px; background: linear-gradient(135deg, rgba(64,217,157,0.08), rgba(0,108,74,0.04)); border: 1px solid rgba(64,217,157,0.25); border-radius: 8px; margin-bottom: 20px; }
      .wa-bcd-tips-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .wa-bcd-tip { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; font-size: 13px; color: var(--rm-ink, #0f1410); line-height: 1.5; }
      .wa-bcd-tip-icon { font-size: 16px; flex-shrink: 0; line-height: 1.5; }
    `
    const s = document.createElement('style')
    s.id = 'wa-bcd-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  // ─── Render entry ───────────────────────────────────────
  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  async function mount () {
    let id = null
    try { id = sessionStorage.getItem('wa_broadcast_view_id') } catch (_) {}
    if (!id) { window.rmRouter?.goTo('wa-broadcasts'); return }

    state.id = id
    state.loading = true
    state.broadcast = null
    state.recipients = []
    state.error = null
    state.actionInFlight = null
    state.page = 1
    state.filterStatus = 'all'
    render()

    await loadOnce()
    startPolling()
  }

  function unmount () { stopPolling() }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === PAGE_ID) mount()
    else unmount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    if (window.rmRouter?.currentPage() === PAGE_ID) mount()
  })
  window.addEventListener('beforeunload', unmount)
})()
