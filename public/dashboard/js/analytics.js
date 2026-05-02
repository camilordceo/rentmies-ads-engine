/* ─────────────────────────────────────────────────────────────
   Analytics — Rentmies Prime aesthetic
   - KPI row with highlight (teal) variant
   - Soft teal Chart.js bars + ROI dark card
   - Engagement heatmap grid
   - Performance table per listing with status pills
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

  // ── KPI data ──────────────────────────────────────────────

  const KPIS = {
    '7d':  [
      { label: 'TOTAL SPEND',     value: '$42,850.00', delta: '+8.2% vs Last Month', up: true },
      { label: 'IMPRESSIONS',     value: '184k',       delta: '+12% vs Last Month',  up: true },
      { label: 'CTR',             value: '4.4%',       delta: '+0.6 pts',            up: true },
      { label: 'AI PREDICTED CPL', value: '$18',       delta: '-$3 vs benchmark',    up: true, highlight: true }
    ],
    '30d': [
      { label: 'TOTAL SPEND',     value: '$184,200',   delta: '+14% vs Last Month',  up: true },
      { label: 'IMPRESSIONS',     value: '742k',       delta: '+8% vs Last Month',   up: true },
      { label: 'CTR',             value: '4.3%',       delta: '+0.4 pts',            up: true },
      { label: 'AI PREDICTED CPL', value: '$21',       delta: '-$4 vs benchmark',    up: true, highlight: true }
    ],
    '90d': [
      { label: 'TOTAL SPEND',     value: '$512,400',   delta: '+24% vs Last Month',  up: true },
      { label: 'IMPRESSIONS',     value: '2.1M',       delta: '+22% vs Last Month',  up: true },
      { label: 'CTR',             value: '4.5%',       delta: '+0.8 pts',            up: true },
      { label: 'AI PREDICTED CPL', value: '$19',       delta: '-$6 vs benchmark',    up: true, highlight: true }
    ]
  }

  // ── Chart data ────────────────────────────────────────────

  function dailyDataFor(period) {
    const days = period === '7d' ? 7 : period === '30d' ? 14 : 30
    const labels = []
    const values = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      const base = 18000 + Math.sin(i * 0.7) * 6000 + (Math.random() * 4000)
      values.push(Math.round(base))
    }
    return { labels, values }
  }

  const CHANNEL_DATA = [
    { name: 'Instagram Feed',       value: 4.8 },
    { name: 'Instagram Stories',    value: 3.9 },
    { name: 'Facebook Marketplace', value: 4.1 },
    { name: 'TikTok Creative',      value: 3.2 }
  ]

  // ── Heatmap ───────────────────────────────────────────────

  const HEATMAP = [
    { value: '92%', label: 'EL POBLADO', heat: 'hot' },
    { value: '87%', label: 'ROSALES',    heat: 'hot' },
    { value: '78%', label: 'CHAPINERO',  heat: 'warm' },
    { value: '64%', label: 'SANTA BÁRBARA', heat: 'warm' },
    { value: '56%', label: 'CALI NORTE', heat: 'warm' },
    { value: '48%', label: 'BARRANQUILLA', heat: 'cold' },
    { value: '42%', label: 'CARTAGENA',  heat: 'cold' },
    { value: '34%', label: 'PEREIRA',    heat: 'cold' }
  ]

  // ── Performance per listing ───────────────────────────────

  const LISTINGS = [
    {
      thumb: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=400&fit=crop',
      name:  'Penthouse Calle 93',
      sub:   'Bogotá · 3BR · $1.2B',
      leads: 47,
      qualityFill: 92, grade: 'A+',
      spend: '$4,200',
      conv:  '12 Sales',
      status: 'scaling'
    },
    {
      thumb: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=400&fit=crop',
      name:  'Castelo Medellín',
      sub:   'El Poblado · 2BR · $850M',
      leads: 38,
      qualityFill: 84, grade: 'A',
      spend: '$3,640',
      conv:  '9 Sales',
      status: 'peak'
    },
    {
      thumb: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=400&fit=crop',
      name:  'Rosales 2BR',
      sub:   'Bogotá · 2BR · $720M',
      leads: 29,
      qualityFill: 76, grade: 'B+',
      spend: '$2,890',
      conv:  '7 Sales',
      status: 'steady'
    },
    {
      thumb: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=400&fit=crop',
      name:  'Strada Bogotá',
      sub:   'Chapinero · Studio · $480M',
      leads: 18,
      qualityFill: 62, grade: 'B',
      spend: '$1,820',
      conv:  '4 Sales',
      status: 'steady'
    },
    {
      thumb: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop',
      name:  'Praseo Cali',
      sub:   'Cali Norte · 3BR · $620M',
      leads: 12,
      qualityFill: 48, grade: 'C+',
      spend: '$1,140',
      conv:  '2 Sales',
      status: 'paused'
    }
  ]

  function statusPill(status) {
    const map = {
      scaling: { class: 'rp-status-scaling', label: 'SCALING' },
      peak:    { class: 'rp-status-peak',    label: 'PEAK' },
      steady:  { class: 'rp-status-steady',  label: 'STEADY' },
      paused:  { class: 'rp-status-paused',  label: 'PAUSED' }
    }
    const s = map[status] || map.steady
    return `<span class="rp-status ${s.class}">${s.label}</span>`
  }

  // ── Render ────────────────────────────────────────────────

  function render() {
    const slot = document.querySelector('section[data-page="analytics"]')
    if (!slot) return

    const kpis = KPIS[activePeriod]
    const daily = dailyDataFor(activePeriod)

    slot.innerHTML = `
      <div class="rp-page rp-rise ae-analytics">
        <div class="rp-page-header">
          <span class="rp-eyebrow">PERFORMANCE ANALYTICS</span>
          <h1 class="rp-display">Tus campañas en <em>números</em></h1>
          <p class="rp-subhead">Lo que rinde, lo que no, y por qué. Camilo usa estas métricas para optimizar en automático las próximas <strong>24 horas</strong>.</p>
        </div>

        <div class="rp-filter-row">
          <span class="rp-eyebrow muted" style="margin-bottom:0;">Periodo</span>
          <div class="rp-filter-pills">
            ${PERIODS.map(p => `<button class="rp-filter-pill ${activePeriod === p.id ? 'selected' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
          </div>
          <span class="rp-ai-badge" style="margin-left:auto;">AI Agent Active</span>
        </div>

        <!-- KPI row with highlight variant on AI Predicted CPL -->
        <div class="rp-stats">
          ${kpis.map(k => `
            <div class="rp-stat ${k.highlight ? 'highlight' : ''}">
              <div class="rp-stat-label">${k.label}</div>
              <div class="rp-stat-value">${k.value}</div>
              <div class="rp-stat-delta ${k.up ? 'up' : 'down'}">${k.up ? '↗' : '↘'} ${k.delta}</div>
            </div>
          `).join('')}
        </div>

        <!-- Charts: daily performance + ROI dark card -->
        <div class="rp-analytics-grid">
          <div class="rp-chart-card">
            <div class="rp-chart-card-header">
              <div>
                <div class="rp-chart-card-title">Daily Performance</div>
                <div class="rp-chart-card-sub">Impressions over time</div>
              </div>
            </div>
            <div class="rp-chart-canvas-wrap"><canvas id="rp-chart-daily"></canvas></div>
          </div>

          <div class="rp-roi-card">
            <div class="rp-eyebrow">DIRECT ROI</div>
            <div class="rp-roi-row">
              <div class="rp-roi-label">Revenue</div>
              <div class="rp-roi-amount">$485,200</div>
            </div>
            <div class="rp-roi-bar"><div class="rp-roi-bar-fill" style="width:90%"></div></div>
            <div class="rp-roi-row" style="margin-top:18px;">
              <div class="rp-roi-label">Ad Spend</div>
              <div class="rp-roi-amount">$42,850</div>
            </div>
            <div class="rp-roi-bar"><div class="rp-roi-bar-fill mint" style="width:18%"></div></div>
            <div class="rp-roi-big">11.4×</div>
            <div class="rp-roi-big-label">EFFICIENCY MULTIPLIER</div>
          </div>
        </div>

        <!-- Channel performance bar chart -->
        <div class="rp-block">
          <div class="rp-chart-card">
            <div class="rp-chart-card-header">
              <div>
                <div class="rp-chart-card-title">Performance by Channel</div>
                <div class="rp-chart-card-sub">CTR % · ${activePeriod}</div>
              </div>
            </div>
            <div class="rp-chart-canvas-wrap"><canvas id="rp-chart-channels"></canvas></div>
          </div>
        </div>

        <!-- Engagement heatmap -->
        <h2 class="rp-section-title">Interest Heatmap</h2>
        <div class="rp-heat-grid">
          ${HEATMAP.map(h => `
            <div class="rp-heat-tile ${h.heat}">
              <div class="rp-heat-value">${h.value}</div>
              <div class="rp-heat-label">${h.label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Performance per listing table -->
        <h2 class="rp-section-title">
          Campaign Performance per Listing
          <button class="rp-btn-primary sm" id="rp-export-btn">EXPORT REPORT</button>
        </h2>
        <div class="rp-table">
          <div class="rp-table-cols">
            <div>PROPERTY</div>
            <div>LEADS</div>
            <div>QUALITY</div>
            <div>SPEND</div>
            <div>CONVERSIONS</div>
            <div>STATUS</div>
          </div>
          ${LISTINGS.map(l => `
            <div class="rp-table-row">
              <div class="rp-table-property">
                <div class="rp-table-thumb" style="background-image: url('${l.thumb}')"></div>
                <div style="min-width:0;">
                  <div class="rp-table-prop-name">${l.name}</div>
                  <div class="rp-table-prop-sub">${l.sub}</div>
                </div>
              </div>
              <div class="rp-table-leads">${l.leads}</div>
              <div class="rp-table-quality">
                <div class="rp-table-quality-bar"><div class="rp-table-quality-fill" style="width:${l.qualityFill}%"></div></div>
                <div class="rp-table-quality-grade">${l.grade}</div>
              </div>
              <div class="rp-table-spend">${l.spend}</div>
              <div class="rp-table-conv">${l.conv}</div>
              <div>${statusPill(l.status)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `

    slot.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => { activePeriod = btn.dataset.period; render() })
    })

    slot.querySelector('#rp-export-btn')?.addEventListener('click', () => {
      window.rmToast?.('📊 Reporte exportado a CSV', 'success')
    })

    loadChartJs().then(() => drawCharts(daily)).catch(err => console.warn('[analytics] Chart.js failed:', err))
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
    C.defaults.font.size = 11
    C.defaults.font.weight = 600
    C.defaults.color = '#888888'
    C.defaults.scale.grid.color = 'rgba(0,0,0,0.04)'
    C.defaults.scale.grid.drawBorder = false
    C.defaults.scale.ticks.padding = 8
    C.defaults.plugins.legend.display = false
    C.defaults.plugins.tooltip.backgroundColor = '#1c1b1b'
    C.defaults.plugins.tooltip.cornerRadius = 8
    C.defaults.plugins.tooltip.padding = 12
    C.defaults.plugins.tooltip.titleFont = { family: "'Inter', sans-serif", size: 11, weight: 700 }
    C.defaults.plugins.tooltip.bodyFont  = { family: "'Inter', sans-serif", size: 12, weight: 500 }
    C.defaults.animation.duration = 600
    C.defaults.animation.easing = 'easeOutQuart'
  }

  function drawCharts(daily) {
    if (!window.Chart) return

    Object.values(charts).forEach(c => c.destroy && c.destroy())
    charts = {}

    const dailyEl = document.getElementById('rp-chart-daily')
    if (dailyEl) {
      // Highlight the max bar in teal, the rest in light gray
      const max = Math.max(...daily.values)
      const colors = daily.values.map(v => v >= max * 0.85 ? '#40d99d' : '#e8e8e8')

      charts.daily = new window.Chart(dailyEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels: daily.labels,
          datasets: [{
            label: 'Impressions',
            data: daily.values,
            backgroundColor: colors,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.85
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false } },
            y: {
              ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }
            }
          },
          plugins: { legend: { display: false } }
        }
      })
    }

    const chEl = document.getElementById('rp-chart-channels')
    if (chEl) {
      const max = Math.max(...CHANNEL_DATA.map(c => c.value))
      const colors = CHANNEL_DATA.map(c => c.value >= max * 0.85 ? '#40d99d' : '#e8e8e8')
      charts.channels = new window.Chart(chEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels: CHANNEL_DATA.map(c => c.name),
          datasets: [{
            label: 'CTR %',
            data: CHANNEL_DATA.map(c => c.value),
            backgroundColor: colors,
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 4, bottomRight: 4 },
            borderSkipped: false,
            barPercentage: 0.65,
            categoryPercentage: 0.85
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { callback: v => v + '%' } },
            y: { grid: { display: false } }
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
    if ((window.rmRouter?.currentPage() || 'dashboard') === 'analytics') render()
  })
})()
