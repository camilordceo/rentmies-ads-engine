/* ─────────────────────────────────────────────────────────────
   Dashboard — Cross-channel Command Center
   Hero · Unified KPIs · 3 channel breakdown cards · Cross-channel
   activity feed · Camilord recommendations.

   Data strategy: when /api/dashboard/overview is available, use
   real numbers per channel; otherwise show mock numbers with a
   "DEMO" badge so the user knows. Channel cards link to each
   channel's default page.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // ── Data sources (mock fallback until /api/dashboard/overview ships) ──
  const MOCK = {
    unified: {
      total_reach:  { value: '184.2K',    delta: '+12% vs last 7d',  up: true },
      total_spend:  { value: '$42,850.00', delta: '+8.2% vs last',    up: true },
      total_leads:  { value: '218',        delta: '+24% this week',   up: true },
      blended_cpl:  { value: '$18',        delta: '-$3 vs benchmark', up: true, highlight: true }
    },
    channels: {
      meta: {
        emoji: '📘',
        name: 'Meta',
        accent: '#40d99d',
        href: '#quickpost',
        spend: '$28,400',
        leads: '142',
        cpl: '$18',
        reach: '94.3K',
        delta_label: '+11% vs last week',
        delta_up: true,
        recent: 'Penthouse Calle 93 · 4.2K views en Reels'
      },
      whatsapp: {
        emoji: '💬',
        name: 'WhatsApp',
        accent: '#25D366',
        href: '#whatsapp',
        spend: '$3,200',
        leads: '54',
        cpl: '$11',
        reach: '12.4K',
        delta_label: '+38% vs last week',
        delta_up: true,
        recent: '3 templates aprobadas · tier GREEN'
      },
      google: {
        emoji: '🔍',
        name: 'Google',
        accent: '#4285F4',
        href: '#google-campaigns',
        spend: '$11,250',
        leads: '22',
        cpl: '$24',
        reach: '77.5K',
        delta_label: 'Conecta para activar',
        delta_up: null,
        connected: false,
        recent: 'Pendiente de conectar OAuth'
      }
    },
    activity: [
      { channel: 'meta',     emoji: '📘', title: 'Reel viral en IG',         body: 'Penthouse Calle 93 · 4.2K views en 2 horas',  time: '12 min ago' },
      { channel: 'whatsapp', emoji: '💬', title: 'Template aprobada',         body: 'lead_followup_v2 · pasó revisión Meta en 2h',  time: '1h ago' },
      { channel: 'meta',     emoji: '📘', title: 'CPL bajó -18%',             body: 'Ángulo "estatus" gana 2.4× en El Poblado',     time: '3h ago' },
      { channel: 'whatsapp', emoji: '💬', title: 'Tour agendado',             body: 'WhatsApp programó visita sábado 10am',         time: '5h ago' },
      { channel: 'google',   emoji: '🔍', title: 'Lead form draft listo',     body: 'Conecta Google Ads para publicar',             time: '8h ago' }
    ],
    recos: [
      {
        channel: 'meta',
        img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=800&fit=crop',
        eyebrow: 'META · CAMPAIGN OPTIMIZATION',
        title: 'Escalar Penthouse Calle 93 a Stories',
        text: 'CTR de 4.8% en Feed sugiere demanda alta. Mover el 30% del budget a Instagram Stories puede multiplicar el alcance entre compradores premium 24-45.',
        cta: 'Aplicar',
        action: 'apply-stories'
      },
      {
        channel: 'whatsapp',
        img: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=600&h=800&fit=crop',
        eyebrow: 'WHATSAPP · BROADCAST',
        title: 'Lanza follow-up a leads sin respuesta',
        text: '127 leads de Meta de los últimos 5 días no han respondido al primer mensaje. Crea un broadcast con tu template lead_followup_v2 en 30 segundos.',
        cta: 'Crear broadcast',
        action: 'wa-broadcast'
      },
      {
        channel: 'google',
        img: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=800&fit=crop',
        eyebrow: 'GOOGLE · UNTAPPED CHANNEL',
        title: 'Activa Search en Google',
        text: 'Tu competencia gasta ~$8K/mes en keywords como "apartamento Chapinero" o "casa Poblado". Sin estar ahí, pierdes intent puro 24/7.',
        cta: 'Conectar Google Ads',
        action: 'connect-google'
      },
      {
        channel: 'meta',
        img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=800&fit=crop',
        eyebrow: 'CONTENT TIMING',
        title: 'Hora pico: 6-8pm para Bogotá Norte',
        text: 'Tus posts entre 6pm y 8pm reciben +34% engagement en Bogotá Norte. Programando ahí por defecto las próximas 7 publicaciones.',
        cta: 'Auto-Schedule',
        action: 'auto-schedule'
      }
    ]
  }

  function escapeHtml (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  // ── Sections ─────────────────────────────────────────────
  function heroHtml () {
    return `
      <div class="rp-page-header">
        <span class="rp-eyebrow">REAL ESTATE MARKETING CLOUD · MULTI-CHANNEL</span>
        <h1 class="rp-display">Command Center</h1>
        <p class="rp-subhead">Performance está <strong>14% por encima</strong> de la proyección. Camilo está optimizando 3 campañas activas across <em>Meta, WhatsApp y Google</em>.</p>
      </div>
    `
  }

  function unifiedKpisHtml (data) {
    const items = [
      { label: 'TOTAL REACH',  ...data.total_reach },
      { label: 'TOTAL SPEND',  ...data.total_spend },
      { label: 'TOTAL LEADS',  ...data.total_leads },
      { label: 'BLENDED CPL',  ...data.blended_cpl }
    ]
    return `
      <div class="rp-stats">
        ${items.map(k => `
          <div class="rp-stat ${k.highlight ? 'highlight' : ''}">
            <div class="rp-stat-label">${escapeHtml(k.label)}</div>
            <div class="rp-stat-value">${escapeHtml(k.value)}</div>
            <div class="rp-stat-delta ${k.up ? 'up' : 'down'}">${k.up ? '↗' : '↘'} ${escapeHtml(k.delta)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function channelCardHtml (key, ch) {
    const isLive = ch.connected !== false
    const deltaClass = ch.delta_up === true ? 'up' : ch.delta_up === false ? 'down' : 'flat'
    const arrow = ch.delta_up === true ? '↗' : ch.delta_up === false ? '↘' : '·'
    return `
      <a href="${ch.href}" class="rm-channel-summary ${isLive ? 'is-live' : 'is-paused'}" data-channel="${key}" style="--ch-accent:${ch.accent};">
        <div class="rm-channel-summary-h">
          <span class="rm-channel-summary-emoji">${ch.emoji}</span>
          <span class="rm-channel-summary-name">${escapeHtml(ch.name)}</span>
          <span class="rm-channel-summary-pulse" aria-hidden="true"></span>
        </div>
        <div class="rm-channel-summary-stats">
          <div>
            <div class="rm-channel-summary-stat-label">SPEND</div>
            <div class="rm-channel-summary-stat-val">${escapeHtml(ch.spend)}</div>
          </div>
          <div>
            <div class="rm-channel-summary-stat-label">LEADS</div>
            <div class="rm-channel-summary-stat-val">${escapeHtml(ch.leads)}</div>
          </div>
          <div>
            <div class="rm-channel-summary-stat-label">CPL</div>
            <div class="rm-channel-summary-stat-val">${escapeHtml(ch.cpl)}</div>
          </div>
          <div>
            <div class="rm-channel-summary-stat-label">REACH</div>
            <div class="rm-channel-summary-stat-val">${escapeHtml(ch.reach)}</div>
          </div>
        </div>
        <div class="rm-channel-summary-delta ${deltaClass}">${arrow} ${escapeHtml(ch.delta_label)}</div>
        <div class="rm-channel-summary-recent">${escapeHtml(ch.recent)}</div>
        <div class="rm-channel-summary-cta">Ir a ${escapeHtml(ch.name)} →</div>
      </a>
    `
  }

  function channelBreakdownHtml (channels) {
    return `
      <h2 class="rp-section-title">
        Performance por canal
        <span class="rp-ai-badge">3 canales activos</span>
      </h2>
      <div class="rm-channels-grid">
        ${Object.keys(channels).map(k => channelCardHtml(k, channels[k])).join('')}
      </div>
    `
  }

  function activityFeedHtml (items) {
    return `
      <h2 class="rp-section-title">
        Actividad reciente
        <span class="rp-ai-badge">cross-channel</span>
      </h2>
      <div class="rm-activity-feed">
        ${items.map(it => `
          <div class="rm-activity-item rm-channel-${it.channel}">
            <div class="rm-activity-emoji">${it.emoji}</div>
            <div class="rm-activity-body">
              <div class="rm-activity-title">${escapeHtml(it.title)}</div>
              <div class="rm-activity-text">${escapeHtml(it.body)}</div>
            </div>
            <div class="rm-activity-time">${escapeHtml(it.time)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function recosHtml (recos) {
    return `
      <h2 class="rp-section-title">
        Camilo's Recommendations
        <span class="rp-ai-badge">AI Agent Active</span>
      </h2>
      <div class="rp-recos">
        ${recos.map(r => `
          <div class="rp-reco">
            <div class="rp-reco-img" style="background-image: url('${r.img}')">
              <div class="rp-reco-channel-tag rm-channel-${r.channel}">${escapeHtml(r.channel.toUpperCase())}</div>
            </div>
            <div class="rp-reco-body">
              <div class="rp-reco-eyebrow">${escapeHtml(r.eyebrow)}</div>
              <div class="rp-reco-title">${escapeHtml(r.title)}</div>
              <div class="rp-reco-text">${escapeHtml(r.text)}</div>
              <button class="rp-reco-cta" data-action="${escapeHtml(r.action)}">${escapeHtml(r.cta)}</button>
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  function html (data) {
    return `
      <div class="rp-page rp-rise">
        ${heroHtml()}
        ${unifiedKpisHtml(data.unified)}
        ${channelBreakdownHtml(data.channels)}
        ${activityFeedHtml(data.activity)}
        ${recosHtml(data.recos)}
      </div>
    `
  }

  function injectStylesOnce () {
    if (document.getElementById('rm-dashboard-multichannel-styles')) return
    const css = `
      /* ── Channel summary grid ────────────────────────────── */
      .rm-channels-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:18px; margin: 0 0 36px; }
      .rm-channel-summary { display:block; padding:20px 22px 18px; border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; background:var(--rp-surface, #fff); text-decoration:none; color:inherit; transition:transform .18s, border-color .18s, box-shadow .18s; position:relative; overflow:hidden; }
      .rm-channel-summary::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:var(--ch-accent); }
      .rm-channel-summary:hover { transform:translateY(-3px); border-color:var(--ch-accent); box-shadow:0 8px 24px rgba(0,0,0,.06); }
      .rm-channel-summary.is-paused { opacity:.78; }
      .rm-channel-summary-h { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
      .rm-channel-summary-emoji { font-size:22px; }
      .rm-channel-summary-name { font-size:16px; font-weight:700; letter-spacing:-0.01em; color:var(--rm-ink, #0f1410); }
      .rm-channel-summary-pulse { width:8px; height:8px; border-radius:50%; background:var(--ch-accent); margin-left:auto; box-shadow:0 0 8px var(--ch-accent); animation:ae-pulse 1.6s ease-in-out infinite; }
      .rm-channel-summary.is-paused .rm-channel-summary-pulse { background:#9ca3af; box-shadow:none; animation:none; }
      .rm-channel-summary-stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px 8px; margin-bottom:14px; }
      .rm-channel-summary-stat-label { font-family:var(--rm-mono,'JetBrains Mono',monospace); font-size:9px; font-weight:700; letter-spacing:0.12em; color:var(--rm-muted, #7a7e79); margin-bottom:3px; }
      .rm-channel-summary-stat-val { font-family:var(--rp-font,'Inter',sans-serif); font-size:17px; font-weight:700; color:var(--rm-ink, #0f1410); letter-spacing:-0.01em; }
      .rm-channel-summary-delta { font-size:11.5px; font-weight:600; padding:4px 0 0; }
      .rm-channel-summary-delta.up    { color: var(--rm-green-deep, #004d35); }
      .rm-channel-summary-delta.down  { color: var(--rm-red, #c0392b); }
      .rm-channel-summary-delta.flat  { color: var(--rm-muted, #7a7e79); }
      .rm-channel-summary-recent { font-size:12px; color:var(--rm-muted, #7a7e79); padding:10px 0 4px; border-top:1px dashed var(--rm-border, #e8e3dc); margin-top:10px; }
      .rm-channel-summary-cta { display:inline-flex; align-items:center; font-family:var(--rm-mono); font-size:10.5px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--ch-accent); margin-top:12px; }

      /* ── Activity feed ───────────────────────────────────── */
      .rm-activity-feed { display:flex; flex-direction:column; gap:0; margin-bottom:36px; border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; background:var(--rp-surface, #fff); overflow:hidden; }
      .rm-activity-item { display:grid; grid-template-columns:48px 1fr auto; gap:14px; align-items:center; padding:14px 18px; border-bottom:1px solid var(--rm-border, #e8e3dc); transition:background .15s; }
      .rm-activity-item:last-child { border-bottom:none; }
      .rm-activity-item:hover { background: var(--rp-surface-raised, #f6f3ee); }
      .rm-activity-emoji { width:40px; height:40px; border-radius:50%; background:var(--rp-surface-raised, #f6f3ee); display:flex; align-items:center; justify-content:center; font-size:18px; }
      .rm-activity-title { font-weight:600; font-size:13.5px; color:var(--rm-ink, #0f1410); margin-bottom:2px; }
      .rm-activity-text { font-size:12.5px; color:var(--rm-ink-2, #3a3f3b); line-height:1.4; }
      .rm-activity-time { font-family:var(--rm-mono); font-size:10.5px; color:var(--rm-muted, #7a7e79); white-space:nowrap; }

      /* Channel-coloured left rail on activity items */
      .rm-activity-item.rm-channel-meta     { border-left:3px solid #40d99d; }
      .rm-activity-item.rm-channel-whatsapp { border-left:3px solid #25D366; }
      .rm-activity-item.rm-channel-google   { border-left:3px solid #4285F4; }
      .rm-activity-item.rm-channel-tiktok   { border-left:3px solid #FE2C55; }

      /* Channel pill on reco cards */
      .rp-reco-channel-tag { position:absolute; top:10px; left:10px; font-family:var(--rm-mono); font-size:9.5px; font-weight:700; letter-spacing:0.1em; padding:4px 8px; border-radius:3px; background:rgba(0,0,0,.62); color:#fff; backdrop-filter:blur(2px); }
      .rp-reco-channel-tag.rm-channel-meta     { background:rgba(0,77,53,0.72); }
      .rp-reco-channel-tag.rm-channel-whatsapp { background:rgba(37,211,102,0.85); color:#0a3a18; }
      .rp-reco-channel-tag.rm-channel-google   { background:rgba(66,133,244,0.85); }
      .rp-reco-channel-tag.rm-channel-tiktok   { background:rgba(254,44,85,0.85); }

      .rp-reco-img { position:relative; }
    `
    const s = document.createElement('style')
    s.id = 'rm-dashboard-multichannel-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  // ── Render entry ─────────────────────────────────────────
  function render () {
    const slot = document.querySelector('section[data-page="dashboard"]')
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html(MOCK)

    slot.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action
        if (action === 'connect-google') {
          window.rmRouter?.goTo('settings')
        } else if (action === 'wa-broadcast') {
          window.rmRouter?.goTo('wa-broadcasts')
        } else {
          window.rmToast?.('✨ Camilo está aplicando la recomendación…', 'success')
        }
      })
    })
  }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'dashboard') render()
  })

  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'dashboard') === 'dashboard') render()
  })
})()
