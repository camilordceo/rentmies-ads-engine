/* ─────────────────────────────────────────────────────────────
   Inmuebles source — single canonical loader.
   1. Try /api/data?resource=inmuebles
   2. Fall back to /data/inmuebles-inicio.json (5 starter properties)
   Returns a normalized shape: { id, proyecto, tipo, ciudad,
   descripcion, imagen, isStarter }.
   Cached after first load to avoid refetching across pages.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  let cache = null
  let inflight = null

  function normalize(item, isStarter) {
    return {
      id: item.id || '',
      proyecto: item.proyecto || item.nombre_barrio || '',
      tipo: item.tipo || item.tipo_inmueble_propiedad || '',
      ciudad: item.ciudad || item.nombre_ciudad || '',
      descripcion: item.descripcion || '',
      imagen: item.imagen || item.image_link_1 || '',
      isStarter: !!isStarter
    }
  }

  async function load(forceReload) {
    if (cache && !forceReload) return cache
    if (inflight) return inflight

    inflight = (async () => {
      const empresaId = (function () {
        try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' }
      })()

      // 1. Try real inventory endpoint
      try {
        const r = await fetch('/api/data?resource=inmuebles', {
          headers: { 'x-empresa-id': empresaId }
        })
        if (r.ok) {
          const json = await r.json()
          const raw = json.inmuebles || json.data || []
          if (Array.isArray(raw) && raw.length > 0) {
            const items = raw.map(p => normalize(p, false))
            cache = { items, source: 'api', empresaId }
            return cache
          }
        }
      } catch (_) {}

      // 2. Fall back to starter inmuebles
      try {
        const r2 = await fetch('/data/inmuebles-inicio.json')
        if (r2.ok) {
          const raw = await r2.json()
          const items = (Array.isArray(raw) ? raw : []).map(p => normalize(p, true))
          cache = { items, source: 'starter', empresaId }
          return cache
        }
      } catch (_) {}

      cache = { items: [], source: 'empty', empresaId }
      return cache
    })()

    try {
      return await inflight
    } finally {
      inflight = null
    }
  }

  function findById(id, items) {
    return (items || []).find(p => p.id === id)
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }
  function escapeAttr(s) { return escapeHtml(s) }

  // ── Renderer for a property card (used by Inmuebles + selector strip) ──
  function cardHtml(p, opts) {
    opts = opts || {}
    const tag = p.isStarter ? 'MUESTRA' : (p.tipo || '').toUpperCase()
    const bg = p.imagen
      ? `style="background-image: url('${escapeAttr(p.imagen)}')"`
      : ''
    const titleParts = [p.proyecto, p.tipo, p.ciudad].filter(Boolean)
    const title = titleParts.length ? titleParts.join(' · ') : (p.id || 'Inmueble')
    const desc = p.descripcion ? `<div class="ae-prop-desc">${escapeHtml(p.descripcion)}</div>` : ''
    const sel = opts.selectedId && opts.selectedId === p.id ? ' selected' : ''
    return `
      <button type="button" class="ae-prop-card${sel}" data-inmueble-id="${escapeAttr(p.id)}">
        <div class="ae-prop-image" ${bg}>
          ${!p.imagen ? '<div class="ae-prop-image-fallback">🏠</div>' : ''}
          ${tag ? `<span class="ae-prop-image-tag">${escapeHtml(tag)}</span>` : ''}
        </div>
        <div class="ae-prop-body">
          <div class="ae-prop-title">${escapeHtml(p.proyecto || 'Inmueble')}</div>
          <div class="ae-prop-meta">${escapeHtml(titleParts.slice(1).join(' · ') || p.id)}</div>
          ${desc}
        </div>
      </button>
    `
  }

  window.rmInmuebles = { load, findById, cardHtml, escapeHtml, escapeAttr }
})()
