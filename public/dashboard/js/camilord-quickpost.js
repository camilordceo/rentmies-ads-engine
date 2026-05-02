/* ─────────────────────────────────────────────────────────────
   Camilord — contextual coaching for the Quick Post page.

   Subscribes to state pushed by page-quickpost.js
   (window.rmCamilordQuickpost.update(ctx)). Each state mutation
   swaps the italic serif quote in the Camilord panel + refreshes
   the small suggestions list below.

   Only runs when the user is on #quickpost. Other pages keep
   their static quotes from camilord-modes.js.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function panel () { return document.querySelector('.rp-panel, .ae-camilord') }
  function isOnQuickpost () { return (window.rmRouter?.currentPage() || '') === 'quickpost' }

  const SUGGESTIONS_BASE = [
    'Las fotos con luz natural reciben +40% engagement',
    'El mejor horario para inmobiliarias en Colombia es 6-8pm',
    'Añade hashtags de ubicación (ej: #ChapineroBogota)',
    'Mantén el caption bajo 125 caracteres para preview de IG'
  ]

  function quoteFor (ctx) {
    if (!ctx) return 'Sube una foto de tu mejor inmueble. Yo me encargo del caption.'
    if (ctx.lastResults && ctx.lastResults.length) {
      const ok = ctx.lastResults.filter(r => r.ok).length
      const total = ctx.lastResults.length
      if (ok === total && ok > 0) {
        const where = ctx.lastResults.map(r => r.platform === 'instagram' ? 'Instagram' : 'Facebook').join(' y ')
        return `Publicado en ${where}. Revisa las métricas mañana — los primeros 90 minutos cuentan más.`
      }
      if (ok > 0) return `Salió en ${ok} de ${total}. Lo que falló suele ser permisos del System User. Revisa los errores abajo.`
      return 'Algo no anduvo. La causa más común: el System User no tiene la página asignada con permiso "Manage". Mira el detalle del error.'
    }
    if (!ctx.hasMedia) return 'Sube una foto de tu mejor inmueble. Yo me encargo del caption.'
    if (!ctx.hasCaption) return 'Buena foto. ¿Quieres que escriba el caption? Click en ✨ Generar con Camilord y lo armo en español colombiano.'
    if (!ctx.platforms || ctx.platforms.length === 0) return 'Solo te falta elegir dónde publicar. Selecciona Facebook, Instagram, o ambos.'
    const n = ctx.platforms.length
    return `Listo para publicar en ${n} ${n === 1 ? 'canal' : 'canales'}. Dale al botón verde y lo mando.`
  }

  function suggestionsFor (ctx) {
    if (!ctx || !ctx.lastResults) return SUGGESTIONS_BASE.slice(0, 3)
    // After a publish, surface the most actionable suggestion based on errors
    const failures = (ctx.lastResults || []).filter(r => !r.ok)
    if (failures.length) {
      return failures.map(f => f.suggestion || ('Revisa el error en ' + (f.platform === 'instagram' ? 'Instagram' : 'Facebook'))).slice(0, 3)
    }
    return ['Republica este post desde Historial cuando quieras', 'Programa una campaña en Campañas →', 'Sube otra foto y publica de nuevo']
  }

  function update (ctx) {
    if (!isOnQuickpost()) return
    const root = panel()
    if (!root) return
    const quoteEl = root.querySelector('.rp-cam-intro p, .ae-cam-quote p')
    if (quoteEl) {
      quoteEl.innerHTML = quoteFor(ctx)
    }
    const feedBox = root.querySelector('.rp-feed, .ae-cam-suggestions')
    if (feedBox) {
      const items = suggestionsFor(ctx)
      feedBox.innerHTML = items.map(s => `
        <div class="rp-feed-item">
          <div class="rp-feed-title">Tip de Camilo</div>
          <div class="rp-feed-body">${s}</div>
          <div class="rp-feed-time">Just now</div>
        </div>
      `).join('')
    }
  }

  // Re-run whenever the page changes back to quickpost (camilord-modes.js
  // resets the panel template, then we layer dynamic content on top).
  document.addEventListener('rm-page-change', e => {
    if (e.detail.page !== 'quickpost') return
    setTimeout(() => update(window.rmCamilordQuickpost?.last || null), 30)
  })

  let last = null
  window.rmCamilordQuickpost = {
    update (ctx) { last = ctx; this.last = ctx; update(ctx) },
    get last () { return last }
  }
})()
