/* ─────────────────────────────────────────────────────────────
   Psychological Angles — 2x2 grid. Activates / deactivates per
   click; auto-unlocks CONFORT when description + 3 photos exist.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const ANGLES = [
    {
      key: 'ESTATUS',
      name: 'ESTATUS',
      desc: 'Para quienes buscan exclusividad mediterránea — ubicación, materiales, distinción.',
      // Always available
      lockReason: () => null
    },
    {
      key: 'CONFORT',
      name: 'CONFORT',
      desc: 'El día a día se siente bien. Espacios cálidos, luz natural, materiales que abrazan.',
      lockReason: s => {
        const photoCount = s.photos.filter(p => !p.isPlaceholder).length
        const descLen = (s.description || '').trim().length
        if (photoCount < 3) return `Faltan ${3 - photoCount} foto(s) de interiores`
        if (descLen < 40) return 'Falta descripción detallada'
        return null
      }
    },
    {
      key: 'INVERSION',
      name: 'INVERSIÓN',
      desc: 'ROI 8.4% anual en alquiler vacacional. El número antes que la emoción.',
      lockReason: s => (s.price || '').trim() ? null : 'Falta precio'
    },
    {
      key: 'REFUGIO',
      name: 'REFUGIO',
      desc: 'Tu santuario privado al filo del mar. El descanso como acto de cuidado propio.',
      lockReason: () => null
    }
  ]

  function activeCount(state) {
    return Object.values(state.angles || {}).filter(Boolean).length
  }

  function html(state) {
    const cards = ANGLES.map(a => {
      const lockReason = a.lockReason(state)
      const isLocked = !!lockReason
      const isActive = !!state.angles?.[a.key] && !isLocked
      const statusLabel = isLocked ? 'Bloqueado' : (isActive ? 'Activo' : 'Inactivo')

      return `
        <button
          type="button"
          class="ae-angle${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}"
          data-angle="${a.key}"
          ${isLocked ? `title="${lockReason}"` : ''}
          ${isLocked ? 'disabled' : ''}
        >
          <div class="ae-angle-head">
            <span class="ae-angle-name">${a.name}</span>
            <span class="ae-angle-status">${statusLabel}</span>
          </div>
          <p class="ae-angle-desc">${isLocked ? `<em style="font-family:var(--rm-serif);">${lockReason}</em> · ${a.desc}` : a.desc}</p>
        </button>
      `
    }).join('')

    return `
      <div class="ae-formcard">
        <div class="ae-formcard-h">
          <span>Ángulos Psicológicos</span>
          <span class="ae-ai-badge">${activeCount(state)} ACTIVOS</span>
        </div>
        <div class="ae-angle-grid">${cards}</div>
      </div>
    `
  }

  function wire(slot) {
    slot.querySelectorAll('[data-angle]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        const key = btn.dataset.angle
        const angles = { ...window.rmStore.get().angles }
        angles[key] = !angles[key]
        window.rmStore.set({ angles })
      })
    })
  }

  function mount() {
    const slot = document.querySelector('[data-slot="angles"]')
    if (!slot) return
    window.rmStore.subscribe(state => {
      // Auto-unlock CONFORT — if user has met the prerequisites and CONFORT is
      // still false, we don't flip it on (user choice), but we ensure it can
      // be clicked. If user has insufficient data, force it off so the badge
      // count reflects reality.
      const confortCard = ANGLES.find(a => a.key === 'CONFORT')
      const reasonNow = confortCard.lockReason(state)
      if (reasonNow && state.angles?.CONFORT) {
        // demote: prereqs lost
        window.rmStore.setIn('angles.CONFORT', false)
        return  // re-emit will re-render
      }
      slot.innerHTML = html(state)
      wire(slot)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
