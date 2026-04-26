/* ─────────────────────────────────────────────────────────────
   Property Context form — description + price + location.
   Writes to rmStore on every input. Debouncing happens at the store
   layer (300ms persist), but the UI updates instantly on subscribe.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  let mounted = false

  function html(state) {
    const filledCount = [
      (state.description || '').trim().length >= 40,
      (state.price || '').trim().length > 0,
      (state.location || '').trim().length > 0
    ].filter(Boolean).length
    const allFilled = filledCount === 3

    return `
      <div class="ae-formcard">
        <div class="ae-formcard-h">
          <span>Contexto del Inmueble</span>
          <span class="ae-check-icon${allFilled ? '' : ' is-empty'}">${allFilled ? '✓' : '○'}</span>
        </div>

        <div class="ae-field">
          <label class="ae-field-label" for="f-description">Descripción Detallada</label>
          <textarea id="f-description" class="ae-textarea" placeholder="Describe el inmueble: arquitectura, vista, materiales, vibe — todo lo que vendes en el copy.">${escapeHtml(state.description || '')}</textarea>
          <div class="ae-field-hint">Mínimo 40 caracteres para que la IA tenga contexto suficiente.</div>
        </div>

        <div class="ae-grid-2" style="margin-top:14px;">
          <div class="ae-field">
            <label class="ae-field-label" for="f-price">Precio</label>
            <input id="f-price" class="ae-input" type="text" value="${escapeAttr(state.price || '')}" placeholder="€ 1.200.000 / arriendo $4.5M COP">
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="f-location">Ubicación</label>
            <input id="f-location" class="ae-input" type="text" value="${escapeAttr(state.location || '')}" placeholder="Marbella, Bogotá, Medellín…">
          </div>
        </div>
      </div>
    `
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }
  function escapeAttr(s) { return escapeHtml(s) }

  function wire(slot) {
    const desc = slot.querySelector('#f-description')
    const price = slot.querySelector('#f-price')
    const loc = slot.querySelector('#f-location')

    desc.addEventListener('input', () => window.rmStore.set({ description: desc.value }))
    price.addEventListener('input', () => window.rmStore.set({ price: price.value }))
    loc.addEventListener('input', () => window.rmStore.set({ location: loc.value }))
  }

  function mount() {
    const slot = document.querySelector('[data-slot="property-form"]')
    if (!slot) return

    // Render once with hydrated state, then preserve focus + selection on re-renders
    // so the user can keep typing while other components react.
    window.rmStore.subscribe(state => {
      if (!mounted) {
        slot.innerHTML = html(state)
        wire(slot)
        mounted = true
      } else {
        // Don't re-render the form — reactive components are the energy meter,
        // recommendation card, and Camilord. The form owns its own DOM.
        // Update only the check icon.
        const check = slot.querySelector('.ae-check-icon')
        if (check) {
          const filled = [
            (state.description || '').trim().length >= 40,
            (state.price || '').trim().length > 0,
            (state.location || '').trim().length > 0
          ].filter(Boolean).length
          const ok = filled === 3
          check.textContent = ok ? '✓' : '○'
          check.classList.toggle('is-empty', !ok)
        }
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
