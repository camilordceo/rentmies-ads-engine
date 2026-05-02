/* ─────────────────────────────────────────────────────────────
   Inmuebles — grid view of all properties.
   Source: rmInmuebles (api/data → fallback to inmuebles-inicio).
   Each card has 'Publicar' button → routes to Quick Post with
   that inmueble pre-selected.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const { cardHtml, escapeHtml, escapeAttr } = (window.rmInmuebles || {})

  let state = {
    items: [],
    source: '',
    filterCity: '',
    filterTipo: '',
    query: ''
  }

  function html() {
    const cities = Array.from(new Set(state.items.map(p => p.ciudad).filter(Boolean))).sort()
    const tipos  = Array.from(new Set(state.items.map(p => p.tipo).filter(Boolean))).sort()

    const filtered = state.items.filter(p => {
      if (state.filterCity && p.ciudad !== state.filterCity) return false
      if (state.filterTipo && p.tipo !== state.filterTipo) return false
      if (state.query) {
        const q = state.query.toLowerCase()
        const blob = (p.proyecto + ' ' + p.descripcion + ' ' + p.ciudad + ' ' + p.id).toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })

    const sourceBadge = state.source === 'starter'
      ? '<span class="ae-ai-badge" style="background:rgba(210,152,54,0.14); color:var(--rm-amber);">Inmuebles de muestra</span>'
      : state.source === 'imported'
        ? `<span class="ae-ai-badge" style="background:rgba(0,77,53,0.14); color:var(--rm-green-deep);">${state.items.length} inmuebles importados</span>`
        : state.source === 'imported+api'
          ? `<span class="ae-ai-badge">${state.items.length} inmuebles (importados + API)</span>`
          : state.source === 'api'
            ? `<span class="ae-ai-badge">${state.items.length} inmuebles</span>`
            : '<span class="ae-status pending">Sin inventario</span>'

    const importedCount = (window.rmInmuebles?.loadImported() || []).length

    return `
      <div class="rp-page rp-rise">

        <div class="rp-page-header">
          <span class="rp-eyebrow">CATÁLOGO · INMUEBLES & PROYECTOS</span>
          <h1 class="rp-display">Tu <em>inventario</em></h1>
          <p class="rp-subhead">${state.source === 'starter'
            ? 'Estás viendo los inmuebles de muestra (Primavera, Castelo, Praseo, Strada). <strong>Importa tu CSV/Excel</strong> para usar tu catálogo real.'
            : 'Tu inventario sincronizado. Click en cualquier inmueble para <strong>publicarlo</strong> en Instagram o Facebook.'}</p>
        </div>

        <section class="ae-formcard compact">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="flex:1; min-width:200px;">
              <input id="inm-search" class="ae-input" type="search" placeholder="Buscar por proyecto, ciudad, descripción…" value="${escapeAttr(state.query)}" />
            </div>
            <select id="inm-city" class="ae-select" style="width:auto; min-width:140px;">
              <option value="">Todas las ciudades</option>
              ${cities.map(c => `<option value="${escapeAttr(c)}" ${c === state.filterCity ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <select id="inm-tipo" class="ae-select" style="width:auto; min-width:140px;">
              <option value="">Todos los tipos</option>
              ${tipos.map(t => `<option value="${escapeAttr(t)}" ${t === state.filterTipo ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
            </select>
            <button class="ae-btn-authority" id="inm-import-btn" type="button" style="font-size:11px; padding:8px 12px;">📂 Importar CSV/Excel</button>
            ${importedCount > 0 ? `<button class="ae-btn-ghost" id="inm-clear-imported" type="button" style="font-size:11px; padding:8px 12px;" title="Borrar inmuebles importados localmente">🗑 Limpiar (${importedCount})</button>` : ''}
            <span style="margin-left:auto;">${sourceBadge}</span>
          </div>
        </section>

        ${filtered.length === 0
          ? emptyHtml()
          : `<section class="ae-prop-grid" id="inm-grid">${filtered.map(p => cardHtmlWithCta(p)).join('')}</section>`
        }

        ${state.source === 'starter' ? starterHelpHtml() : ''}

      </div>
    `
  }

  function cardHtmlWithCta(p) {
    return `
      <div style="position:relative;">
        ${cardHtml(p)}
        <div style="display:flex; gap:6px; padding:0 14px 14px;">
          <button type="button" class="ae-btn-primary" style="flex:1; font-size:11px; padding:7px 10px;" data-publish="${escapeAttr(p.id)}">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Publicar
          </button>
          <button type="button" class="ae-btn-ghost" style="font-size:11px; padding:7px 10px;" data-schedule="${escapeAttr(p.id)}">
            Programar
          </button>
        </div>
      </div>
    `
  }

  function emptyHtml() {
    return `
      <div class="ae-empty">
        <span class="ae-eyebrow">SIN RESULTADOS</span>
        <h2 class="ae-display" style="font-size:28px;">No hay inmuebles que coincidan</h2>
        <p class="ae-subhead" style="margin: 0 auto;">Limpia los filtros o cambia la búsqueda.</p>
        <button class="ae-btn-ghost" id="inm-clear">Limpiar filtros</button>
      </div>
    `
  }

  function starterHelpHtml() {
    return `
      <div class="ae-help info" style="margin-top:8px;">
        <strong>Próximamente — importar tu catálogo real:</strong> CSV upload, sincronización con sistemas de inventario, ICX. Por ahora puedes editar
        <code class="rm-mono">data/inmuebles.json</code> en el repo o agregar inmuebles vía Supabase.
      </div>
    `
  }

  // ── Wiring ────────────────────────────────────────────────

  function wire() {
    document.getElementById('inm-search')?.addEventListener('input', e => { state.query = e.target.value.trim(); render() })
    document.getElementById('inm-city')?.addEventListener('change', e => { state.filterCity = e.target.value; render() })
    document.getElementById('inm-tipo')?.addEventListener('change', e => { state.filterTipo = e.target.value; render() })
    document.getElementById('inm-clear')?.addEventListener('click', () => { state.query = ''; state.filterCity = ''; state.filterTipo = ''; render() })

    document.querySelectorAll('[data-publish]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.publish
        sessionStorage.setItem('rm_quickpost_preselect', id)
        window.rmRouter?.goTo('quickpost')
      })
    })
    document.querySelectorAll('[data-schedule]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.schedule
        sessionStorage.setItem('rm_schedule_preselect', id)
        window.rmRouter?.goTo('schedule')
      })
    })

    document.getElementById('inm-import-btn')?.addEventListener('click', () => {
      if (!window.rmCsvImport) { window.rmToast?.('Módulo de import no cargado', 'error'); return }
      window.rmCsvImport.open()
    })
    document.getElementById('inm-clear-imported')?.addEventListener('click', () => {
      const cnt = (window.rmInmuebles?.loadImported() || []).length
      if (!confirm(`¿Borrar ${cnt} inmuebles importados localmente? (No afecta los datos en Supabase ni el archivo original.)`)) return
      window.rmInmuebles?.clearImported()
      window.rmToast?.('Inmuebles importados eliminados', 'info')
      mount()
    })
  }

  function render() {
    const slot = document.querySelector('section[data-page="inmuebles"]')
    if (!slot) return
    slot.innerHTML = html()
    wire()
  }

  async function mount() {
    const slot = document.querySelector('section[data-page="inmuebles"]')
    if (!slot) return
    slot.innerHTML = '<div class="ae-page-shell"><div style="padding:48px; text-align:center; color:var(--rm-muted);">Cargando inventario…</div></div>'
    if (window.rmInmuebles) {
      const { items, source } = await window.rmInmuebles.load()
      state.items = items
      state.source = source
    }
    render()
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'inmuebles') mount() })
  document.addEventListener('rm-inmuebles-changed', () => {
    if (window.rmRouter?.currentPage() === 'inmuebles') mount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'inmuebles') mount()
  })
})()
