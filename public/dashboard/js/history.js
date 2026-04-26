/* ─────────────────────────────────────────────────────────────
   History / Decision Log — SKILL §17
   Mock data first; FASE 3 wiring (step 29) replaces with real
   Supabase ad_ai_logs query when the table exists.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PERIODS = [
    { id: '7d',  label: '7 días' },
    { id: '30d', label: '30 días' },
    { id: 'all', label: 'Todo' }
  ]
  const ACTIONS = [
    { id: 'all',   label: 'Todo' },
    { id: 'GEN',   label: 'Generated' },
    { id: 'PUB',   label: 'Published' },
    { id: 'OPT',   label: 'Optimized' },
    { id: 'PAUSE', label: 'Paused' }
  ]

  const MOCK_LOGS = [
    { ts: '00:42', action: 'GEN',   target: 'Generated <em>"Villa Victoria — Estatus"</em>', metric: 'CTR pred: 3.2%', status: 'ready', why: 'Camilord generó esta variante porque el ángulo Estatus históricamente rinde 40% mejor en Marbella. La predicción se basa en el dataset interno de 184k impresiones de inmuebles similares.', metrics: 'CTR pred 3.2% · CPL pred €18 · Tono italiano-mediterráneo' },
    { ts: '00:43', action: 'PUB',   target: 'Published to Meta Feed → <em>ad_8472</em>', metric: 'Live · 0 impr', status: 'live', why: 'Publicación automática activada porque el creativo cruzó el umbral de calidad (CTR pred ≥3%, no errores de moderación). Programación: 18:30 hora local.', metrics: 'Plataforma Meta Feed · Budget €50/día · 7 días' },
    { ts: '00:44', action: 'OPT',   target: 'Scaled budget +50% — <em>ad_8423</em> top performer', metric: 'CTR 4.7%', status: 'done', why: 'El ad_8423 venía rindiendo CTR 4.7% (sobre el promedio de 2.4%) durante 6 horas consecutivas. Camilord aumentó el daily budget de €40 → €60 para capturar más demanda.', metrics: 'Antes €40/día · Después €60/día · ΔCTR sin cambio significativo' },
    { ts: '00:45', action: 'PAUSE', target: 'Paused <em>"Pain Point"</em> — Marbella',          metric: 'CTR 0.4%',  status: 'paused', why: 'El ángulo Pain Point ("estás cansado del centro?") cayó a CTR 0.4%, muy debajo del umbral mínimo de 1.0%. Camilord pausó preventivamente y recomienda probar Estatus o Refugio.', metrics: 'CTR 0.4% · CPL €78 · 312 impr · 1 click · 0 leads' },
    { ts: '00:51', action: 'GEN',   target: 'Generated 3 carousel slides for <em>Castelo</em>',  metric: '3 variants', status: 'ready', why: 'Detecté 4 fotos de calidad alta. Generé 3 carruseles: tour del apto, vista al cerro, y zonas comunes — para A/B testear cuál engancha más.', metrics: 'Slides 3 · Variants 3 · Tono editorial' },
    { ts: '00:58', action: 'OPT',   target: 'Reasignó €120 de TikTok → Meta Feed',              metric: 'CPL Δ -42%', status: 'done', why: 'CPL en Meta Feed (€18) es 42% más bajo que TikTok (€31). Reasigné el budget marginal para optimizar el lead flow.', metrics: 'Meta CPL €18 · TikTok CPL €31 · Δ -42%' },
    { ts: '01:02', action: 'PUB',   target: 'Published Stories — <em>Villa Primavera</em>',     metric: 'Live · 8 impr', status: 'live', why: 'Stories empieza a las 19:00 hora pico. El video vertical fue generado a partir de 5 fotos del inmueble.', metrics: 'IG Stories · Duración 15s · Format 9:16' },
    { ts: '01:14', action: 'GEN',   target: 'Headline rewrite for <em>ad_8472</em>',            metric: '+18% pred',  status: 'ready', why: 'El primer headline ("Tu hogar te espera") tenía baja predicción de CTR. Reescribí con foco en escasez ("Última disponibilidad esta semana") — predicción +18%.', metrics: 'Anterior CTR pred 2.4% · Nueva 2.83%' },
    { ts: '01:22', action: 'PAUSE', target: 'Paused horario inactivo (2-5am)',                  metric: 'Auto-pause',  status: 'paused', why: 'Cero clicks de 2-5am consistentes en 14 días. Pausé esa franja para no quemar budget.', metrics: 'Window 02:00-05:00 · Days affected 14 · Δsavings €4.2/día' },
    { ts: '01:35', action: 'OPT',   target: 'Activé bid auto-optimizer en Meta',                metric: 'CTR target 3%', status: 'done', why: 'El manual bidding estaba debajo de su potencial. Activé Meta Auto-Bid con target CPM optimizado para lead-gen.', metrics: 'Modo Auto · Target CTR 3% · Ventana 7 días' },
    { ts: '01:48', action: 'PUB',   target: 'Published WhatsApp Status — <em>Praseo</em>',      metric: 'Live · 2 impr', status: 'live', why: 'WhatsApp Status para 24h. Es el primer envío al broadcast list segmentado por interés "casa familia".', metrics: 'Audiencia 380 contactos · Format vertical · Duración 24h' }
  ]

  let activePeriod = '7d'
  let activeAction = 'all'
  let logs = MOCK_LOGS

  // ── Render ─────────────────────────────────────────────────

  function render() {
    const slot = document.querySelector('[data-page="history"]')
    if (!slot) return
    const filtered = logs.filter(l => activeAction === 'all' || l.action === activeAction)
    slot.innerHTML = `
      <div class="ae-history ae-rise">
        <header>
          <span class="ae-eyebrow">HISTORIAL DE DECISIONES</span>
          <h1 class="ae-display">Lo que <em>Camilord</em> ha hecho</h1>
          <p class="ae-subhead">Cada acción tomada por la IA queda registrada. Auditable. Reversible. Click en cualquier fila para ver el detalle y revertir si es necesario.</p>
        </header>

        <div class="ae-filter-row">
          <span class="ae-eyebrow muted" style="margin:0;">Periodo</span>
          <div class="ae-filter-pills">
            ${PERIODS.map(p => `<button class="ae-filter-pill ${activePeriod === p.id ? 'selected' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
          </div>
          <span class="ae-eyebrow muted" style="margin:0 0 0 12px;">Acción</span>
          <div class="ae-filter-pills">
            ${ACTIONS.map(a => `<button class="ae-filter-pill ${activeAction === a.id ? 'selected' : ''}" data-action="${a.id}">${a.label}</button>`).join('')}
          </div>
          <span class="rm-mono" style="font-size:10px; color:var(--rm-muted); margin-left:auto;">${filtered.length} ENTRIES</span>
        </div>

        <div class="ae-log">
          <div class="ae-log-row head">
            <span>TIME</span><span>ACTION</span><span>TARGET</span><span>METRIC</span><span>STATUS</span>
          </div>
          ${filtered.map(rowHtml).join('')}
          ${filtered.length === 0 ? `<div class="ae-log-row" style="grid-template-columns:1fr; padding:24px; justify-content:center; color:var(--rm-muted); cursor:default;">Sin resultados para este filtro</div>` : ''}
        </div>

        <div id="history-feed-slot"></div>
      </div>
    `

    // Wire filters + row clicks
    slot.querySelectorAll('[data-period]').forEach(el => el.addEventListener('click', () => { activePeriod = el.dataset.period; render() }))
    slot.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => { activeAction = el.dataset.action; render() }))
    slot.querySelectorAll('[data-row-idx]').forEach(el => el.addEventListener('click', () => openDrawer(parseInt(el.dataset.rowIdx, 10), filtered)))

    // Re-mount the live feed after every history render (filter changes wipe the slot)
    setTimeout(() => window.rmFeedRemount?.(), 0)
  }

  function rowHtml(log, idx) {
    return `
      <div class="ae-log-row" data-row-idx="${idx}" tabindex="0" role="button" aria-label="Ver detalle de ${log.action}">
        <span class="ae-log-time">${log.ts}</span>
        <span><span class="ae-log-tag ${log.action.toLowerCase()}">[${log.action}]</span></span>
        <span class="ae-log-target">${log.target}</span>
        <span class="ae-log-metric">${log.metric}</span>
        <span><span class="ae-status ${log.status}">${log.status.toUpperCase()}</span></span>
      </div>
    `
  }

  // ── Drawer ─────────────────────────────────────────────────

  function ensureDrawer() {
    if (document.querySelector('.ae-drawer')) return
    const overlay = document.createElement('div')
    overlay.className = 'ae-drawer-overlay'
    overlay.addEventListener('click', closeDrawer)
    document.body.appendChild(overlay)
    const panel = document.createElement('aside')
    panel.className = 'ae-drawer'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Detalle de decisión')
    document.body.appendChild(panel)
  }

  function openDrawer(idx, list) {
    const log = list[idx]
    if (!log) return
    ensureDrawer()
    const panel = document.querySelector('.ae-drawer')
    panel.innerHTML = `
      <div class="ae-drawer-head">
        <div>
          <div class="ae-drawer-eyebrow">${log.ts} · <span class="ae-log-tag ${log.action.toLowerCase()}">[${log.action}]</span></div>
          <h2 class="ae-drawer-title">${log.target.replace(/<\/?em>/g, '')}</h2>
        </div>
        <button class="ae-drawer-close" aria-label="Cerrar"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="ae-drawer-body">
        <div class="ae-drawer-section">
          <div class="ae-drawer-label">Por qué Camilord lo hizo</div>
          <div class="ae-drawer-value">${log.why}</div>
        </div>
        <div class="ae-drawer-section">
          <div class="ae-drawer-label">Métricas gatillo</div>
          <div class="ae-drawer-value rm-mono" style="font-size:12px;">${log.metrics}</div>
        </div>
        <div class="ae-drawer-section">
          <div class="ae-drawer-label">Estado actual</div>
          <div class="ae-drawer-value"><span class="ae-status ${log.status}">${log.status.toUpperCase()}</span></div>
        </div>
      </div>
      <div class="ae-drawer-foot">
        <button class="ae-btn-ghost" data-close>Cerrar</button>
        <button class="ae-btn-authority" data-revert>↺ Revertir esta acción</button>
      </div>
    `
    panel.querySelector('.ae-drawer-close').addEventListener('click', closeDrawer)
    panel.querySelector('[data-close]').addEventListener('click', closeDrawer)
    panel.querySelector('[data-revert]').addEventListener('click', () => {
      window.rmToast?.(`Acción revertida — ${log.action} en ${log.ts}`, 'success')
      closeDrawer()
    })
    document.querySelector('.ae-drawer-overlay').classList.add('open')
    requestAnimationFrame(() => panel.classList.add('open'))
  }

  function closeDrawer() {
    const panel = document.querySelector('.ae-drawer')
    const overlay = document.querySelector('.ae-drawer-overlay')
    if (panel) panel.classList.remove('open')
    if (overlay) overlay.classList.remove('open')
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.querySelector('.ae-drawer.open')) closeDrawer()
  })

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'history') render() })
  document.addEventListener('DOMContentLoaded', render)
})()
