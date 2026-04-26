/* ─────────────────────────────────────────────────────────────
   Analytics page — Chart.js, lazy-loaded only when this page
   becomes active. Mock data for FASE 3; step 29 swaps to real
   Supabase aggregates.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PERIODS = [
    { id: '7d',  label: '7 días' },
    { id: '30d', label: '30 días' },
    { id: '90d', label: '90 días' }
  ]

  let activePeriod = '7d'
  let charts = {}
  let chartJsLoaded = false

  // ── Mock data ─────────────────────────────────────────────

  const KPIS = {
    '7d':  [{ k: 'IMPRESIONES',     v: '184k', d: '▲ 12%',  up: true },
            { k: 'CLICS',           v: '8.2k', d: '▲ 8%',   up: true },
            { k: 'CTR',             v: '4.4%', d: '▲ 0.6pp', up: true },
            { k: 'CONVERSIONES',    v: '312',  d: '▲ 24%',  up: true },
            { k: 'COSTO POR LEAD',  v: '€18',  d: '▼ €3',   up: true }],
    '30d': [{ k: 'IMPRESIONES',     v: '742k', d: '▲ 8%',   up: true },
            { k: 'CLICS',           v: '32k',  d: '▲ 5%',   up: true },
            { k: 'CTR',             v: '4.3%', d: '▲ 0.4pp', up: true },
            { k: 'CONVERSIONES',    v: '1.2k', d: '▲ 18%',  up: true },
            { k: 'COSTO POR LEAD',  v: '€21',  d: '▼ €4',   up: true }],
    '90d': [{ k: 'IMPRESIONES',     v: '2.1M', d: '▲ 22%',  up: true },
            { k: 'CLICS',           v: '94k',  d: '▲ 19%',  up: true },
            { k: 'CTR',             v: '4.5%', d: '▲ 0.8pp', up: true },
            { k: 'CONVERSIONES',    v: '3.6k', d: '▲ 31%',  up: true },
            { k: 'COSTO POR LEAD',  v: '€19',  d: '▼ €6',   up: true }]
  }

  function dailyDataFor(period) {
    const days = period === '7d' ? 7 : period === '30d' ? 14 : 30  // bucket 90d to 30 points
    const labels = []
    const impr = [], clicks = [], conv = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      labels.push(d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }))
      const base = 18000 + Math.sin(i * 0.7) * 6000 + (Math.random() * 4000)
      impr.push(Math.round(base))
      clicks.push(Math.round(base * 0.044 + Math.random() * 80))
      conv.push(Math.round(base * 0.0017 + Math.random() * 4))
    }
    return { labels, impr, clicks, conv }
  }

  const CHANNEL_DATA = [
    { name: 'Instagram Feed',     ctr: 4.8, conv: 142, color: '#E1306C' },
    { name: 'Instagram Stories',  ctr: 3.9, conv: 88,  color: '#FD1D1D' },
    { name: 'Facebook Marketplace', ctr: 4.1, conv: 64, color: '#1877F2' },
    { name: 'TikTok Creative',    ctr: 3.2, conv: 18,  color: '#69C9D0' }
  ]

  const DECISION_IMPACT = [
    { decision: 'Switched ángulo <em>Pain Point → Estatus</em> in Marbella', channel: 'Meta Feed',  liftCtr: '+2.6pp', liftDir: 'up',   period: '7d' },
    { decision: 'Scaled budget +50% on top performer <em>ad_8423</em>',       channel: 'Meta Feed',  liftCtr: '+0.8pp', liftDir: 'up',   period: '7d' },
    { decision: 'Reasignación TikTok → Meta Feed',                            channel: 'Cross',      liftCtr: 'CPL -42%', liftDir: 'up',   period: '14d' },
    { decision: 'Pausado horario inactivo (2-5am)',                           channel: 'All',        liftCtr: '€4.2/día', liftDir: 'up',   period: '30d' },
    { decision: 'Carrusel multi-foto en <em>Castelo</em>',                    channel: 'IG Feed',    liftCtr: '+1.4pp', liftDir: 'up',   period: '7d' },
    { decision: 'Headlines con escasez ("Última disponibilidad")',            channel: 'Meta Feed',  liftCtr: '+0.4pp', liftDir: 'up',   period: '14d' }
  ]

  // ── Render ────────────────────────────────────────────────

  function render() {
    const slot = document.querySelector('[data-page="analytics"]')
    if (!slot) return
    const kpis = KPIS[activePeriod]
    slot.innerHTML = `
      <div class="ae-analytics ae-rise">
        <header>
          <span class="ae-eyebrow">ANÁLISIS DE PERFORMANCE</span>
          <h1 class="ae-display">Tus campañas en <em>números</em></h1>
          <p class="ae-subhead">Lo que rinde, lo que no, y por qué. Camilord usa estas métricas para optimizar en automático las próximas 24 horas.</p>
        </header>

        <div class="ae-filter-row">
          <span class="ae-eyebrow muted" style="margin:0;">Periodo</span>
          <div class="ae-filter-pills">
            ${PERIODS.map(p => `<button class="ae-filter-pill ${activePeriod === p.id ? 'selected' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
          </div>
          <span class="rm-mono" style="font-size:10px; color:var(--rm-muted); margin-left:auto; letter-spacing:0.1em;">DATOS DE EJEMPLO</span>
        </div>

        <section class="ae-analytics-kpi">
          ${kpis.map(k => `
            <div class="ae-kpi">
              <span class="ae-kpi-label">${k.k}</span>
              <span class="ae-kpi-value">${k.v}</span>
              <span class="ae-stat-delta ${k.up ? 'up' : 'down'}">${k.d}</span>
            </div>
          `).join('')}
        </section>

        <section class="ae-charts-row">
          <div class="ae-chart-card">
            <div class="ae-chart-card-h">
              <span class="ae-chart-card-title">Performance Diaria</span>
              <span class="ae-chart-card-sub">Impr · Clics · Conv</span>
            </div>
            <div class="ae-chart-canvas-wrap"><canvas id="ae-chart-daily"></canvas></div>
          </div>
          <div class="ae-chart-card">
            <div class="ae-chart-card-h">
              <span class="ae-chart-card-title">Por Canal</span>
              <span class="ae-chart-card-sub">CTR % · 7d</span>
            </div>
            <div class="ae-chart-canvas-wrap"><canvas id="ae-chart-channels"></canvas></div>
          </div>
        </section>

        <section>
          <div style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
            <span class="ae-eyebrow muted">Decisiones IA con mayor impacto</span>
            <span class="rm-mono" style="font-size:10px; color:var(--rm-muted); letter-spacing:0.1em;">${DECISION_IMPACT.length} REGISTROS</span>
          </div>
          <div class="ae-impact">
            <div class="ae-impact-row head">
              <span>DECISIÓN</span><span>CANAL</span><span>LIFT CTR</span><span>VENTANA</span>
            </div>
            ${DECISION_IMPACT.map(d => `
              <div class="ae-impact-row">
                <span class="ae-impact-decision">${d.decision}</span>
                <span class="rm-mono" style="font-size:11px; color:var(--rm-ink-2);">${d.channel}</span>
                <span class="ae-impact-lift ${d.liftDir}">${d.liftCtr}</span>
                <span class="rm-mono" style="font-size:11px; color:var(--rm-muted);">${d.period}</span>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    `

    slot.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => { activePeriod = btn.dataset.period; render() })
    })

    // Lazy-load Chart.js, then render charts
    loadChartJs().then(() => {
      drawCharts()
    }).catch(err => console.warn('[analytics] Chart.js failed:', err))
  }

  function loadChartJs() {
    if (chartJsLoaded || window.Chart) {
      chartJsLoaded = true
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
      s.async = true
      s.onload = () => { chartJsLoaded = true; applyChartDefaults(); resolve() }
      s.onerror = () => reject(new Error('Failed to load Chart.js'))
      document.head.appendChild(s)
    })
  }

  function applyChartDefaults() {
    if (!window.Chart) return
    const C = window.Chart
    C.defaults.font.family = "'Inter', system-ui, sans-serif"
    C.defaults.color = '#7a7e79'
    C.defaults.scale.grid.color = 'rgba(232,227,220,0.6)'
    C.defaults.scale.grid.drawBorder = false
    C.defaults.plugins.tooltip.backgroundColor = '#0f1410'
    C.defaults.plugins.tooltip.cornerRadius = 4
    C.defaults.plugins.tooltip.padding = 10
    C.defaults.plugins.tooltip.titleFont = { family: "'JetBrains Mono', monospace", size: 10, weight: 600 }
    C.defaults.plugins.tooltip.bodyFont = { family: "'Inter', sans-serif", size: 12 }
    C.defaults.plugins.legend.labels.font = { family: "'JetBrains Mono', monospace", size: 10 }
  }

  function drawCharts() {
    if (!window.Chart) return
    const data = dailyDataFor(activePeriod)

    // Destroy previous instances if any
    Object.values(charts).forEach(c => c.destroy && c.destroy())
    charts = {}

    const dailyEl = document.getElementById('ae-chart-daily')
    if (dailyEl) {
      charts.daily = new window.Chart(dailyEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [
            { label: 'Impresiones', data: data.impr, backgroundColor: '#c8e7d4', stack: 'a', borderRadius: 3 },
            { label: 'Clics',       data: data.clicks.map(c => c * 25), backgroundColor: '#2d9968', stack: 'a', borderRadius: 3 },
            { label: 'Conv',        data: data.conv.map(c => c * 600),  backgroundColor: '#004d35', stack: 'a', borderRadius: 3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { stacked: true, ticks: { font: { size: 10 } } },
            y: { stacked: true, ticks: { font: { size: 10 }, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } }
          },
          plugins: { legend: { position: 'bottom' } }
        }
      })
    }

    const chEl = document.getElementById('ae-chart-channels')
    if (chEl) {
      charts.channels = new window.Chart(chEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels: CHANNEL_DATA.map(c => c.name),
          datasets: [{ label: 'CTR %', data: CHANNEL_DATA.map(c => c.ctr), backgroundColor: '#004d35', borderRadius: 3 }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { ticks: { font: { size: 10 }, callback: v => v + '%' } },
            y: { ticks: { font: { size: 11 } }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      })
    }
  }

  function teardown() {
    Object.values(charts).forEach(c => c.destroy && c.destroy())
    charts = {}
  }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'analytics') render()
    else teardown()
  })

  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'analytics') render()
  })
})()
