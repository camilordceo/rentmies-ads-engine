/* ─────────────────────────────────────────────────────────────
   Parrilla de Contenidos — scheduled posts grid.
   Reads from rmStore.campaignDrafts (populated by persist.js) +
   any future server response. Falls back to a curated mock set
   so the page is never empty during demo.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const MOCK_POSTS = [
    {
      channel: 'instagram', icon: '📷', label: 'Instagram Feed',
      time: 'Hoy, 18:30 PM', status: 'scheduled',
      property: 'Residencial Los Olivos', tone: 'warm',
      optimization: 'Ajustó la puja para horario estelar y optimizó el copy para generar urgencia en leads jóvenes profesionales.'
    },
    {
      channel: 'tiktok', icon: '🎵', label: 'TikTok Creative',
      time: 'Mañana, 19:00 PM', status: 'pending',
      property: 'Villa Victoria Luxury', tone: 'rose',
      optimization: 'Detectó que videos verticales con primer plano de fachada rinden +28% en Marbella. Ajusté el corte del video.'
    },
    {
      channel: 'facebook_page', icon: '📘', label: 'Facebook Marketplace',
      time: 'Hoy, 20:00 PM', status: 'live',
      property: 'Apartamento Primavera', tone: 'leaf',
      optimization: 'Activé bid automático para CPL bajo. Los primeros 3 leads ya entraron por WhatsApp.'
    },
    {
      channel: 'whatsapp', icon: '💬', label: 'WhatsApp Status',
      time: 'Hoy, 16:00 PM', status: 'scheduled',
      property: 'Castelo Medellín', tone: 'sand',
      optimization: 'Generé caption corto para Status (24h). Recomiendo combinarlo con Instagram Stories para reforzar.'
    }
  ]

  async function getCampaigns() {
    // Try server first via data-bridge
    if (window.rmData) {
      try {
        const { campaigns } = await window.rmData.listCampaigns()
        if (campaigns && campaigns.length) return mapCampaigns(campaigns)
      } catch (_) {}
    }
    return MOCK_POSTS
  }

  function mapCampaigns(list) {
    return list.slice(0, 8).map((c, i) => {
        const channel = (c.platforms && c.platforms[0]) || 'instagram'
        const channelMeta = CHANNEL_META[channel] || CHANNEL_META.instagram
        const scheduledLabel = c.schedule?.when === 'now' ? 'Inmediato' :
                                c.schedule?.when === 'tomorrow' ? 'Mañana 9am' :
                                (c.schedule?.custom_date ? new Date(c.schedule.custom_date).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' }) : 'Programado')
        return {
          channel,
          icon: channelMeta.icon,
          label: channelMeta.label,
          time: scheduledLabel,
          status: c.status === 'draft' ? 'pending' : (c.status || 'scheduled'),
          property: c.name || c.prompt_config?.location || 'Inmueble sin nombre',
          tone: TONES[i % TONES.length],
          optimization: optimizationCopy(c)
        }
    })
  }

  const CHANNEL_META = {
    instagram:         { icon: '📷', label: 'Instagram Feed' },
    instagram_stories: { icon: '📱', label: 'Instagram Stories' },
    tiktok:            { icon: '🎵', label: 'TikTok Creative' },
    facebook_page:     { icon: '📘', label: 'Facebook Marketplace' },
    whatsapp:          { icon: '💬', label: 'WhatsApp Status' }
  }
  const TONES = ['warm', 'rose', 'leaf', 'sand', 'ocean', 'dark']

  function optimizationCopy(c) {
    const angles = Object.entries(c.prompt_config?.angles || {}).filter(([_, v]) => v).map(([k]) => k)
    const photoCount = c.prompt_config?.photo_count || 0
    if (angles.length >= 3) return `Activos ${angles.length} ángulos psicológicos. Camilord va a A/B testear ${angles.slice(0,2).join(' vs. ')} en las primeras 24h.`
    if (photoCount >= 4) return `${photoCount} fotos detectadas — generaré carrusel multi-foto para multiplicar impresiones.`
    return 'Estoy generando los creativos. Te aviso cuando estén listos para revisar.'
  }

  function html(state) {
    const campaigns = state.campaigns
    const kpi = computeKpi(campaigns)
    return `
      <div class="ae-parrilla ae-rise">
        <div class="ae-breadcrumb">
          DASHBOARD <span class="sep">/</span> <span class="current">SCHEDULED POSTS</span>
        </div>

        <header>
          <span class="ae-eyebrow" style="margin-bottom:12px;">CALENDARIO DE PUBLICACIÓN</span>
          <h1 class="ae-display">Parrilla de <em>Contenidos</em></h1>
          <p class="ae-subhead">Camilord programa, optimiza y publica en automático. Tú revisas y apruebas.</p>
        </header>

        <section class="ae-kpi-row ae-rise ae-rise-d-1">
          <div class="ae-kpi featured">
            <span class="ae-kpi-label">Posts Listos</span>
            <span class="ae-kpi-value">${kpi.ready}</span>
          </div>
          <div class="ae-kpi">
            <span class="ae-kpi-label">Canales Activos</span>
            <span class="ae-kpi-value">${String(kpi.channels).padStart(2,'0')}</span>
          </div>
          <div class="ae-kpi">
            <span class="ae-kpi-label">Alcance Estimado</span>
            <span class="ae-kpi-value">${kpi.reach}</span>
          </div>
          <div class="ae-kpi">
            <span class="ae-kpi-label">Ahorro IA</span>
            <span class="ae-kpi-value">${kpi.savedHours}h</span>
          </div>
        </section>

        <section class="ae-postgrid ae-rise ae-rise-d-2">
          ${campaigns.map(postcardHtml).join('')}
          <button class="ae-postcard-add" onclick="window.openLaunchWizard?.()" aria-label="Programar nueva publicación">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Programar nueva publicación</span>
          </button>
        </section>
      </div>
    `
  }

  function postcardHtml(p) {
    const statusLabel = ({
      scheduled: 'Scheduled',
      pending:   'Pending',
      live:      'Live',
      paused:    'Paused'
    })[p.status] || p.status
    return `
      <article class="ae-postcard">
        <div class="ae-postcard-head">
          <div class="ae-postcard-meta">
            <span class="ae-postcard-icon">${p.icon}</span>
            <div>
              <div class="ae-postcard-title">${escapeHtml(p.label)}</div>
              <div class="ae-postcard-time">${escapeHtml(p.time)}</div>
            </div>
          </div>
          <span class="ae-status ${p.status}">${statusLabel}</span>
        </div>
        <div class="ae-postcard-image" data-tone="${p.tone}">
          <span class="ae-postcard-image-label">${escapeHtml(p.property)}</span>
        </div>
        <div class="ae-postcard-optimization">
          <span class="ae-postcard-opt-icon">✦</span>
          <div class="ae-postcard-opt-body">
            <div class="ae-postcard-opt-label">Camilord Optimization</div>
            <div class="ae-postcard-opt-text">${escapeHtml(p.optimization)}</div>
          </div>
        </div>
      </article>
    `
  }

  function computeKpi(campaigns) {
    const ready = campaigns.filter(c => c.status === 'scheduled' || c.status === 'live').length
    const channels = new Set(campaigns.map(c => c.channel)).size
    const reachNum = campaigns.length * 3100
    const reach = reachNum >= 1000 ? `${(reachNum / 1000).toFixed(1)}k` : String(reachNum)
    const savedHours = Math.round(campaigns.length * 4.5)
    return { ready: String(ready).padStart(2, '0'), channels, reach, savedHours }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  async function render() {
    const slot = document.querySelector('section[data-page="dashboard"]')
    if (!slot) return
    // Show skeleton while we resolve campaigns
    if (window.rmStates) window.rmStates.skeleton(slot, 4)
    const campaigns = await getCampaigns()
    slot.innerHTML = html({ campaigns })
  }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'dashboard') render()
  })

  // Render once on first visit + when localStorage updates
  document.addEventListener('DOMContentLoaded', () => {
    render()
    window.addEventListener('storage', e => {
      if (e.key === 'rm_campaign_drafts') render()
    })
  })
})()
