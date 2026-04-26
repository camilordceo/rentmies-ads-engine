/* ─────────────────────────────────────────────────────────────
   Phone preview — composes a live preview from store state.
   Headline + caption update with every keystroke (debounced via
   the store's pub/sub, which fires synchronously).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  // Headline templates per active angle. The first uploaded photo (or first
  // placeholder) drives the visual gradient class.

  const HEADLINES = {
    ESTATUS:   s => `${s.propertyName || 'Esta propiedad'}: el estatus tiene una <em>nueva dirección</em>.`,
    CONFORT:   s => `${s.propertyName || 'Esta propiedad'}: el día a día se siente <em>distinto</em>.`,
    INVERSION: s => `${s.propertyName || 'Esta propiedad'}: el número antes que la emoción.`,
    REFUGIO:   s => `${s.propertyName || 'Esta propiedad'}: tu refugio privado al filo del mar.`
  }

  // Pick the FIRST active (and unlocked) angle for the live preview.
  function pickAngle(state) {
    const order = ['ESTATUS', 'CONFORT', 'INVERSION', 'REFUGIO']
    for (const a of order) if (state.angles?.[a]) return a
    return 'ESTATUS'
  }

  function buildHeadline(state) {
    const angle = pickAngle(state)
    const fn = HEADLINES[angle] || HEADLINES.ESTATUS
    return fn(state)
  }

  function buildCaption(state) {
    const desc = (state.description || '').trim()
    if (!desc) return 'Cuéntale a Camilord cómo es la propiedad y aquí verás cómo se traduce en copy.'
    const trimmed = desc.length > 220 ? desc.slice(0, 220).replace(/\s+\S*$/, '') + '…' : desc
    return `"${trimmed}"`
  }

  function pickHeroPhoto(state) {
    const real = state.photos.find(p => !p.isPlaceholder && p.url)
    return real ? real.url : null
  }

  function html(state) {
    const angle = pickAngle(state)
    const headline = buildHeadline(state)
    const caption = buildCaption(state)
    const hero = pickHeroPhoto(state)
    const tagLabel = state.angles?.CONFORT ? 'NUEVA EXCLUSIVA' :
                     (state.angles?.INVERSION ? 'OPORTUNIDAD' : 'NUEVA EXCLUSIVA')

    return `
      <div class="ae-live-strip">
        <span class="ae-live-dot"></span>
        <span class="rm-mono">VISTA PREVIA AI · REAL-TIME</span>
      </div>

      <div class="ae-phone">
        <div class="ae-phone-meta">
          <div class="ae-phone-avatar">R</div>
          <div class="ae-phone-meta-text">
            <div class="ae-phone-name">Rentmies Premium</div>
            <div class="ae-phone-label">Publicidad</div>
          </div>
          <div class="ae-phone-dots">···</div>
        </div>

        <div class="ae-phone-img angle-${angle}">
          ${hero ? `<div class="ae-phone-img-real" style="background-image:url('${cssUrl(hero)}')"></div>` : ''}
          <div class="ae-phone-overlay">
            <span class="ae-phone-tag">${tagLabel}</span>
            <h3 class="ae-phone-headline">${headline}</h3>
          </div>
        </div>

        <div class="ae-phone-cap">${escapeHtml(caption)}</div>

        <button class="ae-phone-cta">MÁS INFORMACIÓN</button>
      </div>
    `
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])
  }
  function cssUrl(s) { return String(s).replace(/'/g, "\\'") }

  function mount() {
    const slot = document.querySelector('[data-slot="phone"]')
    if (!slot) return
    window.rmStore.subscribe(state => {
      slot.innerHTML = html(state)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
