/* ─────────────────────────────────────────────────────────────
   Dashboard — Command Center (Rentmies Prime)
   Hero: editorial title + subhead with bold delta
   KPIs: 4-card row with one highlight (teal) variant
   Recommendations: 2-column property image + editorial text
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const KPIS = [
    { label: 'TOTAL SPEND',      value: '$42,850.00', delta: '+8.2% vs Last Month',  up: true },
    { label: 'ACTIVE LEADS',     value: '218',        delta: '+24% this week',       up: true },
    { label: 'CONVERSION RATE',  value: '4.4%',       delta: '+0.6 pts vs last',     up: true },
    { label: 'AI PREDICTED CPL', value: '$18',        delta: '-$3 vs benchmark',     up: true, highlight: true }
  ]

  const RECOS = [
    {
      img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=800&fit=crop',
      eyebrow: 'CAMPAIGN OPTIMIZATION',
      title: 'Scale Penthouse Calle 93 to Stories',
      text: 'CTR de 4.8% en Feed sugiere demanda alta. Mover el 30% del budget a Instagram Stories puede multiplicar el alcance entre compradores premium 24-45.',
      cta: 'Apply Recommendation',
      action: 'apply-stories'
    },
    {
      img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&h=800&fit=crop',
      eyebrow: 'CREATIVE INSIGHT',
      title: 'Castelo Medellín · ángulo "estatus" gana',
      text: 'En las últimas 72h, el ángulo psicológico "estatus" superó a "ubicación" 2.4×. Camilo sugiere generar 3 variantes adicionales con esa narrativa.',
      cta: 'Generate Variants',
      action: 'generate-variants'
    },
    {
      img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&h=800&fit=crop',
      eyebrow: 'BUDGET REALLOCATION',
      title: 'Reasignar de TikTok → Meta Feed',
      text: 'CPL en TikTok subió a $31 vs. $18 en Meta. Reasignar $1,200/semana mejora la eficiencia de la pauta sin reducir el alcance total proyectado.',
      cta: 'Reassign Budget',
      action: 'reassign'
    },
    {
      img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=800&fit=crop',
      eyebrow: 'CONTENT TIMING',
      title: 'Hora pico: 6-8pm para Bogotá Norte',
      text: 'Tus posts entre 6pm y 8pm reciben +34% engagement en Bogotá Norte. Programando ahí por defecto las próximas 7 publicaciones de Rosales y Calle 93.',
      cta: 'Auto-Schedule',
      action: 'auto-schedule'
    }
  ]

  function html() {
    return `
      <div class="rp-page rp-rise">
        <div class="rp-page-header">
          <span class="rp-eyebrow">REAL ESTATE MARKETING CLOUD</span>
          <h1 class="rp-display">Command Center</h1>
          <p class="rp-subhead">Your current performance is <strong>14% above projection</strong>. Camilo está optimizando 3 campañas activas en este momento.</p>
        </div>

        <!-- KPI cards -->
        <div class="rp-stats">
          ${KPIS.map(k => `
            <div class="rp-stat ${k.highlight ? 'highlight' : ''}">
              <div class="rp-stat-label">${k.label}</div>
              <div class="rp-stat-value">${k.value}</div>
              <div class="rp-stat-delta ${k.up ? 'up' : 'down'}">${k.up ? '↗' : '↘'} ${k.delta}</div>
            </div>
          `).join('')}
        </div>

        <!-- Recommendations -->
        <h2 class="rp-section-title">
          Camilo's Recommendations
          <span class="rp-ai-badge">AI Agent Active</span>
        </h2>

        <div class="rp-recos">
          ${RECOS.map(r => `
            <div class="rp-reco">
              <div class="rp-reco-img" style="background-image: url('${r.img}')"></div>
              <div class="rp-reco-body">
                <div class="rp-reco-eyebrow">${r.eyebrow}</div>
                <div class="rp-reco-title">${r.title}</div>
                <div class="rp-reco-text">${r.text}</div>
                <button class="rp-reco-cta" data-action="${r.action}">${r.cta}</button>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Quick links section -->
        <h2 class="rp-section-title">Quick Actions</h2>
        <div class="rp-recos">
          <div class="rp-reco">
            <div class="rp-reco-img" style="background: linear-gradient(135deg, var(--rp-teal), var(--rp-green)); display:flex; align-items:center; justify-content:center;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div class="rp-reco-body">
              <div class="rp-reco-eyebrow">PUBLISH NOW</div>
              <div class="rp-reco-title">Quick Post a property</div>
              <div class="rp-reco-text">Selecciona un inmueble, genera el caption con Camilo y publica en Instagram + Facebook en paralelo.</div>
              <button class="rp-reco-cta" onclick="window.rmRouter?.goTo('quickpost')">Open Quick Post</button>
            </div>
          </div>
          <div class="rp-reco">
            <div class="rp-reco-img" style="background: linear-gradient(135deg, var(--rp-green-deep), #00382a); display:flex; align-items:center; justify-content:center;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div class="rp-reco-body">
              <div class="rp-reco-eyebrow">CAMPAIGN BUILDER</div>
              <div class="rp-reco-title">Plan your week ahead</div>
              <div class="rp-reco-text">Diseña pauta multi-día con Smart Campaign Creator. Camilo arma copy, imagen y horarios óptimos por ti.</div>
              <button class="rp-reco-cta" onclick="window.rmRouter?.goTo('schedule')">Open Campaigns</button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  function render() {
    const slot = document.querySelector('section[data-page="dashboard"]')
    if (!slot) return
    slot.innerHTML = html()

    slot.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.rmToast?.('✨ Camilo está aplicando la recomendación…', 'success')
      })
    })
  }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'dashboard') render()
  })

  document.addEventListener('DOMContentLoaded', () => {
    render()
  })
})()
