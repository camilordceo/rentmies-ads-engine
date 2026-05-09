/* ─────────────────────────────────────────────────────────────
   Camilord channel-aware modes
   This module owns the per-channel state of the Camilo AI panel.
   It exposes a registry — window.rmCamilordModes — that
   camilord-modes.js (the renderer) consults to find the right
   eyebrow / intro / feed for the current page.

   Why this lives in its own file:
   - Per-channel content is the most-edited area of the panel.
     Keeping it separate means tweaking copy doesn't risk the
     mode-swap mechanics in camilord-modes.js.
   - Future: per-channel modes will read live state (WABA tier,
     Google Ads spend pace, TikTok tier of messaging) and surface
     real numbers. The module-level scope is the right home for
     that subscriber logic.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // ── Channel themes ───────────────────────────────────────
  // Visual hint for the panel header pill, tied to a CSS variable
  // so each channel has a recognizable accent color.
  const CHANNEL_THEMES = {
    meta:     { accent: 'var(--rp-teal, #40d99d)',  label: 'META · CAMPAIGNS' },
    whatsapp: { accent: '#25D366',                   label: 'WHATSAPP · CONVERSATIONAL' },
    google:   { accent: '#4285F4',                   label: 'GOOGLE ADS · INTENT' },
    tiktok:   { accent: '#FE2C55',                   label: 'TIKTOK · DISCOVERY' }
  }

  // ── Modes per page id ────────────────────────────────────
  // Each mode contributes: { eyebrow, intro (HTML), feedTitle, feed: [{title, body, time}] }
  // The renderer in camilord-modes.js wraps these with the standard panel chrome.
  const MODES = {
    // Meta channel
    quickpost: {
      channel: 'meta',
      eyebrow: 'Quick Post · Meta',
      intro: `Sube una foto de tu mejor inmueble. Yo me encargo del <em>caption</em>, el ángulo psicológico y los hashtags. Mejor horario en Bogotá: <strong>6-8pm</strong>.`,
      feedTitle: 'Tips del momento',
      feed: [
        { title: 'Luz natural = +40%',  body: 'Las fotos al amanecer o atardecer reciben más engagement.',  time: 'Tip' },
        { title: 'Hashtags geo',        body: 'Añade #ChapineroBogota o #PobladoMedellin para alcance local.', time: 'Tip' },
        { title: 'IG Reels > Feed',     body: 'En propiedades premium, Reels convierten 2.1× mejor.',         time: 'Tip' }
      ]
    },
    schedule: {
      channel: 'meta',
      eyebrow: 'Campaign Builder · Meta',
      intro: `Diseña tu pauta multi-día. Te recomendaré los <strong>mejores horarios</strong> y la <em>distribución óptima</em> entre Meta e IG.`,
      feedTitle: 'Recommendations',
      feed: [
        { title: 'Pico de Bogotá',    body: 'Lunes y miércoles 7pm tienen +28% reach en zona Norte.', time: 'Tip' },
        { title: 'Carrusel multi-foto', body: 'Castelo Medellín: 8 fotos detectadas, generando carrusel.', time: '5 min' }
      ]
    },
    inmuebles: {
      channel: 'meta',
      eyebrow: 'Inventory · Meta',
      intro: `Click en cualquier inmueble para publicarlo. Si no has importado tu catálogo, te muestro <em>5 propiedades</em> de muestra.`,
      feedTitle: 'Top Performers',
      feed: [
        { title: 'El Poblado penthouse', body: '847 vistas · 12 leads esta semana · CPL $14.', time: '7d' },
        { title: 'Rosales 2BR',          body: '623 vistas · 8 leads · video drone +60% retention.', time: '7d' }
      ]
    },
    posts: {
      channel: 'meta',
      eyebrow: 'Historial · Meta',
      intro: `Tus últimos posts en Meta — IG y FB. Click en cualquiera para ver métricas detalladas.`,
      feedTitle: 'Últimos publicados',
      feed: [
        { title: 'Caption listo',     body: 'Generé copy con ángulo "estilo de vida" para Strada Bogotá.', time: 'Just now' },
        { title: 'Imagen IA generada', body: 'Rosales penthouse · banda inferior con precio en verde.', time: '3 min' },
        { title: 'Video editado',     body: 'Drone fly-through Calle 93 · 12s · listo para Reels.', time: '15 min' }
      ]
    },

    // WhatsApp channel
    whatsapp: {
      channel: 'whatsapp',
      eyebrow: 'WhatsApp Templates',
      intro: `Crea plantillas que Meta apruebe en <strong>~2 horas</strong>. El secreto: copy claro, sin promociones agresivas, variables limpias.`,
      feedTitle: 'Templates en revisión',
      feed: [
        { title: 'lead_followup_v2',   body: 'Aprobada en 2h · ya usable.',           time: 'Today' },
        { title: 'tour_reminder',      body: 'En revisión · 5 min desde envío.',     time: '5 min' },
        { title: 'visita_programada',  body: 'Sugerencia: agregar variable {fecha}.', time: 'Tip' }
      ]
    },
    'wa-broadcasts': {
      channel: 'whatsapp',
      eyebrow: 'WhatsApp Broadcasts',
      intro: `Envía tu template aprobada a miles de leads. Camilo aplica throttling automático para no tropezar el <strong>tier de mensajería</strong> de tu WABA.`,
      feedTitle: 'Tier · Calidad',
      feed: [
        { title: 'Tier actual: GREEN',   body: '1,000 conversaciones / 24h disponibles.',      time: 'Now' },
        { title: 'Quality rating: alta', body: 'Tasa de bloqueo <0.5%. Perfecto para escalar.', time: 'Now' },
        { title: 'Mejor horario LATAM',  body: 'Mar/jue 11am-1pm para inmuebles. Evita lunes.', time: 'Tip' }
      ]
    },
    'wa-analytics': {
      channel: 'whatsapp',
      eyebrow: 'WhatsApp Analytics',
      intro: `Performance de tus templates y broadcasts. Compara delivery rate, read rate y conversion <em>contra benchmarks</em> del sector inmobiliario en Colombia.`,
      feedTitle: 'Métricas clave',
      feed: [
        { title: 'Delivery: 96.4%',    body: '+1.2 pts vs sector. Tu lista está limpia.', time: '24h' },
        { title: 'Read rate: 78%',     body: 'Encima del benchmark 64%.',                  time: '24h' },
        { title: 'Reply rate: 12%',    body: 'Bajo. Probemos copy con CTA más directo.',   time: '7d' }
      ]
    },

    // Google channel
    'google-campaigns': {
      channel: 'google',
      eyebrow: 'Google Ads · Search & Display',
      intro: `Crea campañas de Search con keywords inmobiliarias por ciudad. Camilo arma el plan completo: keywords, ad copy, landing pages.`,
      feedTitle: 'Recomendaciones',
      feed: [
        { title: 'Keyword: "apartamento Chapinero"',  body: '$1,800 CPC · 2,400 búsquedas/mes en Bogotá.', time: 'Tip' },
        { title: 'Match type: phrase',                body: 'Exact es muy estrecho para inmobiliarias.',    time: 'Tip' },
        { title: 'Negative: "alquiler temporal"',     body: 'Excluye vacacional. Te ahorra clicks malos.',  time: 'Tip' }
      ]
    },
    'google-pmax': {
      channel: 'google',
      eyebrow: 'Performance Max · Google',
      intro: `Una sola campaña que distribuye automáticamente entre Search, Display, YouTube, Maps y Discover. La IA de Google optimiza el mix por canal.`,
      feedTitle: 'Asset signals',
      feed: [
        { title: 'Sube 10 imágenes',  body: 'Más assets = más placements. Reusa las que ya tienes para Meta.', time: 'Tip' },
        { title: 'Audience signals',  body: 'Dale 3 audiencias semilla — interés en compra de vivienda.',     time: 'Tip' },
        { title: 'Conversion goal',   body: 'Valor por conversión = comisión esperada del bróker.',           time: 'Tip' }
      ]
    },
    'google-leads': {
      channel: 'google',
      eyebrow: 'Google · Lead Forms',
      intro: `Captura leads sin sacar al usuario de Google. Pre-llenado automático con datos del perfil del usuario logueado.`,
      feedTitle: 'Lead form best practices',
      feed: [
        { title: 'Mantén ≤4 campos',     body: 'Cada campo extra reduce el lead rate ~12%.', time: 'Tip' },
        { title: 'Custom Q clave',        body: '"¿Cuándo te quieres mudar?" filtra calidad.', time: 'Tip' },
        { title: 'Privacy URL obligatoria', body: 'Google rechaza forms sin política de privacidad.', time: 'Tip' }
      ]
    },

    // TikTok channel
    'tiktok-videos': {
      channel: 'tiktok',
      eyebrow: 'TikTok · Videos',
      intro: `Sube tours en video o genera Reels verticales desde fotos. Música trending y cortes auto-detectados. Recuerda: TikTok premia <em>retención</em>, no view count.`,
      feedTitle: 'Tendencias hoy',
      feed: [
        { title: 'Sound: "Casa de los sueños"', body: '+340% views en últimos 7 días. Úsalo.', time: '7d' },
        { title: 'Format: voiceover',           body: 'Tu propia voz convierte 1.6× mejor que IA.', time: 'Tip' },
        { title: 'First 3 seconds',             body: 'Hook visual claro. Sin texto cargado.',     time: 'Tip' }
      ]
    },
    'tiktok-schedule': {
      channel: 'tiktok',
      eyebrow: 'TikTok · Schedule',
      intro: `Programa hasta 7 días por adelantado. <strong>Máximo 3 posts/día</strong> — TikTok castiga la sobre-publicación.`,
      feedTitle: 'Mejor horario LATAM',
      feed: [
        { title: 'Mar/jue 7-9pm', body: 'Pico de scroll en Colombia. +28% completion rate.', time: 'Tip' },
        { title: 'Domingo 10am',  body: 'Audiencia premium activa. Bajo competition rate.',  time: 'Tip' }
      ]
    },
    'tiktok-analytics': {
      channel: 'tiktok',
      eyebrow: 'TikTok · Analytics',
      intro: `Reach, engagement y leads atribuidos a TikTok. Comparable directo con Meta y Google en el dashboard unificado.`,
      feedTitle: 'Métricas clave',
      feed: [
        { title: 'Avg watch time: 18s', body: 'Por encima del 12s del sector.',     time: '7d' },
        { title: 'Completion 61%',      body: 'Excelente. Algoritmo te empujará.',  time: '7d' },
        { title: 'CPL $24',             body: '+33% vs Meta. Reasignar?',           time: '7d' }
      ]
    },

    // Top-level (cross-channel)
    dashboard: {
      channel: null,
      eyebrow: 'Intelligent Insights',
      intro: `Tu performance está <strong>14% por encima</strong> de la proyección. He optimizado <em>3 campañas</em> en las últimas 24h.`,
      feedTitle: 'Lead Generation Feed',
      feed: [
        { title: 'New High-Value Lead',  body: 'Comprador calificado en El Poblado · presupuesto $850M.',  time: 'Just now' },
        { title: 'CPL bajó -18%',         body: 'Penthouse Calle 93 · ángulo "estatus" gana 2.4×.',          time: '2 min' },
        { title: 'Tour agendado',         body: 'WhatsApp programó visita sábado 10am · Rosales 2BR.',     time: '12 min' },
        { title: 'Video viral en Reels',  body: '4.2k views en 2h · Santa Bárbara penthouse.',              time: '1h' }
      ]
    },
    settings: {
      channel: null,
      eyebrow: 'Connection Settings',
      intro: `Las credenciales viven en Supabase. Cada canal tiene su propia salud y se reconecta sin tocar a los demás.`,
      feedTitle: 'Estado de conexiones',
      feed: [
        { title: 'Meta',     body: 'Page + Instagram + WhatsApp Business conectados.', time: 'Now' },
        { title: 'OpenAI',   body: 'Caption + image generation activa.',                time: 'Now' },
        { title: 'Google',   body: 'Pendiente de conectar.',                            time: '—' },
        { title: 'TikTok',   body: 'Pendiente de conectar.',                            time: '—' }
      ]
    },
    analytics: {
      channel: null,
      eyebrow: 'Performance Insights',
      intro: `CTR subió <strong>+0.6 pts</strong> esta semana. Driver principal: el ángulo <em>estatus</em> en El Poblado pasó de 1.8% → 4.4%.`,
      feedTitle: 'Learnings',
      feed: [
        { title: 'Hora pico: 6-8pm',     body: '+34% engagement window. Programando ahí por defecto.',  time: 'Today' },
        { title: 'Meta > TikTok',         body: 'CPL Meta $18 vs TikTok $31. Reasignando budget.',       time: 'Yesterday' },
        { title: 'Carrusel > foto única', body: '+1.4 pts CTR cuando hay 4+ fotos.',                     time: '2d' }
      ]
    },
    studio: {
      channel: null,
      eyebrow: 'Creative Studio',
      intro: `Estoy listo. Dame un inmueble y armo la <em>campaña completa</em> — copy, imagen, ángulos psicológicos, plataformas. Solo aprueba.`,
      feedTitle: "Today's Suggestions",
      feed: [
        { title: 'Stories vertical 9:16', body: '3 propiedades listas para Stories esta tarde.', time: 'Just now' },
        { title: 'Keywords competencia',   body: '8 keywords nuevas que tu competencia usa.',     time: '15 min' }
      ]
    },
    history: {
      channel: null,
      eyebrow: 'Campaign History',
      intro: `Histórico de campañas pasadas. Filtra por canal, ROI o estado para encontrar lo que buscas.`,
      feedTitle: 'Insights',
      feed: [
        { title: 'Top campaña 2026 Q1', body: 'Penthouse Calle 93 · ROAS 14×.',  time: '90d' },
        { title: 'Worst campaign',      body: 'TikTok Marbella · CTR 0.4%.',     time: '30d' }
      ]
    },
    connect: {
      channel: null,
      eyebrow: 'Conexión Guiada',
      intro: `Te llevamos paso a paso por Business Manager. Cuando lleguemos al token, lo validamos en vivo — sabrás al instante si está bien.`,
      feedTitle: 'Lo que vamos a hacer',
      feed: [
        { title: 'Verificar Business Manager', body: 'Crear uno o usar el que ya tienes.',  time: 'Step 1' },
        { title: 'Instalar app Rentmies',       body: 'En Business Settings → Apps.',         time: 'Step 2' },
        { title: 'System User',                 body: '"Rentmies Connection" como Admin.',    time: 'Step 3' },
        { title: 'Asignar assets',              body: 'Page + IG + WABA con permisos Manage.', time: 'Step 4' }
      ]
    }
  }

  // Default fallback per channel for unknown sub-pages
  const CHANNEL_DEFAULTS = {
    meta:     'quickpost',
    whatsapp: 'whatsapp',
    google:   'google-campaigns',
    tiktok:   'tiktok-videos'
  }

  function modeFor (page) {
    if (MODES[page]) return MODES[page]
    // Try to find by channel prefix
    const channel = page.startsWith('wa-') ? 'whatsapp'
                  : page.startsWith('google-') ? 'google'
                  : page.startsWith('tiktok-') ? 'tiktok'
                  : null
    if (channel && CHANNEL_DEFAULTS[channel]) return MODES[CHANNEL_DEFAULTS[channel]]
    return MODES.dashboard
  }

  window.rmCamilordModes = {
    MODES,
    CHANNEL_THEMES,
    CHANNEL_DEFAULTS,
    modeFor
  }
})()
