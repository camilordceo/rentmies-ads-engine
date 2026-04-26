/* ─────────────────────────────────────────────────────────────
   Energy meter — SKILL §6
   4 segments. Filled bars use gradient energy-3 → energy-4.
   Score recomputes from rmStore on every state change.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const labels = ['BÁSICO', 'OPTIMIZADO', 'ALTA CONVERSIÓN', 'POTENCIA MÁXIMA']

  // Map % → number of filled bars (out of 4)
  function thresholdsToFilled(pct) {
    if (pct >= 90) return 4
    if (pct >= 65) return 3
    if (pct >= 35) return 2
    if (pct >= 15) return 1
    return 0
  }

  function render(slot, state) {
    const score = window.rmStore.computeEnergy(state)
    const filled = thresholdsToFilled(score)
    slot.innerHTML = `
      <div class="ae-energy ae-formcard">
        <div class="ae-eyebrow">ESTADO DE ENERGÍA</div>
        <div class="ae-energy-row">
          <div class="ae-energy-title">Potencia del Anuncio</div>
          <div class="ae-energy-score">${score}<span>%</span></div>
        </div>
        <div class="ae-energy-bars">
          ${[0,1,2,3].map(i => `<div class="ae-energy-bar${i < filled ? ' is-on' : ''}"></div>`).join('')}
        </div>
        <div class="ae-energy-labels">
          ${labels.map((l, i) => `<span${i === filled - 1 ? ' class="active"' : ''}>${l}</span>`).join('')}
        </div>
      </div>
    `
  }

  function mount() {
    const slot = document.querySelector('[data-slot="energy"]')
    if (!slot) return
    window.rmStore.subscribe(state => render(slot, state))
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
