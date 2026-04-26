/* ─────────────────────────────────────────────────────────────
   Empty / Loading / Thinking helpers — exposed as window.rmStates
   so any page can opt in. Pages call rmStates.empty(slot, opts) or
   rmStates.skeleton(slot, opts) before they have data.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function emptyHtml(opts) {
    return `
      <div class="ae-empty">
        ${opts.eyebrow ? `<span class="ae-eyebrow">${escape(opts.eyebrow)}</span>` : ''}
        ${opts.title ? `<h2 class="ae-display">${opts.title}</h2>` : ''}
        ${opts.subhead ? `<p class="ae-subhead" style="margin: 0 auto;">${escape(opts.subhead)}</p>` : ''}
        ${opts.cta ? `<button class="ae-btn-primary" data-empty-action>${opts.cta.label}</button>` : ''}
      </div>
    `
  }

  function empty(slot, opts) {
    if (typeof slot === 'string') slot = document.querySelector(slot)
    if (!slot) return
    slot.innerHTML = emptyHtml(opts)
    if (opts.cta && opts.cta.run) {
      slot.querySelector('[data-empty-action]')?.addEventListener('click', opts.cta.run)
    }
  }

  function skeleton(slot, count) {
    if (typeof slot === 'string') slot = document.querySelector(slot)
    if (!slot) return
    count = count || 3
    slot.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${Array.from({ length: count }, () => `
          <div class="ae-skeleton-card">
            <div class="ae-skeleton bar-lg" style="width:60%"></div>
            <div class="ae-skeleton bar"></div>
            <div class="ae-skeleton bar-sm" style="width:40%"></div>
          </div>
        `).join('')}
      </div>
    `
  }

  function thinking(target, label) {
    if (typeof target === 'string') target = document.querySelector(target)
    if (!target) return
    target.innerHTML = `${escape(label || 'Camilord está pensando')} <span class="ae-thinking-dots"><span></span><span></span><span></span></span>`
  }

  function escape(s) {
    return String(s == null ? '' : s).replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'})[c])
  }

  // Empty-state presets for the standard pages, so a single call
  // gives the right copy without each module duplicating it.
  const PRESETS = {
    'dashboard-empty': () => empty('[data-page="dashboard"]', {
      eyebrow: 'PRIMERA VEZ AQUÍ',
      title: 'Aún no hay <em style="font-family:var(--rm-serif);">contenido programado</em>',
      subhead: 'Empieza creando tu primera campaña en Creative Studio. Camilord se encarga del resto.',
      cta: { label: '⚡ CREAR CAMPAÑA', run: () => window.rmRouter?.goTo('studio') }
    }),
    'history-empty': () => empty('[data-page="history"]', {
      eyebrow: 'HISTORIAL VACÍO',
      title: 'Camilord aún <em style="font-family:var(--rm-serif);">no ha tomado decisiones</em>',
      subhead: 'Cuando tengas campañas activas, cada acción de la IA aparecerá aquí. Auditable y reversible.',
      cta: { label: 'IR AL DASHBOARD', run: () => window.rmRouter?.goTo('dashboard') }
    }),
    'analytics-empty': () => empty('[data-page="analytics"]', {
      eyebrow: 'SIN DATOS SUFICIENTES',
      title: 'Lanza una campaña y vuelve <em style="font-family:var(--rm-serif);">en 24 horas</em>',
      subhead: 'Analytics necesita al menos 1k impresiones para mostrar números útiles.',
      cta: { label: 'CREAR CAMPAÑA', run: () => window.rmRouter?.goTo('studio') }
    })
  }

  window.rmStates = { empty, skeleton, thinking, presets: PRESETS }
})()
