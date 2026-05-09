/* ─────────────────────────────────────────────────────────────
   Coming-soon stub renderer
   For pages whose <section data-page="X"> hasn't yet been claimed
   by a real page module. Renders a polished "coming soon" view
   with channel context, sub-nav, and a CTA for early access.

   Real page modules can override by rendering their own content
   into the <section> on mount — this stub only fires when the
   section is empty after a page change.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // Page id → { channel, title, eyebrow, lede, milestone }
  const STUBS = {
    'wa-broadcasts': {
      channel: 'whatsapp',
      title: 'Broadcasts <em>masivos</em>',
      eyebrow: 'WHATSAPP · BROADCASTS',
      lede: 'Sube tu CSV de contactos y dispara templates aprobadas a miles de leads en minutos. Cumple con políticas de Meta — solo plantillas pre-validadas.',
      milestone: 'Disponible en el Bloque 2',
      bullets: [
        'CSV de hasta 10,000 contactos por broadcast',
        'Variables dinámicas con merge tags por contacto',
        'Tracking en vivo (enviado · entregado · leído · respuesta)',
        'Tier de mensajería de tu WABA visible en cada launch'
      ]
    },
    'wa-analytics': {
      channel: 'whatsapp',
      title: 'WhatsApp <em>Analytics</em>',
      eyebrow: 'WHATSAPP · ANALYTICS',
      lede: 'Performance de tus templates y broadcasts. Quality rating, response rate, conversion a llamada — todo en un solo dashboard.',
      milestone: 'Disponible en el Bloque 2',
      bullets: [
        'Quality rating (Green / Yellow / Red) en vivo',
        'Tasas de entrega y lectura por broadcast',
        'Funnel de conversión template → response → cita',
        'Comparativa contra benchmarks del sector inmobiliario'
      ]
    },
    'google-campaigns': {
      channel: 'google',
      title: 'Google <em>Campaigns</em>',
      eyebrow: 'GOOGLE ADS · CAMPAIGNS',
      lede: 'Crea campañas de Search, Display y YouTube directo desde Rentmies. Keywords pre-armadas para inmobiliarias colombianas.',
      milestone: 'Disponible en el Bloque 3',
      bullets: [
        'OAuth con Google Ads (developer token approved)',
        'Search campaigns con keywords inmobiliarias por ciudad',
        'Display ads usando los assets que ya generas para Meta',
        'Tracking unificado de conversiones con WhatsApp'
      ]
    },
    'google-pmax': {
      channel: 'google',
      title: 'Performance <em>Max</em>',
      eyebrow: 'GOOGLE ADS · PERFORMANCE MAX',
      lede: 'Una sola campaña que distribuye automáticamente entre Search, Display, YouTube, Maps y Discover. La IA de Google optimiza el mix.',
      milestone: 'Disponible en el Bloque 3',
      bullets: [
        'Asset groups con headlines + descripciones + imágenes',
        'Audience signals para targeting inmobiliario',
        'Conversion tracking integrado con tu CRM',
        'Reporte de placements donde realmente convirtió'
      ]
    },
    'google-leads': {
      channel: 'google',
      title: 'Lead <em>Forms</em>',
      eyebrow: 'GOOGLE ADS · LEAD FORMS',
      lede: 'Captura leads sin sacar al usuario de Google. Los formularios se llenan automáticamente con datos del usuario logueado.',
      milestone: 'Disponible en el Bloque 3',
      bullets: [
        'Lead form extensions en campañas de Search',
        'Pre-llenado automático con datos de Google',
        'Sincronización en tiempo real con WhatsApp follow-up',
        'CSV download de leads + webhook al CRM'
      ]
    },
    'tiktok-videos': {
      channel: 'tiktok',
      title: 'TikTok <em>Videos</em>',
      eyebrow: 'TIKTOK · VIDEOS',
      lede: 'Sube tus tours en video o genera Reels verticales desde fotos del inmueble. Música trending y cortes auto-detectados.',
      milestone: 'Próximamente · scaffolding',
      bullets: [
        'Upload directo a TikTok Business Account',
        'Editor de cortes + texto sobrepuesto',
        'Detección automática de música trending por ciudad',
        'Cross-post a Instagram Reels desde el mismo flow'
      ]
    },
    'tiktok-schedule': {
      channel: 'tiktok',
      title: 'TikTok <em>Schedule</em>',
      eyebrow: 'TIKTOK · SCHEDULE',
      lede: 'Programa hasta 7 días por adelantado. La IA recomienda horarios pico por ciudad y tipo de inmueble.',
      milestone: 'Próximamente · scaffolding',
      bullets: [
        'Calendario semanal drag-and-drop',
        'Recomendaciones de horario óptimo por audiencia',
        'Limite automático: máx 3 posts/día (regla de TikTok)',
        'Re-tries automáticos si la API rechaza el upload'
      ]
    },
    'tiktok-analytics': {
      channel: 'tiktok',
      title: 'TikTok <em>Analytics</em>',
      eyebrow: 'TIKTOK · ANALYTICS',
      lede: 'Reach, engagement y leads atribuidos a TikTok. Comparable directo con Meta e Google en el dashboard unificado.',
      milestone: 'Próximamente · scaffolding',
      bullets: [
        'Views, watch time y completion rate por video',
        'CPC y CPL con tu spend de TikTok Ads',
        'Top videos del mes ranked por leads generados',
        'Export CSV para presentar al cliente'
      ]
    }
  }

  const CHANNEL_LABELS = {
    meta: 'Meta',
    whatsapp: 'WhatsApp',
    google: 'Google',
    tiktok: 'TikTok'
  }

  function escapeHtml (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  function html (page, def) {
    const subnav = window.rpSubnav ? window.rpSubnav.html(page) : ''
    const channelLabel = CHANNEL_LABELS[def.channel] || def.channel
    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header">
          <span class="rp-eyebrow">${escapeHtml(def.eyebrow)}</span>
          <h1 class="rp-display">${def.title}</h1>
          <p class="rp-subhead">${escapeHtml(def.lede)}</p>
        </div>

        <section class="ae-formcard rm-coming-soon-card">
          <div class="ae-formcard-h">
            <span style="display:flex; align-items:center; gap:10px;">
              <span class="rm-coming-soon-dot"></span>
              ${escapeHtml(def.milestone)}
            </span>
            <span class="ae-formcard-h-accessory">
              <span class="ae-ai-badge">CANAL · ${escapeHtml(channelLabel.toUpperCase())}</span>
            </span>
          </div>

          <ul class="rm-coming-soon-list">
            ${def.bullets.map(b => `
              <li>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${escapeHtml(b)}</span>
              </li>
            `).join('')}
          </ul>

          <div class="ae-action-row" style="margin-top:24px;">
            <button type="button" class="ae-btn-authority" data-coming-soon-cta="early-access">
              Pedir acceso anticipado
            </button>
            <a href="#dashboard" class="ae-btn-ghost">Volver al Dashboard</a>
          </div>
        </section>
      </section>
    `
  }

  function injectStylesOnce () {
    if (document.getElementById('rm-coming-soon-styles')) return
    const css = `
      .rm-coming-soon-card { background: linear-gradient(160deg, var(--rp-surface, #fff), var(--rp-surface-raised, #f6f3ee)); border-left: 3px solid var(--rp-teal); }
      .rm-coming-soon-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--rp-teal); box-shadow: 0 0 8px var(--rp-teal); animation: ae-pulse 1.6s ease-in-out infinite; }
      .rm-coming-soon-list { list-style: none; padding: 0; margin: 14px 0 4px; display: grid; gap: 10px; }
      .rm-coming-soon-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; line-height: 1.55; color: var(--rm-ink-2, #3a3f3b); }
      .rm-coming-soon-list svg { color: var(--rp-teal); flex-shrink: 0; margin-top: 3px; }
    `
    const s = document.createElement('style')
    s.id = 'rm-coming-soon-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  function renderIfStub (page) {
    const def = STUBS[page]
    if (!def) return
    const slot = document.querySelector('section[data-page="' + page + '"]')
    if (!slot) return
    // If a real page module has already filled this slot with .rp-page,
    // don't overwrite. Stub only fills empty / comment-only slots.
    if (slot.querySelector('.rp-page')) return
    injectStylesOnce()
    slot.innerHTML = html(page, def)

    slot.querySelector('[data-coming-soon-cta]')?.addEventListener('click', () => {
      window.rmToast?.('🌱 Te avisamos por email cuando salga.', 'success')
    })
  }

  document.addEventListener('rm-page-change', e => renderIfStub(e.detail.page))

  document.addEventListener('DOMContentLoaded', () => {
    const cur = window.rmRouter?.currentPage()
    if (cur) renderIfStub(cur)
  })
})()
