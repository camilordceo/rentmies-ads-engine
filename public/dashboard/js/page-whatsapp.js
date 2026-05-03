/* ─────────────────────────────────────────────────────────────
   WhatsApp Templates — fetch + render via /api/whatsapp?action=templates.
   Reads creds from localStorage.meta_creds (access_token + waba_id).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) }

  let state = {
    templates: [],
    loading: false,
    error: null,
    isMock: false
  }

  function html() {
    const total = state.templates.length
    const approved = state.templates.filter(t => t.status === 'APPROVED').length
    const pending  = state.templates.filter(t => t.status === 'PENDING').length
    const rejected = state.templates.filter(t => t.status === 'REJECTED').length
    const meta = (() => { try { return JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) { return {} } })()

    return `
      <div class="rp-page rp-rise">

        <div data-rp-subnav>${window.rpSubnav ? window.rpSubnav.html('whatsapp') : ''}</div>

        <div class="rp-page-header">
          <span class="rp-eyebrow">WHATSAPP BUSINESS · TEMPLATES</span>
          <h1 class="rp-display">Mensajes <em>aprobados por Meta</em></h1>
          <p class="rp-subhead">Trae los templates que tienes provisionados en tu WABA. <strong>Categorías, status, score de calidad</strong> — todo desde Graph API en vivo.</p>
        </div>

        ${!meta.access_token || !meta.waba_id ? `
          <div class="ae-help warn">
            <strong>Faltan credenciales WhatsApp.</strong> Necesitas el Access Token y el WABA ID en <a href="#settings" style="color:var(--rm-green-deep); text-decoration:underline;">Settings</a> antes de poder traer los templates.
          </div>
        ` : ''}

        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Resumen</span>
            <span class="ae-formcard-h-accessory">${state.isMock ? '<span class="ae-status pending">Datos de muestra</span>' : `<span class="ae-ai-badge">${total} templates</span>`}</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
            <div class="ae-stat">
              <span class="ae-stat-label">Total</span>
              <span class="ae-stat-value">${total}</span>
            </div>
            <div class="ae-stat">
              <span class="ae-stat-label">Aprobados</span>
              <span class="ae-stat-value" style="color:var(--rm-green-deep);">${approved}</span>
            </div>
            <div class="ae-stat">
              <span class="ae-stat-label">Pendientes</span>
              <span class="ae-stat-value" style="color:var(--rm-amber);">${pending}</span>
            </div>
            <div class="ae-stat">
              <span class="ae-stat-label">Rechazados</span>
              <span class="ae-stat-value" style="color:var(--rm-red);">${rejected}</span>
            </div>
          </div>
          <div class="ae-action-row" style="margin-top:14px;">
            <button class="ae-btn-primary" id="wa-fetch-btn" ${state.loading ? 'disabled' : ''}>
              ${state.loading ? '⏳ Cargando…' : '↻ Refrescar templates'}
            </button>
            ${state.error ? `<span class="ae-status-line error">${escapeHtml(state.error)}</span>` : ''}
          </div>
        </section>

        ${state.templates.length === 0 && !state.loading ? `
          <div class="ae-empty">
            <span class="ae-eyebrow">SIN TEMPLATES</span>
            <h2 class="ae-display" style="font-size:26px;">${state.error ? '<em>Error al traer datos</em>' : 'Pulsa <em>Refrescar</em> para empezar'}</h2>
            <p class="ae-subhead" style="margin:0 auto;">${state.error || 'Los templates aparecerán acá cuando se carguen desde Meta.'}</p>
          </div>
        ` : `
          <section class="ae-table">
            <div class="ae-table-row head" style="grid-template-columns: minmax(180px, 2fr) 110px 80px 130px 80px;">
              <span>Template</span><span>Categoría</span><span>Lang</span><span>Status</span><span>Score</span>
            </div>
            ${state.templates.map(rowHtml).join('')}
          </section>
        `}
      </div>
    `
  }

  function rowHtml(t) {
    const score = (t.quality_score && (t.quality_score.score || 'UNKNOWN')) || 'UNKNOWN'
    const scoreColor = score === 'HIGH' ? 'var(--rm-green-deep)' :
                       score === 'MEDIUM' ? 'var(--rm-amber)' :
                       score === 'LOW' ? 'var(--rm-red)' : 'var(--rm-muted)'
    const statusClass = t.status === 'APPROVED' ? 'scheduled' :
                        t.status === 'PENDING' ? 'pending' :
                        t.status === 'REJECTED' ? 'paused' : 'pending'
    return `
      <div class="ae-table-row" style="grid-template-columns: minmax(180px, 2fr) 110px 80px 130px 80px;">
        <span style="font-weight:600; color:var(--rm-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.name || 'sin nombre')}</span>
        <span class="ae-ch">${escapeHtml(t.category || '—')}</span>
        <span class="rm-mono" style="font-size:11px;">${escapeHtml(t.language || '—')}</span>
        <span><span class="ae-status ${statusClass}">${escapeHtml(t.status || '—')}</span></span>
        <span class="rm-mono" style="font-size:11px; color:${scoreColor};">${escapeHtml(score)}</span>
      </div>
    `
  }

  // ── Fetch ─────────────────────────────────────────────────

  async function fetchTemplates() {
    state.loading = true; state.error = null
    render()
    try {
      let meta = {}
      try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
      const headers = {}
      if (meta.access_token) headers['x-meta-token'] = meta.access_token
      if (meta.waba_id) headers['x-waba-id'] = meta.waba_id

      const r = await fetch('/api/whatsapp?action=templates', { headers })
      const text = await r.text()
      let json = {}
      try { json = JSON.parse(text) } catch (_) { json = { error: 'Respuesta inesperada del servidor (' + r.status + ')' } }

      if (!r.ok) {
        state.error = json.error || `HTTP ${r.status}`
        state.templates = []
        state.isMock = false
      } else {
        state.templates = json.data || []
        state.isMock = false
      }
    } catch (err) {
      state.error = err.message
    } finally {
      state.loading = false
      render()
    }
  }

  function wire() {
    document.getElementById('wa-fetch-btn')?.addEventListener('click', fetchTemplates)
  }

  function render() {
    const slot = document.querySelector('section[data-page="whatsapp"]')
    if (!slot) return
    slot.innerHTML = html()
    wire()
  }

  function mount() {
    render()
    // Auto-fetch on first visit if creds are present
    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    if (meta.access_token && meta.waba_id && state.templates.length === 0 && !state.loading) {
      fetchTemplates()
    }
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'whatsapp') mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'whatsapp') mount()
  })
})()
