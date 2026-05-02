/* ─────────────────────────────────────────────────────────────
   Rentmies Prime — Camilo AI panel
   Single light-bg template adapts content via mode (intro + feed
   + tabs). Each page passes lead-feed copy customized to the page.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function panelEl() { return document.querySelector('.ae-camilord, .rp-panel') }

  const SPARKLE_SVG = `
    <svg viewBox="0 0 24 24"><path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z" fill="currentColor"/></svg>
  `

  function header(eyebrow, intro) {
    return `
      <div class="rp-cam-header">
        <div class="rp-cam-header-icon">${SPARKLE_SVG}</div>
        <div class="rp-cam-header-text">
          <div class="rp-cam-title">Camilo AI</div>
          <div class="rp-cam-eyebrow">${escapeHtml(eyebrow || 'Intelligent Insights')}</div>
        </div>
      </div>
      <div class="rp-cam-intro"><p>${intro}</p></div>
    `
  }

  function leadFeed(title, items) {
    return `
      <div class="rp-cam-section">${escapeHtml(title)}</div>
      <div class="rp-feed">
        ${items.map(it => `
          <div class="rp-feed-item">
            <div class="rp-feed-title">${escapeHtml(it.title)}</div>
            <div class="rp-feed-body">${escapeHtml(it.body)}</div>
            <div class="rp-feed-time">${escapeHtml(it.time)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function askCamilo() {
    return `
      <div class="ae-cam-spacer"></div>
      <div class="rp-ask-camilo">
        <button class="rp-ask-camilo-btn" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Ask Camilo
        </button>
      </div>
      <div class="rp-cam-tabs">
        <button class="rp-cam-tab active" data-cam-tab="insights"><span class="rp-cam-tab-dot"></span>Insights</button>
        <button class="rp-cam-tab" data-cam-tab="audience"><span class="rp-cam-tab-dot"></span>Audience</button>
        <button class="rp-cam-tab" data-cam-tab="creative"><span class="rp-cam-tab-dot"></span>Creative</button>
        <button class="rp-cam-tab" data-cam-tab="market"><span class="rp-cam-tab-dot"></span>Market</button>
      </div>
    `
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  // ─────────────────────────────────────────────────────────────
  // Templates by page
  // ─────────────────────────────────────────────────────────────

  function tplDashboard() {
    return header('Intelligent Insights', `
      Tu performance está <strong>14% por encima</strong> de la proyección. He optimizado <em>3 campañas</em> en las últimas 24h.
    `) + leadFeed('Lead Generation Feed', [
      { title: 'New High-Value Lead',     body: 'Comprador calificado interesado en El Poblado · presupuesto $850M.', time: 'Just now' },
      { title: 'CPL bajó -18%',           body: 'Penthouse Calle 93: el ángulo "estatus" supera al de "ubicación" 2.4×.', time: '2 min ago' },
      { title: 'Tour agendado',           body: 'WhatsApp programó visita para el sábado 10am · Rosales 2BR.',         time: '12 min ago' },
      { title: 'Video viral en Reels',    body: '4.2k views en 2 horas · Santa Bárbara penthouse.',                     time: '1 hr ago' }
    ]) + askCamilo()
  }

  function tplCampaigns() {
    return header('Campaign Intelligence', `
      Detecté <em>3 oportunidades</em> de escalamiento esta semana. Las propiedades de Bogotá Norte tienen <strong>+34% engagement</strong>.
    `) + leadFeed('Optimization Feed', [
      { title: 'Auto-bid ajustado',       body: 'CPC max +12% en horario estelar para los 3 ads top.',                  time: 'Just now' },
      { title: 'Carrusel multi-foto',     body: 'Castelo Medellín: 8 fotos detectadas, generando carrusel.',            time: '5 min ago' },
      { title: 'Pause sugerido',          body: 'TikTok Marbella · CTR 0.4% últimos 3 días. Reasignar a Meta Feed.',    time: '18 min ago' }
    ]) + askCamilo()
  }

  function tplContent() {
    return header('Content Intelligence', `
      Tus fotos con <em>luz natural</em> reciben <strong>+40% engagement</strong>. Mejor horario en Colombia: <em>6-8pm</em>.
    `) + leadFeed('Creative Feed', [
      { title: 'Caption listo',           body: 'Generé copy con ángulo "estilo de vida" para Strada Bogotá.',          time: 'Just now' },
      { title: 'Imagen IA generada',      body: 'Rosales penthouse · banda inferior con precio en verde Rentmies.',     time: '3 min ago' },
      { title: 'Video editado',           body: 'Drone fly-through Calle 93 · 12s · listo para Reels.',                  time: '15 min ago' }
    ]) + askCamilo()
  }

  function tplAnalytics() {
    return header('Performance Insights', `
      CTR subió <strong>+0.6 pts</strong> esta semana. El driver principal: el ángulo <em>estatus</em> en El Poblado pasó de 1.8% → 4.4%.
    `) + leadFeed('Learnings This Week', [
      { title: 'Hora pico: 6-8pm',        body: '+34% engagement en este window. Programando ahí por defecto.',          time: 'Today' },
      { title: 'Meta > TikTok',           body: 'CPL en Meta Feed $18 vs. TikTok $31. Reasignando budget.',              time: 'Yesterday' },
      { title: 'Carrusel > foto única',   body: '+1.4 pts CTR cuando el inmueble tiene 4+ fotos.',                       time: '2 days ago' }
    ]) + askCamilo()
  }

  function tplQuickPost() {
    return header('Quick Post Assistant', `
      Sube una foto de tu mejor inmueble. Yo me encargo del <em>caption</em>, el ángulo psicológico y los hashtags.
    `) + leadFeed('Suggestions', [
      { title: 'Luz natural = +40%',      body: 'Las fotos al amanecer o atardecer reciben más engagement.',             time: 'Tip' },
      { title: 'Mejor horario',           body: 'Publica entre 6pm y 8pm hora Colombia para máximo alcance.',            time: 'Tip' },
      { title: 'Hashtags geo',            body: 'Añade #ChapineroBogota o #PobladoMedellin para alcance local.',         time: 'Tip' }
    ]) + askCamilo()
  }

  function tplSchedule() {
    return header('Campaign Builder', `
      Diseña tu pauta multi-día. Te recomendaré los <strong>mejores horarios</strong> y la <em>distribución óptima</em> entre Meta e IG.
    `) + leadFeed('Recommendations', [
      { title: 'Pico de Bogotá',          body: 'Lunes y miércoles 7pm tienen +28% reach en zona Norte.',               time: 'Tip' },
      { title: 'Reels > Feed',            body: 'En propiedades premium, Reels convierten 2.1× mejor que Feed.',         time: 'Tip' }
    ]) + askCamilo()
  }

  function tplInmuebles() {
    return header('Inventory Intelligence', `
      Click en cualquier inmueble para publicarlo. Si no has importado tu catálogo, te muestro <em>5 propiedades</em> de muestra.
    `) + leadFeed('Top Performers', [
      { title: 'El Poblado penthouse',    body: '847 vistas · 12 leads esta semana · CPL $14.',                          time: '7d' },
      { title: 'Rosales 2BR',             body: '623 vistas · 8 leads · video de drone con +60% retention.',             time: '7d' }
    ]) + askCamilo()
  }

  function tplWhatsApp() {
    return header('WhatsApp Templates', `
      Trae tus templates desde Meta Graph en vivo. Necesitas <strong>WABA ID</strong> en Settings.
    `) + leadFeed('Recent Activity', [
      { title: 'Template aprobada',       body: 'lead_followup_v2 · pasó revisión Meta en 2 horas.',                    time: 'Today' },
      { title: '12 mensajes enviados',    body: 'Follow-up automático a leads sin respuesta en 48h.',                   time: 'Today' }
    ]) + askCamilo()
  }

  function tplSettings() {
    return header('Connection Settings', `
      Las credenciales se guardan en este navegador. Para sincronizar entre dispositivos, configura <em>Supabase</em> en Vercel.
    `) + leadFeed('Status', [
      { title: 'Meta Business',           body: 'Page + Instagram + WhatsApp Business conectados.',                      time: 'Now' },
      { title: 'OpenAI',                  body: 'Caption + image generation activa.',                                    time: 'Now' }
    ]) + askCamilo()
  }

  function tplStudio() {
    return header('Creative Studio', `
      Estoy listo. Dame un inmueble y armo la <em>campaña completa</em> — copy, imagen, ángulos psicológicos, plataformas. Solo aprueba.
    `) + leadFeed('Today\'s Suggestions', [
      { title: 'Optimizar para Stories',  body: 'Vertical 9:16 · 3 propiedades listas para Stories esta tarde.',         time: 'Just now' },
      { title: 'Keywords competencia',    body: 'Detecté 8 keywords nuevas que tu competencia usa esta semana.',         time: '15 min ago' }
    ]) + askCamilo()
  }

  // ─────────────────────────────────────────────────────────────
  // Mode swap
  // ─────────────────────────────────────────────────────────────

  let currentMode = null

  const TEMPLATES = {
    studio:    tplStudio,
    dashboard: tplDashboard,
    history:   tplCampaigns,
    analytics: tplAnalytics,
    quickpost: tplQuickPost,
    schedule:  tplSchedule,
    inmuebles: tplInmuebles,
    whatsapp:  tplWhatsApp,
    settings:  tplSettings,
    posts:     tplContent
  }

  function setMode(page) {
    const panel = panelEl()
    if (!panel) return
    if (page === currentMode) return
    currentMode = page

    const tpl = TEMPLATES[page] || tplDashboard
    panel.innerHTML = tpl()

    // Wire vertical tabs (no-op behavior, just visual selection)
    panel.querySelectorAll('[data-cam-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('[data-cam-tab]').forEach(b => b.classList.toggle('active', b === btn))
      })
    })

    // Re-fire store update if Studio (lets camilord-brain reactivity work if loaded)
    if (page === 'studio') window.rmStore?.set({})
  }

  document.addEventListener('rm-page-change', e => setMode(e.detail.page))
  document.addEventListener('DOMContentLoaded', () => setMode(window.rmRouter?.currentPage() || 'dashboard'))
})()
