/* ─────────────────────────────────────────────────────────────
   Camilord brain — contextual quote + suggestion swap based on
   form state. Cross-fades the quote text on changes (200ms) so
   the panel feels alive, not jumpy.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // ── Quote pickers in priority order ────────────────────────

  function pickQuote(state) {
    const desc = (state.description || '').trim()
    const photoCount = state.photos.filter(p => !p.isPlaceholder).length
    const energy = window.rmStore.computeEnergy(state)
    const activeAngles = Object.values(state.angles || {}).filter(Boolean).length

    if (energy >= 90) {
      return `Tienes potencia <em>${energy}%</em>. Listo para lanzar a Meta Feed e Instagram Stories.`
    }
    if (energy >= 65 && activeAngles >= 2) {
      return `Tres ángulos activos y la potencia ya está en ${energy}%. Una foto más de interiores y desbloqueamos <em>Confort</em>.`
    }
    if (state.location && desc.length >= 40 && photoCount >= 1) {
      return `He analizado el mercado local en <em>${escapeHtml(state.location)}</em>. Para esta zona, los anuncios con el ángulo de <em>"Estatus"</em> rinden un 40% mejor.`
    }
    if (desc.length >= 40) {
      return 'Buena descripción. Sube fotos de interiores para que pueda mapear el ambiente y elegir el ángulo correcto.'
    }
    if (state.location || state.price) {
      return 'Tengo precio y ubicación. Cuéntame cómo es la propiedad — qué se siente al entrar, qué la hace distinta.'
    }
    return 'Cuéntame sobre la propiedad y armo la campaña completa — copy, imagen, ángulos, plataformas.'
  }

  // ── Suggestion picker ──────────────────────────────────────

  const ALL_SUGGESTIONS = [
    {
      key: 'photos-low',
      label: 'Subir más fotos del interior',
      kind: 'action',
      test: s => s.photos.filter(p => !p.isPlaceholder).length < 3,
      run: () => document.querySelector('[data-slot="photos"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    {
      key: 'desc-short',
      label: 'Ampliar la descripción',
      kind: 'action',
      test: s => (s.description || '').trim().length < 40,
      run: () => document.getElementById('f-description')?.focus()
    },
    {
      key: 'no-location',
      label: 'Añadir ubicación / barrio',
      kind: 'action',
      test: s => !(s.location || '').trim(),
      run: () => document.getElementById('f-location')?.focus()
    },
    {
      key: 'no-stories',
      label: 'Optimizar para Instagram Stories',
      kind: 'opportunity',
      test: s => !(s.channels || []).includes('instagram_stories'),
      run: () => window.openLaunchWizard?.()
    },
    {
      key: 'add-keywords',
      label: 'Añadir keywords de competencia',
      kind: 'opportunity',
      test: s => (s.description || '').trim().length < 100,
      run: () => document.getElementById('f-description')?.focus()
    },
    {
      key: 'analyze-palette',
      label: 'Analizar paleta de colores',
      kind: 'opportunity',
      test: s => s.photos.filter(p => !p.isPlaceholder).length === 0,
      run: () => alert('Análisis de paleta — disponible en FASE 3')
    },
    {
      key: 'carousel',
      label: 'Generar carrusel multi-foto',
      kind: 'urgent',
      test: s => s.photos.filter(p => !p.isPlaceholder).length >= 4,
      run: () => alert('Carrusel multi-foto — disponible en FASE 3')
    },
    {
      key: 'launch',
      label: 'Lanzar campaña ahora',
      kind: 'urgent',
      test: s => window.rmStore.computeEnergy(s) >= 80,
      run: () => window.openLaunchWizard?.()
    }
  ]

  function pickSuggestions(state, max = 3) {
    return ALL_SUGGESTIONS.filter(s => s.test(state)).slice(0, max)
  }

  // ── DOM patching ───────────────────────────────────────────

  function setQuote(panel, html) {
    const card = panel.querySelector('.rp-cam-intro, .ae-cam-quote')
    if (!card) return
    const p = card.querySelector('p')
    if (!p) return
    if (p.dataset.current === html) return
    p.dataset.current = html
    p.style.transition = 'opacity 0.2s ease'
    p.style.opacity = '0'
    setTimeout(() => {
      p.innerHTML = html
      p.style.opacity = '1'
    }, 180)
  }

  function setSuggestions(panel, suggestions) {
    const slot = panel.querySelector('.rp-feed, .ae-cam-suggestions')
    if (!slot) return
    if (suggestions.length === 0) {
      slot.innerHTML = `
        <div class="rp-feed-item">
          <div class="rp-feed-title">Todo en orden</div>
          <div class="rp-feed-body">Listo para lanzar cuando quieras.</div>
          <div class="rp-feed-time">Just now</div>
        </div>
      `
      return
    }
    slot.innerHTML = suggestions.map(s => `
      <button class="rp-feed-item" data-key="${s.key}" type="button">
        <div class="rp-feed-title">${escapeHtml(s.label)}</div>
        <div class="rp-feed-body">Sugerencia automática</div>
        <div class="rp-feed-time">Just now</div>
      </button>
    `).join('')
    slot.querySelectorAll('[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const found = ALL_SUGGESTIONS.find(s => s.key === btn.dataset.key)
        if (found) try { found.run() } catch (e) { console.warn('[camilord]', e) }
      })
    })
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])
  }

  // ── Mount + subscribe ─────────────────────────────────────

  function mount() {
    const panel = document.querySelector('.rp-panel, .ae-camilord')
    if (!panel) return

    // Update status sub-line based on whether we're idle or actively analyzing
    const status = panel.querySelector('.ae-cam-status')

    let lastPersistTime = Date.now()
    window.rmStore.subscribe(state => {
      lastPersistTime = Date.now()
      if (status) status.textContent = 'Analizando contexto…'
      setQuote(panel, pickQuote(state))
      setSuggestions(panel, pickSuggestions(state))
      // Reset to idle after the activity window
      setTimeout(() => {
        if (Date.now() - lastPersistTime >= 800 && status) {
          status.textContent = 'Listo para asistir'
        }
      }, 900)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
