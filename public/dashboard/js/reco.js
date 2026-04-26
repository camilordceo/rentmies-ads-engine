/* ─────────────────────────────────────────────────────────────
   AI Recommendation — picks the highest-impact next action based
   on what's currently missing from the form.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // Ordered by priority — first matching rule wins.
  const RECOS = [
    {
      test: s => s.photos.filter(p => !p.isPlaceholder).length < 3,
      eyebrow: 'RECOMENDACIÓN AI',
      body: 'Añade 3 fotos de interiores para desbloquear el ángulo <em>"Confort"</em>.',
      cta: 'Subir fotos',
      action: 'focus-photos'
    },
    {
      test: s => !(s.location || '').trim(),
      eyebrow: 'RECOMENDACIÓN AI',
      body: 'Especifica el barrio para refinar el targeting geográfico y subir el match local.',
      cta: 'Añadir ubicación',
      action: 'focus-location'
    },
    {
      test: s => (s.description || '').trim().length < 40,
      eyebrow: 'RECOMENDACIÓN AI',
      body: 'Describe el inmueble con más detalle. Camilord usa cada frase para escribir headlines más afilados.',
      cta: 'Editar descripción',
      action: 'focus-description'
    },
    {
      test: s => Object.values(s.angles).filter(Boolean).length < 3,
      eyebrow: 'RECOMENDACIÓN AI',
      body: 'Activa más ángulos psicológicos para multiplicar las variaciones que vamos a probar en Meta.',
      cta: 'Ver ángulos',
      action: 'focus-angles'
    },
    {
      test: s => (s.channels || []).length < 2,
      eyebrow: 'RECOMENDACIÓN AI',
      body: 'Distribuye en al menos dos canales. Combinar IG Feed + Stories duplica el alcance medido.',
      cta: 'Elegir canales',
      action: 'open-launch'
    },
    {
      // Default: everything looks good — nudge to launch
      test: () => true,
      eyebrow: 'CAMILORD RECOMIENDA',
      body: 'La campaña tiene <em>potencia máxima</em>. Es momento de lanzar y dejar que la IA optimice en vivo.',
      cta: 'Lanzar campaña',
      action: 'open-launch'
    }
  ]

  function pickReco(state) {
    return RECOS.find(r => r.test(state))
  }

  function render(slot, state) {
    const reco = pickReco(state)
    slot.innerHTML = `
      <div class="ae-reco">
        <div>
          <div class="ae-reco-eyebrow">${reco.eyebrow}</div>
          <p class="ae-reco-body">${reco.body}</p>
        </div>
        <button class="ae-reco-cta" data-action="${reco.action}">
          ${reco.cta}
          <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="2.2" fill="none">
            <polyline points="9 18 15 12 9 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `
    // Wire CTA action — focus the relevant form field or open the launch wizard.
    const btn = slot.querySelector('.ae-reco-cta')
    btn.addEventListener('click', () => handleAction(btn.dataset.action))
  }

  function handleAction(action) {
    if (action === 'focus-description') {
      document.getElementById('f-description')?.focus()
    } else if (action === 'focus-location') {
      document.getElementById('f-location')?.focus()
    } else if (action === 'focus-photos') {
      document.querySelector('[data-slot="photos"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (action === 'focus-angles') {
      document.querySelector('[data-slot="angles"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (action === 'open-launch') {
      // Hooked up in step 19
      window.openLaunchWizard?.()
    }
  }

  function mount() {
    const slot = document.querySelector('[data-slot="reco"]')
    if (!slot) return
    window.rmStore.subscribe(state => render(slot, state))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
