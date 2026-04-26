/* ─────────────────────────────────────────────────────────────
   Launch wizard — 3 steps: Channels → Budget → Review.
   Mounted lazily on first openLaunchWizard() call.
   Persistence to Supabase happens in step 20 (this file owns the
   wizard UX; the Confirm button hands off to a separate persist fn).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  let mounted = false
  let currentStep = 1
  let local = {
    channels: [],
    daily_budget: 50000,        // COP per day default
    total_budget: 350000,
    schedule: 'now',            // now | tomorrow | custom
    custom_date: '',
    duration_days: 7
  }

  const CHANNELS = [
    { id: 'instagram',          name: 'Instagram Feed',    color: '#E1306C', meta: 'Foto + caption' },
    { id: 'instagram_stories',  name: 'Instagram Stories', color: '#FD1D1D', meta: 'Vertical 9:16' },
    { id: 'tiktok',             name: 'TikTok Creative',   color: '#69C9D0', meta: 'Video corto' },
    { id: 'facebook_page',      name: 'Facebook Marketplace', color: '#1877F2', meta: 'Listing + caption' },
    { id: 'whatsapp',           name: 'WhatsApp Status',   color: '#25D366', meta: 'Estado 24h' }
  ]

  const SCHEDULE_OPTIONS = [
    { id: 'now',       label: 'Ahora' },
    { id: 'tomorrow',  label: 'Mañana 9am' },
    { id: 'custom',    label: 'Personalizado' }
  ]

  const DURATIONS = [7, 14, 30]

  function ensureDOM() {
    if (document.querySelector('.ae-launch')) return
    const overlay = document.createElement('div')
    overlay.className = 'ae-launch-overlay'
    overlay.addEventListener('click', closeWizard)
    document.body.appendChild(overlay)

    const panel = document.createElement('aside')
    panel.className = 'ae-launch'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Lanzar campaña')
    document.body.appendChild(panel)
  }

  function open() {
    ensureDOM()
    // Hydrate channels from store on open so user's earlier picks pre-select.
    const fromStore = window.rmStore.get().channels || []
    if (fromStore.length) local.channels = [...fromStore]
    currentStep = 1
    render()
    document.querySelector('.ae-launch-overlay').classList.add('open')
    requestAnimationFrame(() => document.querySelector('.ae-launch').classList.add('open'))
    document.body.style.overflow = 'hidden'
  }

  function closeWizard() {
    const panel = document.querySelector('.ae-launch')
    const overlay = document.querySelector('.ae-launch-overlay')
    if (panel) panel.classList.remove('open')
    if (overlay) overlay.classList.remove('open')
    document.body.style.overflow = ''
  }

  function render() {
    const panel = document.querySelector('.ae-launch')
    if (!panel) return
    const titleByStep = {
      1: '<em>Choose</em> your channels',
      2: 'Define <em>budget</em> & schedule',
      3: '<em>Review</em> & confirm'
    }
    panel.innerHTML = `
      <div class="ae-launch-head">
        <div class="ae-launch-head-row">
          <span class="ae-launch-eyebrow">Paso ${currentStep} de 3</span>
          <button class="ae-launch-close" aria-label="Cerrar"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <h2 class="ae-launch-title">${titleByStep[currentStep]}</h2>
        <div class="ae-launch-steps">
          ${[1,2,3].map(n => `<div class="ae-launch-step-dot ${n === currentStep ? 'active' : (n < currentStep ? 'complete' : '')}"></div>`).join('')}
        </div>
      </div>
      <div class="ae-launch-body">${bodyForStep()}</div>
      <div class="ae-launch-footer">
        ${currentStep > 1 ? '<button class="ae-btn-ghost" data-back>Volver</button>' : '<span></span>'}
        ${currentStep < 3
          ? '<button class="ae-btn-primary" data-next>Continuar →</button>'
          : '<button class="ae-btn-authority" data-confirm>⚡ Confirmar y Lanzar</button>'}
      </div>
    `
    wireCommon(panel)
  }

  function bodyForStep() {
    if (currentStep === 1) return bodyChannels()
    if (currentStep === 2) return bodyBudget()
    return bodyReview()
  }

  function bodyChannels() {
    return `
      <p style="font-size:13px; color:var(--rm-ink-2); margin:0 0 8px; line-height:1.5;">Elige los canales donde Camilord va a publicar la campaña. Puedes seleccionar varios.</p>
      <div class="ae-launch-channels">
        ${CHANNELS.map(c => `
          <button type="button" class="ae-launch-channel ${local.channels.includes(c.id) ? 'selected' : ''}" data-channel="${c.id}">
            <span class="ae-launch-channel-dot" style="background:${c.color}"></span>
            <span>${c.name}</span>
            <span class="ae-launch-channel-meta">${c.meta}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  function bodyBudget() {
    return `
      <div class="ae-field">
        <label class="ae-field-label">Presupuesto diario (COP)</label>
        <input class="ae-input" type="number" id="lw-daily" value="${local.daily_budget}" min="10000" step="5000">
      </div>
      <div class="ae-field">
        <label class="ae-field-label">Duración</label>
        <div class="ae-schedule-row">
          ${DURATIONS.map(d => `<button type="button" class="ae-schedule-pill ${local.duration_days === d ? 'selected' : ''}" data-duration="${d}">${d} días</button>`).join('')}
        </div>
      </div>
      <div class="ae-field">
        <label class="ae-field-label">Cuándo arranca</label>
        <div class="ae-schedule-row">
          ${SCHEDULE_OPTIONS.map(o => `<button type="button" class="ae-schedule-pill ${local.schedule === o.id ? 'selected' : ''}" data-schedule="${o.id}">${o.label}</button>`).join('')}
        </div>
      </div>
      ${local.schedule === 'custom' ? `
        <div class="ae-field">
          <label class="ae-field-label">Fecha y hora exacta</label>
          <input class="ae-input" type="datetime-local" id="lw-custom" value="${local.custom_date}">
        </div>
      ` : ''}
    `
  }

  function bodyReview() {
    const total = local.daily_budget * local.duration_days
    local.total_budget = total
    const reach = Math.round(total / 38)  // rough COP-to-impressions estimate
    const reachStr = reach >= 1000 ? `${(reach / 1000).toFixed(1)}k personas` : `${reach} personas`
    const channelNames = local.channels.map(id => CHANNELS.find(c => c.id === id)?.name).filter(Boolean).join(' · ')
    const scheduleLabel = SCHEDULE_OPTIONS.find(s => s.id === local.schedule)?.label
    return `
      <div class="ae-launch-summary">
        <div class="ae-launch-summary-row">
          <span class="ae-launch-summary-label">Canales</span>
          <span class="ae-launch-summary-value" style="text-align:right;">${escapeHtml(channelNames || '— ninguno —')}</span>
        </div>
        <div class="ae-launch-summary-row">
          <span class="ae-launch-summary-label">Cuándo</span>
          <span class="ae-launch-summary-value">${escapeHtml(scheduleLabel)}${local.schedule === 'custom' && local.custom_date ? ' · ' + new Date(local.custom_date).toLocaleString('es-CO') : ''}</span>
        </div>
        <div class="ae-launch-summary-row">
          <span class="ae-launch-summary-label">Duración</span>
          <span class="ae-launch-summary-value">${local.duration_days} días</span>
        </div>
        <div class="ae-launch-summary-row">
          <span class="ae-launch-summary-label">Presupuesto total</span>
          <span class="ae-launch-summary-value big">$${total.toLocaleString('es-CO')} COP</span>
        </div>
        <div class="ae-launch-summary-row">
          <span class="ae-launch-summary-label">Alcance estimado</span>
          <span class="ae-launch-summary-value">${reachStr}</span>
        </div>
      </div>
      <div style="font-size:11px; color:var(--rm-muted); line-height:1.5;">
        Al confirmar, Camilord guarda la campaña como borrador y empieza a generar los creativos en tu inventario. Podrás revisarlos antes de que se publiquen.
      </div>
    `
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) }

  function wireCommon(panel) {
    panel.querySelector('.ae-launch-close').addEventListener('click', closeWizard)

    panel.querySelectorAll('[data-channel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.channel
        local.channels = local.channels.includes(id) ? local.channels.filter(c => c !== id) : [...local.channels, id]
        render()
      })
    })

    panel.querySelectorAll('[data-duration]').forEach(btn => {
      btn.addEventListener('click', () => {
        local.duration_days = parseInt(btn.dataset.duration, 10)
        render()
      })
    })

    panel.querySelectorAll('[data-schedule]').forEach(btn => {
      btn.addEventListener('click', () => {
        local.schedule = btn.dataset.schedule
        render()
      })
    })

    const dailyEl = panel.querySelector('#lw-daily')
    if (dailyEl) dailyEl.addEventListener('input', () => {
      const v = parseInt(dailyEl.value, 10) || 0
      local.daily_budget = v
    })

    const customEl = panel.querySelector('#lw-custom')
    if (customEl) customEl.addEventListener('input', () => { local.custom_date = customEl.value })

    const next = panel.querySelector('[data-next]')
    if (next) next.addEventListener('click', () => {
      if (currentStep === 1 && local.channels.length === 0) {
        // Quick toast — toast.js arrives in step 20; for now alert as fallback
        if (window.rmToast) window.rmToast('Selecciona al menos un canal', 'error')
        else alert('Selecciona al menos un canal')
        return
      }
      currentStep++
      render()
    })

    const back = panel.querySelector('[data-back]')
    if (back) back.addEventListener('click', () => { currentStep--; render() })

    const confirm = panel.querySelector('[data-confirm]')
    if (confirm) confirm.addEventListener('click', () => {
      // Sync channels back to the store before persistence.
      window.rmStore.set({ channels: [...local.channels] })
      // Persistence + redirect lives in step 20.
      if (window.rmPersistCampaign) {
        window.rmPersistCampaign({ ...local, ...window.rmStore.get() })
          .then(() => closeWizard())
          .catch(err => {
            if (window.rmToast) window.rmToast('Error: ' + err.message, 'error')
            else alert('Error: ' + err.message)
          })
      } else {
        // Fallback if persistence module isn't loaded
        if (window.rmToast) window.rmToast('Campaña preparada (persistencia pendiente)', 'success')
        closeWizard()
      }
    })
  }

  // Public API
  window.openLaunchWizard = open
  window.closeLaunchWizard = closeWizard

  // Wire the topnav button (already present in index.html)
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.ae-launch-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault()
        open()
      })
    })
    // ESC closes
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.querySelector('.ae-launch.open')) closeWizard()
    })
  })
})()
