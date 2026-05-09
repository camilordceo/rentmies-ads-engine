/* ─────────────────────────────────────────────────────────────
   Google Lead Forms list (Step 28)
   /dashboard#google-leads · #google/lead-forms

   Lists captured leads with status, source campaign, and quick
   actions (mark as contacted, view details, export CSV).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'google-leads'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  const state = {
    loading: true,
    leads: [],
    filter: 'all',           // 'all' | 'new' | 'contacted' | 'qualified' | 'closed'
    error: null
  }

  function timeAgo (iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60)    return 'hace ' + Math.round(diff) + 's'
    if (diff < 3600)  return 'hace ' + Math.round(diff / 60) + ' min'
    if (diff < 86400) return 'hace ' + Math.round(diff / 3600) + 'h'
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
  }

  function statusKind (s) {
    s = (s || '').toLowerCase()
    if (s === 'new') return 'busy'
    if (s === 'contacted') return 'warn'
    if (s === 'qualified') return 'ok'
    if (s === 'meeting') return 'ok'
    if (s === 'closed') return 'ok'
    if (s === 'lost') return 'rejected'
    return 'off'
  }

  function applyFilter (list) {
    if (state.filter === 'all') return list
    return list.filter(l => (l.status || '').toLowerCase() === state.filter)
  }

  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html(PAGE_ID) : ''
    const filtered = applyFilter(state.leads)
    const total = state.leads.length
    const newCount = state.leads.filter(l => l.status === 'new').length

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">GOOGLE ADS · LEAD FORMS</span>
            <h1 class="rp-display">Leads de <em>Google</em></h1>
            <p class="rp-subhead">Capturas en tiempo real desde Lead Form Extensions. ${newCount} sin contactar de ${total} totales esta semana.</p>
          </div>
          <button type="button" class="ae-btn-ghost" id="gpl-export">⬇ Descargar CSV</button>
        </div>

        <div class="wa-toolbar" style="margin-bottom: 18px;">
          <div class="wa-chips">
            ${[
              ['all',        'Todos',      total],
              ['new',        'Nuevos',     state.leads.filter(l => l.status === 'new').length],
              ['contacted',  'Contactados',state.leads.filter(l => l.status === 'contacted').length],
              ['qualified',  'Calificados',state.leads.filter(l => l.status === 'qualified').length],
              ['closed',     'Cerrados',   state.leads.filter(l => l.status === 'closed').length],
              ['lost',       'Perdidos',   state.leads.filter(l => l.status === 'lost').length]
            ].map(([k, label, count]) => `
              <button type="button" class="wa-chip ${state.filter === k ? 'is-active' : ''}" data-lead-filter="${esc(k)}">
                ${esc(label)} <span class="wa-chip-count">${count}</span>
              </button>
            `).join('')}
          </div>
        </div>

        ${state.loading ? `
          <div class="ae-formcard"><div class="rmc-skel"><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div></div></div>
        ` : filtered.length === 0 ? `
          ${state.leads.length === 0 ? emptyHtml() : `
            <div class="ae-formcard" style="text-align:center; padding:32px; color:var(--rm-muted);">Ningún lead en este filtro</div>
          `}
        ` : `
          <div class="gpl-list">
            ${filtered.map(rowHtml).join('')}
          </div>
        `}
      </section>
    `
  }

  function rowHtml (l) {
    const ans = l.answers || {}
    const property = ans.PROPERTY || ans.property || l.property_interested || ''
    return `
      <div class="gpl-row">
        <div class="gpl-row-l">
          <div class="gpl-row-name">${esc(l.full_name || ans.FULL_NAME || ans.NAME || 'Sin nombre')}</div>
          <div class="gpl-row-meta">
            ${l.phone_e164 ? `<span><a href="https://wa.me/${esc((l.phone_e164 || '').replace(/^\+/, ''))}" target="_blank" style="color:#25D366; text-decoration:none;">📱 ${esc(l.phone_e164)}</a></span>` : ''}
            ${l.email ? `<span>✉ ${esc(l.email)}</span>` : ''}
            ${property ? `<span>🏠 ${esc(property)}</span>` : ''}
          </div>
        </div>
        <div class="gpl-row-r">
          <span class="wa-status-pill wa-status-pill--${statusKind(l.status)}">${esc((l.status || 'new').toUpperCase())}</span>
          <span class="gpl-row-time">${esc(timeAgo(l.captured_at))}</span>
          <select class="ae-input gpl-status-select" data-lead-id="${esc(l.id)}">
            ${['new','contacted','qualified','meeting','closed','lost'].map(s => `<option value="${esc(s)}" ${l.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </div>
      </div>
    `
  }

  function emptyHtml () {
    return window.rmc?.emptyState ? window.rmc.emptyState({
      icon: '📥',
      eyebrow: 'NINGÚN LEAD AÚN',
      title: 'Aquí caen los leads de Google',
      body: 'Cuando un usuario llene un Lead Form Extension de tus campañas Performance Max, aparece aquí en tiempo real. Si ya tienes una campaña activa, espera unas horas.',
      ctaLabel: 'Ir a campañas →',
      ctaHref: '#google/campaigns'
    }) : ''
  }

  function csvEsc (v) {
    if (v == null) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  function exportCsv () {
    const rows = state.leads
    if (!rows.length) return
    const headers = ['captured_at','status','full_name','email','phone_e164','property','source_campaign']
    const lines = [headers.join(',')]
    for (const l of rows) {
      lines.push([
        csvEsc(l.captured_at),
        csvEsc(l.status),
        csvEsc(l.full_name || l.answers?.FULL_NAME),
        csvEsc(l.email),
        csvEsc(l.phone_e164),
        csvEsc(l.answers?.PROPERTY || l.property_interested),
        csvEsc(l.google_campaign_id)
      ].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `google_leads_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function wire () {
    document.querySelectorAll('[data-lead-filter]').forEach(btn => {
      btn.addEventListener('click', () => { state.filter = btn.dataset.leadFilter; render() })
    })
    document.getElementById('gpl-export')?.addEventListener('click', exportCsv)
    document.querySelectorAll('.gpl-status-select').forEach(sel => {
      sel.addEventListener('change', async e => {
        const id = sel.dataset.leadId
        try {
          await window.rmApi.post('/api/google/leads/update?id=' + encodeURIComponent(id), { status: e.target.value })
          window.rmToast?.('✓ Status actualizado', 'success')
        } catch (err) {
          window.rmToast?.(`✗ ${err.message}`, 'error')
          sel.value = state.leads.find(l => l.id === id)?.status || 'new'
        }
      })
    })
  }

  function injectStylesOnce () {
    if (document.getElementById('gpl-styles')) return
    const css = `
      .gpl-list { display: flex; flex-direction: column; gap: 8px; }
      .gpl-row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; transition: border-color .15s; }
      .gpl-row:hover { border-color: #4285F4; }
      .gpl-row-l { flex: 1; min-width: 0; }
      .gpl-row-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
      .gpl-row-meta { display: flex; gap: 14px; font-size: 12px; color: var(--rm-ink-2, #3a3f3b); flex-wrap: wrap; }
      .gpl-row-r { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
      .gpl-row-time { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); }
      .gpl-status-select { padding: 5px 10px; font-size: 11.5px; min-width: 120px; }
    `
    const s = document.createElement('style'); s.id = 'gpl-styles'; s.textContent = css; document.head.appendChild(s)
  }

  async function load () {
    state.loading = true; render()
    try {
      const r = await window.rmApi.get('/api/google/leads/list')
      state.leads = r.leads || []
    } catch (err) {
      state.error = err.message
    } finally {
      state.loading = false; render()
    }
  }

  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) load() })
  document.addEventListener('DOMContentLoaded', () => { if (window.rmRouter?.currentPage() === PAGE_ID) load() })
})()
