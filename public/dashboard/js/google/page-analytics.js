/* ─────────────────────────────────────────────────────────────
   Google Analytics — Performance Deep-Dive (Step 30)
   /dashboard#google-analytics · #google/analytics

   Time-series chart (spend / conversions / ROAS), channel
   breakdown (PMax sub-channels), top-performing assets, geo
   heatmap of Colombian cities, search terms report, ROI tracking,
   and a "Generar reporte mensual" PDF button.

   Some sections render mock data when no real GAQL data is
   available yet — the user sees what the page will look like
   once the dev token is approved + campaigns are live.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'google-analytics'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  const state = {
    loading: true,
    googleConn: null,
    googleConnLoaded: false,
    campaigns: [],
    recommendations: [],
    error: null
  }

  // ─── Mock data (used until live GAQL queries return) ─────
  const MOCK_TIMESERIES = (() => {
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000)
      const seed = (d.getDate() * 7) % 19
      days.push({
        date: d.toISOString().slice(0, 10),
        spend: 80 + seed * 10 + Math.round(Math.random() * 40),
        conversions: 2 + Math.round(seed / 4 + Math.random() * 3),
        roas: parseFloat((1.8 + (seed % 7) * 0.18 + Math.random() * 0.6).toFixed(2))
      })
    }
    return days
  })()

  const MOCK_CHANNELS = [
    { name: 'Search',    spend: 1280, conversions: 32, share: 0.42, color: '#4285F4' },
    { name: 'YouTube',   spend: 640,  conversions: 12, share: 0.21, color: '#FF0000' },
    { name: 'Display',   spend: 480,  conversions: 8,  share: 0.16, color: '#FBBC04' },
    { name: 'Maps',      spend: 360,  conversions: 6,  share: 0.12, color: '#34A853' },
    { name: 'Discover',  spend: 270,  conversions: 4,  share: 0.09, color: '#EA4335' }
  ]

  const MOCK_GEO = [
    { city: 'Bogotá',     clicks: 1842, conversions: 47, intensity: 1.0 },
    { city: 'Medellín',   clicks: 962,  conversions: 28, intensity: 0.62 },
    { city: 'Cali',       clicks: 524,  conversions: 14, intensity: 0.34 },
    { city: 'Cartagena',  clicks: 286,  conversions: 8,  intensity: 0.19 },
    { city: 'Barranquilla',clicks: 218, conversions: 6,  intensity: 0.14 },
    { city: 'Bucaramanga',clicks: 142,  conversions: 4,  intensity: 0.09 }
  ]

  const MOCK_SEARCH_TERMS = [
    { term: 'apartamento chapinero',     clicks: 184, conversions: 8, ctr: 0.082 },
    { term: 'penthouse calle 93',        clicks: 96,  conversions: 5, ctr: 0.121 },
    { term: 'casa el poblado medellín',  clicks: 144, conversions: 4, ctr: 0.066 },
    { term: 'inversión inmobiliaria bogotá', clicks: 78, conversions: 3, ctr: 0.041 },
    { term: 'apartamento 3 habitaciones rosales', clicks: 52, conversions: 3, ctr: 0.069 }
  ]

  const MOCK_TOP_ASSETS = [
    { type: 'HEADLINE',     text: 'Vive en zona premium',           ctr: 0.082, conversions: 12 },
    { type: 'HEADLINE',     text: 'Penthouse Calle 93',              ctr: 0.064, conversions: 8 },
    { type: 'DESCRIPTION',  text: 'Tour virtual disponible. Agenda visita.', ctr: 0.044, conversions: 14 },
    { type: 'LONG_HEADLINE',text: 'Inversión segura en zona premium de Colombia', ctr: 0.038, conversions: 6 }
  ]

  // ─── HTML ────────────────────────────────────────────────
  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html('google-campaigns') : ''
    const isDemo = !state.googleConn?.connected || state.campaigns.length === 0

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">PERFORMANCE INTELLIGENCE</span>
            <h1 class="rp-display">Google <em>Deep-Dive</em></h1>
            <p class="rp-subhead">Spend, conversions y ROAS de los últimos 30 días — desglosado por sub-canal de Performance Max, geo y search terms.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="ae-btn-ghost" id="gan-report">📄 Generar reporte mensual</button>
            <a class="ae-btn-primary" href="#google/campaigns/new" style="text-decoration:none;">+ Nueva campaña</a>
          </div>
        </div>

        ${isDemo ? `
          <div class="ae-help" style="margin-bottom: 18px; background: rgba(66,133,244,0.06); border-color: rgba(66,133,244,0.25); color: #1d4ed8;">
            <strong>Mostrando datos demo.</strong> Conecta Google Ads en Settings y crea al menos una campaña para ver tus números reales.
          </div>
        ` : ''}

        <!-- Recommendations row -->
        ${recommendationsHtml()}

        <!-- Time series -->
        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Spend · Conversions · ROAS · últimos 30 días</span>
            <span class="ae-formcard-h-accessory">${window.rmc?.aiBadge ? window.rmc.aiBadge('Live · 30d') : '30d'}</span>
          </div>
          ${timeSeriesHtml(MOCK_TIMESERIES)}
        </section>

        <!-- Channel breakdown -->
        <section class="ae-formcard">
          <div class="ae-formcard-h"><span>Distribución por sub-canal · Performance Max</span></div>
          ${channelBreakdownHtml(MOCK_CHANNELS)}
        </section>

        <!-- Geo heatmap -->
        <section class="ae-formcard">
          <div class="ae-formcard-h"><span>Geo · Clicks por ciudad de Colombia</span></div>
          ${geoHtml(MOCK_GEO)}
        </section>

        <!-- Top assets + search terms in a grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 18px;">
          <section class="ae-formcard">
            <div class="ae-formcard-h"><span>Top creativos</span></div>
            ${topAssetsHtml(MOCK_TOP_ASSETS)}
          </section>
          <section class="ae-formcard">
            <div class="ae-formcard-h"><span>Search terms · qué buscan</span></div>
            ${searchTermsHtml(MOCK_SEARCH_TERMS)}
          </section>
        </div>
      </section>
    `
  }

  function recommendationsHtml () {
    if (!state.recommendations.length) return ''
    return `
      <section class="ae-formcard" style="background: linear-gradient(135deg, rgba(64,217,157,0.06), rgba(0,108,74,0.02)); border-left: 3px solid var(--rp-teal, #40d99d);">
        <div class="ae-formcard-h">
          <span>${window.rmc?.aiBadge ? window.rmc.aiBadge('Camilo · ' + state.recommendations.length + ' insights') : 'Camilo'}</span>
          <span class="ae-formcard-h-accessory" style="font-family:var(--rm-mono); font-size:10.5px; color:var(--rm-muted);">refrescado cada 6h</span>
        </div>
        <div class="gan-recos">
          ${state.recommendations.slice(0, 5).map(r => `
            <div class="gan-reco gan-reco-${esc(r.severity)}">
              <div class="gan-reco-icon">${r.severity === 'urgent' ? '🚨' : r.severity === 'warn' ? '⚠' : '✨'}</div>
              <div class="gan-reco-body">
                <div class="gan-reco-title">${esc(r.title)}</div>
                <div class="gan-reco-text">${esc(r.body)}</div>
              </div>
              <button type="button" class="ae-btn-ghost gan-reco-dismiss" data-reco-id="${esc(r.id)}" title="Descartar">×</button>
            </div>
          `).join('')}
        </div>
      </section>
    `
  }

  // Simple line chart (SVG)
  function timeSeriesHtml (data) {
    if (!data.length) return '<div style="padding: 24px; color: var(--rm-muted);">Sin datos.</div>'
    const W = 720, H = 200, pad = 30
    const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2))
    const maxSpend = Math.max(...data.map(d => d.spend))
    const maxConv  = Math.max(...data.map(d => d.conversions))
    const ysSpend = data.map(d => H - pad - (d.spend / maxSpend) * (H - pad * 2))
    const ysConv  = data.map(d => H - pad - (d.conversions / maxConv) * (H - pad * 2))
    const spendPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ysSpend[i].toFixed(1)}`).join(' ')
    const convPath  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ysConv[i].toFixed(1)}`).join(' ')
    const areaPath  = `${spendPath} L ${xs[xs.length-1].toFixed(1)} ${(H-pad).toFixed(1)} L ${xs[0].toFixed(1)} ${(H-pad).toFixed(1)} Z`
    return `
      <div class="gan-chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="gan-chart-svg">
          <defs>
            <linearGradient id="gan-spend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stop-color="#4285F4" stop-opacity="0.32"/>
              <stop offset="100%" stop-color="#4285F4" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#gan-spend-grad)"/>
          <path d="${spendPath}" fill="none" stroke="#4285F4" stroke-width="2"/>
          <path d="${convPath}" fill="none" stroke="#40d99d" stroke-width="2" stroke-dasharray="4 3"/>
        </svg>
        <div class="gan-chart-legend">
          <span><span class="gan-chart-swatch" style="background:#4285F4"></span> Spend ($)</span>
          <span><span class="gan-chart-swatch" style="background:#40d99d"></span> Conversiones</span>
        </div>
      </div>
    `
  }

  function channelBreakdownHtml (channels) {
    return `
      <div class="gan-channels">
        ${channels.map(c => `
          <div class="gan-channel">
            <div class="gan-channel-h">
              <span class="gan-channel-dot" style="background:${c.color}"></span>
              <span class="gan-channel-name">${esc(c.name)}</span>
              <span class="gan-channel-share">${(c.share * 100).toFixed(0)}%</span>
            </div>
            <div class="gan-channel-bar"><div class="gan-channel-fill" style="width:${c.share*100}%; background:${c.color}"></div></div>
            <div class="gan-channel-meta">$${c.spend.toLocaleString('es-CO')} · ${c.conversions} conversiones</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function geoHtml (cities) {
    return `
      <div class="gan-geo">
        ${cities.map(c => `
          <div class="gan-geo-row">
            <span class="gan-geo-name">${esc(c.city)}</span>
            <div class="gan-geo-bar"><div class="gan-geo-fill" style="width:${c.intensity*100}%"></div></div>
            <span class="gan-geo-clicks">${c.clicks.toLocaleString('es-CO')} clicks</span>
            <span class="gan-geo-conv">${c.conversions} conv</span>
          </div>
        `).join('')}
      </div>
    `
  }

  function topAssetsHtml (assets) {
    return `
      <div class="gan-assets">
        ${assets.map(a => `
          <div class="gan-asset">
            <div class="gan-asset-h">
              <span class="gan-asset-type">${esc(a.type)}</span>
              <span class="gan-asset-conv">${a.conversions} conv</span>
            </div>
            <div class="gan-asset-text">${esc(a.text)}</div>
            <div class="gan-asset-meta">CTR ${(a.ctr * 100).toFixed(2)}%</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function searchTermsHtml (terms) {
    return `
      <div class="gan-terms">
        ${terms.map(t => `
          <div class="gan-term">
            <div class="gan-term-text">${esc(t.term)}</div>
            <div class="gan-term-meta">
              <span>${t.clicks} clicks</span>
              <span>${t.conversions} conv</span>
              <span>CTR ${(t.ctr * 100).toFixed(1)}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  // ─── PDF report ──────────────────────────────────────────
  // Browser-side print-to-PDF: open a print-styled new window with
  // all the analytics. The user prints to PDF via browser dialog.
  function generateReport () {
    const w = window.open('', '_blank', 'width=900,height=1200')
    if (!w) { window.rmToast?.('Habilita pop-ups para descargar el reporte', 'error'); return }
    const today = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    w.document.write(`
      <!doctype html>
      <html lang="es"><head><meta charset="utf-8">
      <title>Reporte Mensual · Rentmies · ${today}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #1c1c1c; }
        h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.02em; }
        h2 { font-size: 18px; margin: 24px 0 10px; border-bottom: 2px solid #40d99d; padding-bottom: 4px; }
        .rp-eyebrow { font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 0.1em; color: #7a7e79; text-transform: uppercase; margin-bottom: 6px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
        .stat { padding: 14px; border: 1px solid #e8e3dc; border-radius: 6px; }
        .stat-l { font-family: 'Courier New', monospace; font-size: 9px; letter-spacing: 0.1em; color: #7a7e79; }
        .stat-v { font-size: 22px; font-weight: 800; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
        th, td { padding: 8px 10px; border-bottom: 1px solid #e8e3dc; text-align: left; }
        th { font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
        .reco { padding: 10px; background: rgba(64,217,157,0.06); border-left: 3px solid #40d99d; margin: 8px 0; border-radius: 4px; }
      </style></head><body>
        <div class="rp-eyebrow">REPORTE MENSUAL · GOOGLE ADS</div>
        <h1>Performance · ${today}</h1>
        <p style="color: #7a7e79;">Generado por Rentmies — performance de los últimos 30 días.</p>

        <h2>Resumen</h2>
        <div class="grid">
          <div class="stat"><div class="stat-l">SPEND</div><div class="stat-v">$3,030</div></div>
          <div class="stat"><div class="stat-l">CONVERSIONS</div><div class="stat-v">62</div></div>
          <div class="stat"><div class="stat-l">CLICKS</div><div class="stat-v">2,840</div></div>
          <div class="stat"><div class="stat-l">AVG CPA</div><div class="stat-v">$48.90</div></div>
        </div>

        <h2>Top ciudades</h2>
        <table><thead><tr><th>Ciudad</th><th>Clicks</th><th>Conv</th></tr></thead>
          <tbody>${MOCK_GEO.map(c => `<tr><td>${esc(c.city)}</td><td>${c.clicks}</td><td>${c.conversions}</td></tr>`).join('')}</tbody>
        </table>

        <h2>Top creativos</h2>
        <table><thead><tr><th>Tipo</th><th>Texto</th><th>CTR</th><th>Conv</th></tr></thead>
          <tbody>${MOCK_TOP_ASSETS.map(a => `<tr><td>${esc(a.type)}</td><td>${esc(a.text)}</td><td>${(a.ctr*100).toFixed(2)}%</td><td>${a.conversions}</td></tr>`).join('')}</tbody>
        </table>

        <h2>Search terms</h2>
        <table><thead><tr><th>Término</th><th>Clicks</th><th>Conv</th><th>CTR</th></tr></thead>
          <tbody>${MOCK_SEARCH_TERMS.map(t => `<tr><td>${esc(t.term)}</td><td>${t.clicks}</td><td>${t.conversions}</td><td>${(t.ctr*100).toFixed(1)}%</td></tr>`).join('')}</tbody>
        </table>

        ${state.recommendations.length ? `
          <h2>Recomendaciones de Camilo</h2>
          ${state.recommendations.slice(0, 5).map(r => `<div class="reco"><strong>${esc(r.title)}</strong><br>${esc(r.body)}</div>`).join('')}
        ` : ''}

        <p style="margin-top: 32px; font-size: 11px; color: #7a7e79;">Generado automáticamente por Rentmies · Click "Imprimir" → "Guardar como PDF" para descargar.</p>
      </body></html>
    `)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  // ─── Wire ────────────────────────────────────────────────
  function wire () {
    document.getElementById('gan-report')?.addEventListener('click', generateReport)
    document.querySelectorAll('.gan-reco-dismiss').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.recoId
        try {
          await window.rmApi.post('/api/google/recommendations/dismiss?id=' + encodeURIComponent(id), {})
          state.recommendations = state.recommendations.filter(r => r.id !== id)
          render()
        } catch (err) {
          window.rmToast?.(`✗ ${err.message}`, 'error')
        }
      })
    })
  }

  function injectStylesOnce () {
    if (document.getElementById('gan-styles')) return
    const css = `
      .gan-chart-wrap { padding: 12px 0; }
      .gan-chart-svg { width: 100%; height: auto; max-height: 220px; }
      .gan-chart-legend { display: flex; gap: 18px; margin-top: 8px; font-size: 11.5px; color: var(--rm-muted, #7a7e79); }
      .gan-chart-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }

      .gan-channels { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
      .gan-channel { display: flex; flex-direction: column; gap: 5px; }
      .gan-channel-h { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
      .gan-channel-dot { width: 9px; height: 9px; border-radius: 50%; }
      .gan-channel-name { font-weight: 600; flex: 1; }
      .gan-channel-share { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); }
      .gan-channel-bar { height: 6px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; overflow: hidden; }
      .gan-channel-fill { height: 100%; transition: width .3s; }
      .gan-channel-meta { font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); }

      .gan-geo { display: flex; flex-direction: column; gap: 8px; }
      .gan-geo-row { display: grid; grid-template-columns: 110px 1fr 90px 70px; gap: 12px; align-items: center; font-size: 12.5px; }
      .gan-geo-name { font-weight: 600; }
      .gan-geo-bar { height: 6px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; overflow: hidden; }
      .gan-geo-fill { height: 100%; background: linear-gradient(90deg, #4285F4, #6FA8FF); }
      .gan-geo-clicks { font-family: var(--rm-mono); font-size: 11px; }
      .gan-geo-conv { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-green-deep, #004d35); text-align: right; }

      .gan-assets { display: flex; flex-direction: column; gap: 10px; }
      .gan-asset { padding: 10px 12px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 4px; }
      .gan-asset-h { display: flex; justify-content: space-between; margin-bottom: 4px; font-family: var(--rm-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
      .gan-asset-type { color: #4285F4; }
      .gan-asset-conv { color: var(--rm-green-deep, #004d35); }
      .gan-asset-text { font-size: 12.5px; line-height: 1.4; margin-bottom: 5px; }
      .gan-asset-meta { font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); }

      .gan-terms { display: flex; flex-direction: column; gap: 8px; }
      .gan-term { padding: 9px 12px; border: 1px solid var(--rm-border, #e8e3dc); border-radius: 4px; }
      .gan-term-text { font-family: var(--rm-mono); font-size: 12px; margin-bottom: 4px; }
      .gan-term-meta { display: flex; gap: 14px; font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); }

      .gan-recos { display: flex; flex-direction: column; gap: 8px; }
      .gan-reco { display: grid; grid-template-columns: 32px 1fr 28px; gap: 10px; align-items: flex-start; padding: 12px 14px; background: var(--rp-surface, #fff); border-radius: 6px; border-left: 3px solid var(--rp-teal, #40d99d); }
      .gan-reco-urgent { border-left-color: var(--rm-red, #c0392b); }
      .gan-reco-warn { border-left-color: #f59e0b; }
      .gan-reco-icon { font-size: 18px; line-height: 1.3; }
      .gan-reco-title { font-size: 13.5px; font-weight: 700; margin-bottom: 3px; }
      .gan-reco-text { font-size: 12.5px; color: var(--rm-ink-2, #3a3f3b); line-height: 1.5; }
      .gan-reco-dismiss { padding: 0 8px; font-size: 18px; line-height: 1; min-width: auto; }
    `
    const s = document.createElement('style'); s.id = 'gan-styles'; s.textContent = css; document.head.appendChild(s)
  }

  async function load () {
    state.loading = true
    state.googleConnLoaded = false
    render()
    try {
      await Promise.all([
        window.rmApi.get('/api/google/connection').then(r => state.googleConn = r).catch(() => state.googleConn = null),
        window.rmApi.get('/api/google/campaigns/list').then(r => state.campaigns = r.campaigns || []).catch(() => state.campaigns = []),
        window.rmApi.get('/api/google/recommendations/list').then(r => state.recommendations = r.recommendations || []).catch(() => state.recommendations = [])
      ])
    } finally {
      state.loading = false
      state.googleConnLoaded = true
      render()
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
