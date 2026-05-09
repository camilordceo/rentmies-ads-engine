/* ─────────────────────────────────────────────────────────────
   Google Campaigns List (Step 27)
   /dashboard#google-campaigns · #google/campaigns

   Stats row + filter chips + sortable table with live metrics.
   On mount: loads cached campaigns from /api/google/campaigns/list,
   then triggers a live refresh (?refresh=1) in the background.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'google-campaigns'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  const state = {
    loading: true,
    campaigns: [],
    filter: 'all',           // 'all' | 'ENABLED' | 'PAUSED' | 'REMOVED' | 'DRAFT'
    refreshing: false,
    syncedAt: null,
    syncWarning: null,
    source: 'cache',
    googleConn: null,
    googleConnLoaded: false
  }

  function fmtMoney (micros, currency) {
    if (!micros) return '$0'
    const dollars = Number(micros) / 1_000_000
    if (currency === 'COP') return '$' + Math.round(dollars).toLocaleString('es-CO')
    return '$' + dollars.toFixed(2)
  }
  function fmtPct (n) { return (n * 100).toFixed(2) + '%' }

  function statusKind (s) {
    s = (s || '').toUpperCase()
    if (s === 'ENABLED')  return 'ok'
    if (s === 'PAUSED')   return 'warn'
    if (s === 'REMOVED')  return 'rejected'
    if (s === 'DRAFT')    return 'busy'
    return 'off'
  }

  function computeStats (campaigns) {
    const stats = { spend_micros: 0, clicks: 0, conversions: 0, cost_per_conv_micros: 0 }
    for (const c of campaigns) {
      stats.spend_micros += Number(c.cost_micros || 0)
      stats.clicks += Number(c.clicks || 0)
      stats.conversions += Number(c.conversions || 0)
    }
    if (stats.conversions > 0) stats.cost_per_conv_micros = Math.round(stats.spend_micros / stats.conversions)
    return stats
  }

  function applyFilter (list) {
    if (state.filter === 'all') return list
    return list.filter(c => (c.status || '').toUpperCase() === state.filter)
  }

  // ─── HTML ────────────────────────────────────────────────
  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html(PAGE_ID) : ''

    if (state.googleConnLoaded && (!state.googleConn || !state.googleConn.connected)) {
      return notConnectedHtml(subnav)
    }

    const stats = computeStats(state.campaigns)
    const filtered = applyFilter(state.campaigns)

    const kpis = [
      { label: 'GASTO ÚLTIMOS 30D', value: fmtMoney(stats.spend_micros), highlight: false },
      { label: 'CLICKS',             value: stats.clicks.toLocaleString('es-CO') },
      { label: 'CONVERSIONES',       value: stats.conversions.toFixed(0), highlight: true },
      { label: 'AVG CPA',            value: stats.conversions > 0 ? fmtMoney(stats.cost_per_conv_micros) : '—' }
    ]

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">GOOGLE ADS · CAMPAIGNS</span>
            <h1 class="rp-display">Campañas de <em>Google</em></h1>
            <p class="rp-subhead">Performance Max + Search + Display. Camilord recomienda escalar las que rinden y pausar las que no.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="ae-btn-ghost" id="gpc-refresh" ${state.refreshing ? 'disabled' : ''}>
              ${state.refreshing ? '⟳ Actualizando…' : '⟳ Actualizar métricas'}
            </button>
            <a class="ae-btn-primary" href="#google/campaigns/new" style="text-decoration:none;">+ Nueva campaña</a>
          </div>
        </div>

        ${state.syncWarning ? `
          <div class="ae-help warn" style="margin-bottom:18px;">
            <strong>Métricas no sincronizadas:</strong> ${esc(state.syncWarning)}<br>
            <small>Mostrando datos de la última sincronización exitosa. Verifica tu conexión Google en Settings.</small>
          </div>
        ` : ''}

        <!-- KPIs -->
        <div class="rp-stats" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:24px;">
          ${kpis.map(k => window.rmc?.statTile ? window.rmc.statTile(k) : `
            <div class="rmc-stat ${k.highlight ? 'is-highlight' : ''}">
              <div class="rmc-stat-label">${esc(k.label)}</div>
              <div class="rmc-stat-value">${esc(k.value)}</div>
            </div>
          `).join('')}
        </div>

        <!-- Filter chips -->
        <div class="wa-toolbar">
          <div class="wa-chips" role="tablist" aria-label="Status">
            ${[
              ['all',     'Todas',   state.campaigns.length],
              ['ENABLED', 'Activas', state.campaigns.filter(c => c.status === 'ENABLED').length],
              ['PAUSED',  'Pausadas', state.campaigns.filter(c => c.status === 'PAUSED').length],
              ['DRAFT',   'Borrador', state.campaigns.filter(c => c.status === 'DRAFT').length],
              ['REMOVED', 'Removidas', state.campaigns.filter(c => c.status === 'REMOVED').length]
            ].map(([k, label, count]) => `
              <button type="button" class="wa-chip ${state.filter === k ? 'is-active' : ''}" data-status-filter="${esc(k)}">
                ${esc(label)} <span class="wa-chip-count">${count}</span>
              </button>
            `).join('')}
          </div>
          ${state.syncedAt ? `<span class="rmc-pill rmc-pill--ok"><span class="rmc-pill-dot"></span><span>Sync ${esc(timeAgo(state.syncedAt))}</span></span>` : ''}
        </div>

        ${state.loading ? `
          <div class="ae-formcard"><div class="rmc-skel"><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div></div></div>
        ` : filtered.length === 0 ? `
          ${state.campaigns.length === 0 ? emptyHtml() : `
            <div class="ae-formcard" style="text-align:center; padding:32px; color:var(--rm-muted);">
              Ninguna campaña en este filtro.
              <button type="button" class="ae-btn-ghost" style="margin-top:10px;" id="gpc-clear-filter">Limpiar filtro</button>
            </div>
          `}
        ` : `
          <div class="gpc-table-wrap">
            <table class="gpc-table">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Imp.</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>Conv.</th>
                  <th>Spend</th>
                  <th>CPA</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(c => rowHtml(c)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    `
  }

  function rowHtml (c) {
    const ctr = c.impressions > 0 ? c.clicks / c.impressions : 0
    return `
      <tr class="gpc-row" data-cid="${esc(c.id)}">
        <td>
          <div class="gpc-name">${esc(c.name || '')}</div>
          ${c.final_url ? `<div class="gpc-url">${esc(c.final_url.replace(/^https?:\/\//, ''))}</div>` : ''}
        </td>
        <td><span class="gpc-type">${esc((c.campaign_type || '').replace('_', ' '))}</span></td>
        <td><span class="wa-status-pill wa-status-pill--${statusKind(c.status)}">${esc((c.status || '').toUpperCase())}</span></td>
        <td><span class="gpc-budget">${fmtMoney(c.budget_amount_micros, c.budget_currency_code)}/d</span></td>
        <td>${(c.impressions || 0).toLocaleString('es-CO')}</td>
        <td>${(c.clicks || 0).toLocaleString('es-CO')}</td>
        <td>${fmtPct(ctr)}</td>
        <td>${(Number(c.conversions || 0)).toFixed(0)}</td>
        <td>${fmtMoney(c.cost_micros)}</td>
        <td>${c.conversions > 0 ? fmtMoney(c.cost_per_conversion_micros) : '—'}</td>
        <td class="gpc-actions">
          <button type="button" class="ae-btn-ghost" data-act="${c.status === 'ENABLED' ? 'pause' : 'enable'}" data-cid="${esc(c.id)}">
            ${c.status === 'ENABLED' ? 'Pausar' : 'Activar'}
          </button>
        </td>
      </tr>
    `
  }

  function emptyHtml () {
    return window.rmc?.emptyState ? window.rmc.emptyState({
      icon: '🎯',
      eyebrow: 'NINGUNA CAMPAÑA TODAVÍA',
      title: 'Crea tu primera campaña de Google',
      body: 'Performance Max distribuye automáticamente entre Search, YouTube, Display, Maps y Discover. Camilord arma el copy basado en uno de tus inmuebles.',
      ctaLabel: '+ Nueva campaña',
      ctaHref: '#google/campaigns/new'
    }) : ''
  }

  function notConnectedHtml (subnav) {
    return `
      <section class="rp-page rp-rise">
        ${subnav}
        <div class="rp-page-header">
          <span class="rp-eyebrow">GOOGLE ADS</span>
          <h1 class="rp-display">Conecta tu cuenta primero</h1>
        </div>
        ${window.rmc?.emptyState ? window.rmc.emptyState({
          icon: '🔗',
          eyebrow: 'CONEXIÓN REQUERIDA',
          title: 'Vincula tu Google Ads',
          body: 'Necesitamos OAuth + tu customer ID para crear y gestionar campañas. Toma 2 min si ya tienes Google Ads Manager (MCC) activo.',
          ctaLabel: 'Ir a Settings →',
          ctaHref: '#settings'
        }) : ''}
      </section>
    `
  }

  function timeAgo (iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'hace ' + Math.round(diff) + 's'
    if (diff < 3600) return 'hace ' + Math.round(diff/60) + ' min'
    return 'hace ' + Math.round(diff/3600) + 'h'
  }

  // ─── Wire ────────────────────────────────────────────────
  function wire () {
    document.querySelectorAll('[data-status-filter]').forEach(btn => {
      btn.addEventListener('click', () => { state.filter = btn.dataset.statusFilter; render() })
    })
    document.getElementById('gpc-clear-filter')?.addEventListener('click', () => { state.filter = 'all'; render() })
    document.getElementById('gpc-refresh')?.addEventListener('click', () => loadCampaigns(true))
    document.querySelectorAll('.gpc-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.gpc-actions')) return
        try { sessionStorage.setItem('google_campaign_view_id', row.dataset.cid) } catch (_) {}
        window.rmRouter?.goTo('google-campaign-detail')
      })
    })
    document.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const id = btn.dataset.cid
        const action = btn.dataset.act
        btn.disabled = true
        try {
          await window.rmApi.post(`/api/google/campaigns/${action}?id=${encodeURIComponent(id)}`, {})
          window.rmToast?.(`✓ Campaña ${action === 'pause' ? 'pausada' : 'activada'}`, 'success')
          loadCampaigns(true)
        } catch (err) {
          window.rmToast?.(`✗ ${err.message}`, 'error')
          btn.disabled = false
        }
      })
    })
  }

  // ─── Load ────────────────────────────────────────────────
  async function loadCampaigns (refresh) {
    if (refresh) { state.refreshing = true; render() }
    try {
      const q = refresh ? '?refresh=1' : ''
      const r = await window.rmApi.get('/api/google/campaigns/list' + q)
      state.campaigns = r.campaigns || []
      state.syncedAt = r.synced_at
      state.syncWarning = r.sync_warning || null
      state.source = r.source
    } catch (err) {
      state.syncWarning = err.message
    } finally {
      state.loading = false
      state.refreshing = false
      render()
    }
  }

  async function loadGoogleConn () {
    try {
      const r = await window.rmApi.get('/api/google/connection')
      state.googleConn = r
    } catch (_) {
      state.googleConn = null
    } finally {
      state.googleConnLoaded = true
    }
  }

  // ─── Styles ──────────────────────────────────────────────
  function injectStylesOnce () {
    if (document.getElementById('gpc-styles')) return
    const css = `
      .gpc-table-wrap { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; overflow: hidden; overflow-x: auto; margin-bottom: 24px; }
      .gpc-table { width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif; }
      .gpc-table thead th { padding: 11px 14px; font-family: var(--rm-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); border-bottom: 1px solid var(--rm-border, #e8e3dc); background: var(--rp-surface-raised, #f6f3ee); text-transform: uppercase; text-align: left; white-space: nowrap; }
      .gpc-table thead th:nth-last-child(-n+8) { text-align: right; }
      .gpc-table thead th:nth-child(1) { text-align: left; }
      .gpc-table thead th:nth-child(2), .gpc-table thead th:nth-child(3) { text-align: left; }
      .gpc-table tbody td { padding: 13px 14px; border-bottom: 1px solid var(--rm-border, #e8e3dc); font-size: 12.5px; color: var(--rm-ink, #0f1410); vertical-align: middle; white-space: nowrap; }
      .gpc-table tbody td:nth-child(n+5):nth-child(-n+10) { text-align: right; font-family: var(--rm-mono); }
      .gpc-table tbody tr:last-child td { border-bottom: none; }
      .gpc-table tbody tr:hover { background: var(--rp-surface-raised, #f6f3ee); cursor: pointer; }
      .gpc-name { font-weight: 600; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
      .gpc-url { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); margin-top: 2px; }
      .gpc-type { font-family: var(--rm-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; color: #4285F4; text-transform: uppercase; }
      .gpc-budget { font-family: var(--rm-mono); }
      .gpc-actions { display: flex; gap: 6px; justify-content: flex-end; }
      .gpc-actions .ae-btn-ghost { padding: 4px 10px; font-size: 11px; }
    `
    const s = document.createElement('style')
    s.id = 'gpc-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  async function mount () {
    state.loading = true
    state.googleConnLoaded = false
    render()
    await Promise.all([loadCampaigns(false), loadGoogleConn()])
    render()
    // Background refresh
    if (state.googleConn?.connected) loadCampaigns(true)
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if (window.rmRouter?.currentPage() === PAGE_ID) mount()
  })
})()
