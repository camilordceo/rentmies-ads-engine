/* ─────────────────────────────────────────────────────────────
   WhatsApp Templates List
   /dashboard#whatsapp · /dashboard#whatsapp/templates
   Shows the empresa's templates with KPI tiles, category filter,
   search, and a table. On mount, calls /api/whatsapp/templates/sync
   to pull the latest state from Meta Graph.

   Reads only — write actions live in:
     - the editor at #wa-template-new
     - the detail view (future)
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'whatsapp'

  const state = {
    templates: [],
    filter: 'all',           // 'all' | 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    statusFilter: 'all',     // 'all' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT' | 'PAUSED'
    search: '',
    syncing: false,
    lastSyncedAt: null,
    error: null,
    loading: true
  }

  function $ (id) { return document.getElementById(id) }
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')

  // ─── KPI computation ─────────────────────────────────────
  function computeStats (list) {
    const stats = { total: list.length, approved: 0, pending: 0, rejected: 0, draft: 0, paused: 0 }
    for (const t of list) {
      const s = (t.status || '').toUpperCase()
      if (s === 'APPROVED')  stats.approved++
      else if (s === 'PENDING') stats.pending++
      else if (s === 'REJECTED') stats.rejected++
      else if (s === 'DRAFT')    stats.draft++
      else if (s === 'PAUSED' || s === 'DISABLED') stats.paused++
    }
    return stats
  }

  function statusKind (status) {
    const s = (status || '').toUpperCase()
    if (s === 'APPROVED') return 'ok'
    if (s === 'PENDING')  return 'busy'
    if (s === 'REJECTED' || s === 'DISABLED') return 'rejected'
    if (s === 'DRAFT')    return 'off'
    if (s === 'PAUSED')   return 'warn'
    return 'off'
  }

  function statusPillHtml (status) {
    const kind = statusKind(status)
    const label = (status || 'DRAFT').toUpperCase()
    return `<span class="wa-status-pill wa-status-pill--${kind}">${esc(label)}</span>`
  }

  function categoryBadge (category) {
    const c = (category || 'UTILITY').toUpperCase()
    const cls = c === 'MARKETING' ? 'mkt' : c === 'AUTHENTICATION' ? 'auth' : 'util'
    return `<span class="wa-cat-badge wa-cat-${cls}">${esc(c)}</span>`
  }

  function qualityDot (score) {
    if (!score) return '<span class="wa-quality wa-quality--unset" title="No score yet">·</span>'
    const s = score.toUpperCase()
    const cls = s === 'HIGH' ? 'high' : s === 'LOW' ? 'low' : 'med'
    return `<span class="wa-quality wa-quality--${cls}" title="Quality ${esc(s)}">${esc(s)}</span>`
  }

  function timeAgo (iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'hace unos segundos'
    if (diff < 3600) return `hace ${Math.round(diff/60)} min`
    if (diff < 86400) return `hace ${Math.round(diff/3600)}h`
    if (diff < 30*86400) return `hace ${Math.round(diff/86400)}d`
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // ─── Filter logic ────────────────────────────────────────
  function applyFilters (list) {
    const q = state.search.trim().toLowerCase()
    return list.filter(t => {
      if (state.filter !== 'all' && (t.category || '').toUpperCase() !== state.filter) return false
      if (state.statusFilter !== 'all' && (t.status || '').toUpperCase() !== state.statusFilter) return false
      if (q && !(t.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }

  // ─── HTML ────────────────────────────────────────────────
  function html () {
    const stats = computeStats(state.templates)
    const filtered = applyFilters(state.templates)
    const subnav = window.rpSubnav ? window.rpSubnav.html(PAGE_ID) : ''

    const kpis = [
      { label: 'TOTAL TEMPLATES', value: String(stats.total), highlight: false },
      { label: 'APROBADAS',       value: String(stats.approved), delta: stats.approved + ' usables ahora', up: true, highlight: true },
      { label: 'PENDIENTES',      value: String(stats.pending),  delta: stats.pending  ? 'En revisión Meta' : 'sin nada en revisión' },
      { label: 'RECHAZADAS',      value: String(stats.rejected), delta: stats.rejected ? 'Revisar y reenviar' : 'sin rechazos', up: false }
    ]

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header">
          <span class="rp-eyebrow">WHATSAPP BUSINESS · TEMPLATES</span>
          <h1 class="rp-display">Plantillas <em>aprobadas</em></h1>
          <p class="rp-subhead">Las plantillas que Meta apruebe son las únicas que puedes enviar masivamente. Camilo te ayuda a redactarlas para pasar revisión a la primera.</p>
        </div>

        <!-- KPI tiles -->
        <div class="rp-stats wa-templates-kpis" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom: 24px;">
          ${kpis.map(k => window.rmc?.statTile ? window.rmc.statTile(k) : `
            <div class="rmc-stat ${k.highlight ? 'is-highlight' : ''}">
              <div class="rmc-stat-label">${esc(k.label)}</div>
              <div class="rmc-stat-value">${esc(k.value)}</div>
              ${k.delta ? `<div class="rmc-stat-delta ${k.up !== false ? 'up' : 'down'}">${esc(k.delta)}</div>` : ''}
            </div>
          `).join('')}
        </div>

        <!-- Filter row + search + CTAs -->
        <div class="wa-toolbar">
          <div class="wa-chips" role="tablist" aria-label="Categoría">
            ${[
              ['all',            'Todas'],
              ['MARKETING',      'Marketing'],
              ['UTILITY',        'Utility'],
              ['AUTHENTICATION', 'Auth']
            ].map(([k, label]) => `
              <button type="button" class="wa-chip ${state.filter === k ? 'is-active' : ''}" data-cat-filter="${esc(k)}">
                ${esc(label)}
              </button>
            `).join('')}
          </div>

          <div class="wa-search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" placeholder="Buscar por nombre…" value="${esc(state.search)}" id="wa-tpl-search" />
          </div>

          <div class="wa-toolbar-actions">
            <button type="button" class="ae-btn-ghost" id="wa-tpl-sync" ${state.syncing ? 'disabled' : ''}>
              ${state.syncing ? '⟳ Sincronizando…' : '⟳ Sincronizar con Meta'}
            </button>
            <a class="ae-btn-primary" href="#whatsapp/templates/new">+ Nueva plantilla</a>
          </div>
        </div>

        ${state.error ? `
          <div class="ae-help warn" style="margin-bottom: 18px;">
            <strong>✗ ${esc(state.error.message || 'Error sincronizando con Meta')}</strong>
            ${state.error.hint ? `<div style="margin-top:6px; font-size:12px; color:var(--rm-muted);">${esc(state.error.hint)}</div>` : ''}
            <a href="#settings" class="ae-btn-ghost" style="margin-top:10px; display:inline-flex;">Configurar Meta →</a>
          </div>
        ` : ''}

        ${state.lastSyncedAt ? `
          <div class="wa-sync-line">
            <span class="rmc-pill rmc-pill--ok"><span class="rmc-pill-dot"></span><span>Última sincronización ${esc(timeAgo(state.lastSyncedAt))}</span></span>
          </div>
        ` : ''}

        <!-- Templates table -->
        ${state.loading ? `
          <div class="ae-formcard"><div class="rmc-skel">
            <div class="rmc-skel-row"></div>
            <div class="rmc-skel-row"></div>
            <div class="rmc-skel-row"></div>
            <div class="rmc-skel-row"></div>
          </div></div>
        ` : filtered.length === 0 ? `
          ${state.templates.length === 0
            ? emptyAllHtml()
            : emptyFilterHtml()}
        ` : `
          <div class="wa-tpl-table-wrap">
            <table class="wa-tpl-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Idioma</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Actualizada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(t => rowHtml(t)).join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    `
  }

  function rowHtml (t) {
    const updatedTime = t.updated_at || t.approved_at || t.submitted_at || t.created_at
    const broadcastDisabled = (t.status || '').toUpperCase() !== 'APPROVED'
    return `
      <tr class="wa-tpl-row" data-tpl-id="${esc(t.id)}" data-tpl-status="${esc(t.status)}">
        <td>
          <div class="wa-tpl-name">${esc(t.name || '')}</div>
          ${t.notes ? `<div class="wa-tpl-name-note">${esc(t.notes)}</div>` : ''}
        </td>
        <td>${categoryBadge(t.category)}</td>
        <td><span class="wa-lang">${esc((t.language || '').toUpperCase())}</span></td>
        <td>${statusPillHtml(t.status)}</td>
        <td>${qualityDot(t.quality_score)}</td>
        <td><span class="wa-time">${esc(timeAgo(updatedTime))}</span></td>
        <td class="wa-tpl-actions">
          <button type="button" class="ae-btn-ghost" data-act="view" data-tpl-id="${esc(t.id)}">Ver</button>
          ${!broadcastDisabled ? `<a class="ae-btn-authority" href="#whatsapp/broadcasts/new?template=${encodeURIComponent(t.id)}">Broadcast →</a>` : ''}
        </td>
      </tr>
    `
  }

  function emptyAllHtml () {
    return window.rmc?.emptyState ? window.rmc.emptyState({
      icon: '💬',
      eyebrow: 'NINGUNA PLANTILLA TODAVÍA',
      title: 'Crea tu primera plantilla',
      body: 'Las plantillas son la única forma de enviar mensajes masivos en WhatsApp. Te tomamos ~3 min para que armes una de cero, o usas uno de los 6 presets para inmobiliarias.',
      ctaLabel: '+ Nueva plantilla',
      ctaHref: '#whatsapp/templates/new'
    }) : ''
  }

  function emptyFilterHtml () {
    return `
      <div class="ae-formcard" style="text-align:center; padding:36px 20px;">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div style="font-size:14px; font-weight:600; margin-bottom:4px;">Sin resultados</div>
        <div style="font-size:13px; color:var(--rm-muted); margin-bottom:14px;">Prueba quitar el filtro o limpiar la búsqueda</div>
        <button type="button" class="ae-btn-ghost" id="wa-tpl-clear-filters">Limpiar filtros</button>
      </div>
    `
  }

  // ─── Styles ──────────────────────────────────────────────
  function injectStylesOnce () {
    if (document.getElementById('wa-templates-styles')) return
    const css = `
      .wa-toolbar { display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom: 18px; }
      .wa-chips { display:inline-flex; gap:4px; padding:4px; background:var(--rp-surface-raised, #f6f3ee); border-radius:999px; }
      .wa-chip { background:transparent; border:none; padding:8px 16px; border-radius:999px; font-family:'Inter',sans-serif; font-size:12.5px; font-weight:600; color:var(--rm-muted, #7a7e79); cursor:pointer; transition:background .15s, color .15s; }
      .wa-chip:hover { color:var(--rm-ink, #0f1410); }
      .wa-chip.is-active { background:var(--rp-surface, #fff); color:var(--rm-ink, #0f1410); box-shadow:var(--rp-shadow-card, 0 1px 4px rgba(0,0,0,.05)); }

      .wa-search { display:flex; align-items:center; gap:8px; padding:0 12px; background:var(--rp-surface, #fff); border:1px solid var(--rm-border, #e8e3dc); border-radius:6px; min-width:240px; flex:1; max-width:340px; }
      .wa-search svg { color:var(--rm-muted, #7a7e79); flex-shrink:0; }
      .wa-search input { flex:1; border:none; outline:none; background:transparent; padding:9px 0; font-family:'Inter',sans-serif; font-size:13px; color:var(--rm-ink, #0f1410); }
      .wa-search input::placeholder { color:var(--rm-muted, #7a7e79); }

      .wa-toolbar-actions { display:flex; gap:10px; margin-left:auto; }

      .wa-sync-line { margin-bottom:12px; }

      .wa-tpl-table-wrap { background:var(--rp-surface, #fff); border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; overflow:hidden; margin-bottom:24px; }
      .wa-tpl-table { width:100%; border-collapse:collapse; font-family:'Inter',sans-serif; }
      .wa-tpl-table thead th { text-align:left; padding:12px 18px; font-family:var(--rm-mono, 'JetBrains Mono', monospace); font-size:9.5px; font-weight:700; letter-spacing:0.12em; color:var(--rm-muted, #7a7e79); border-bottom:1px solid var(--rm-border, #e8e3dc); background:var(--rp-surface-raised, #f6f3ee); text-transform:uppercase; }
      .wa-tpl-table tbody td { padding:14px 18px; border-bottom:1px solid var(--rm-border, #e8e3dc); font-size:13px; color:var(--rm-ink, #0f1410); vertical-align:middle; }
      .wa-tpl-table tbody tr:last-child td { border-bottom:none; }
      .wa-tpl-table tbody tr:hover { background:var(--rp-surface-raised, #f6f3ee); }
      .wa-tpl-name { font-weight:600; font-family:var(--rm-mono); font-size:12.5px; }
      .wa-tpl-name-note { font-size:11px; color:var(--rm-muted, #7a7e79); margin-top:2px; }
      .wa-lang { font-family:var(--rm-mono, 'JetBrains Mono', monospace); font-size:11px; padding:2px 7px; border-radius:3px; background:var(--rp-surface-raised, #f6f3ee); color:var(--rm-ink-2, #3a3f3b); letter-spacing:0.05em; }
      .wa-time { font-size:12px; color:var(--rm-muted, #7a7e79); }
      .wa-tpl-actions { display:flex; gap:8px; justify-content:flex-end; }
      .wa-tpl-actions .ae-btn-ghost, .wa-tpl-actions .ae-btn-authority { padding:5px 12px; font-size:11.5px; }

      /* Status pill (table-specific, smaller than the .rmc-pill globals) */
      .wa-status-pill { display:inline-flex; align-items:center; padding:3px 9px; border-radius:999px; font-family:var(--rm-mono, 'JetBrains Mono', monospace); font-size:9.5px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; border:1px solid transparent; }
      .wa-status-pill--ok       { background: rgba(64,217,157,0.10); color: var(--rm-green-deep, #004d35); border-color: rgba(64,217,157,0.30); }
      .wa-status-pill--busy     { background: #fef3c7; color: #92400e; border-color: #fcd34d; animation: ae-pulse 1.6s ease-in-out infinite; }
      .wa-status-pill--rejected { background: rgba(192,57,43,0.10); color: var(--rm-red, #c0392b); border-color: rgba(192,57,43,0.30); }
      .wa-status-pill--off      { background: var(--rp-surface-raised, #f6f3ee); color: var(--rm-muted, #7a7e79); border-color: var(--rm-border, #e8e3dc); }
      .wa-status-pill--warn     { background: #fef3c7; color: #92400e; border-color: #fcd34d; }

      /* Category badge */
      .wa-cat-badge { display:inline-flex; align-items:center; padding:3px 8px; border-radius:4px; font-family:var(--rm-mono); font-size:9.5px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; }
      .wa-cat-mkt  { background: rgba(254,44,85,0.10);  color: #c81e3e;  }
      .wa-cat-util { background: rgba(64,217,157,0.10); color: var(--rm-green-deep, #004d35); }
      .wa-cat-auth { background: rgba(66,133,244,0.10); color: #1d4ed8; }

      /* Quality */
      .wa-quality { display:inline-flex; padding:3px 8px; border-radius:3px; font-family:var(--rm-mono); font-size:10px; font-weight:700; letter-spacing:0.08em; }
      .wa-quality--high  { background: rgba(64,217,157,0.10); color: var(--rm-green-deep, #004d35); }
      .wa-quality--med   { background: #fef3c7; color: #92400e; }
      .wa-quality--low   { background: rgba(192,57,43,0.10); color: var(--rm-red, #c0392b); }
      .wa-quality--unset { background: transparent; color: var(--rm-muted, #7a7e79); padding:0; }

      @media (max-width: 768px) {
        .wa-toolbar { flex-direction:column; align-items:stretch; }
        .wa-toolbar-actions { margin-left:0; }
        .wa-tpl-table thead { display:none; }
        .wa-tpl-table tbody td { display:block; padding:8px 18px; border:none; }
        .wa-tpl-table tbody tr { display:block; padding:14px 0; border-bottom:1px solid var(--rm-border, #e8e3dc); }
      }
    `
    const s = document.createElement('style')
    s.id = 'wa-templates-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  // ─── Network ─────────────────────────────────────────────
  async function loadFromDb () {
    state.loading = true
    render()
    try {
      const data = await window.rmApi.get('/api/whatsapp/templates/list?source=db')
      state.templates = data.templates || []
      state.lastSyncedAt = data.last_synced_at || state.lastSyncedAt
    } catch (err) {
      // Non-fatal — sync may still succeed
      console.warn('[wa-templates] db load failed:', err.message)
    } finally {
      state.loading = false
    }
  }

  async function syncFromMeta () {
    if (state.syncing) return
    state.syncing = true
    state.error = null
    render()
    try {
      const data = await window.rmApi.post('/api/whatsapp/templates/sync', {})
      state.templates = data.templates || []
      state.lastSyncedAt = data.synced_at || new Date().toISOString()
      window.rmToast?.(`✓ ${data.synced || 0} plantillas sincronizadas`, 'success')
    } catch (err) {
      state.error = {
        message: err.message || 'Error sincronizando con Meta',
        hint: err.body?.detail || err.body?.hint || 'Verifica que tu WABA ID y token estén configurados.'
      }
    } finally {
      state.syncing = false
      render()
    }
  }

  // ─── Render + wire ───────────────────────────────────────
  function render () {
    const slot = document.querySelector('section[data-page="' + PAGE_ID + '"]')
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  function wire () {
    document.querySelectorAll('[data-cat-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.catFilter
        render()
      })
    })
    $('wa-tpl-search')?.addEventListener('input', e => {
      state.search = e.target.value
      // Debounce-y: re-render directly (small enough list)
      render()
      // Restore focus + cursor
      const input = $('wa-tpl-search')
      if (input) {
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      }
    })
    $('wa-tpl-sync')?.addEventListener('click', () => syncFromMeta())
    $('wa-tpl-clear-filters')?.addEventListener('click', () => {
      state.filter = 'all'
      state.statusFilter = 'all'
      state.search = ''
      render()
    })
    document.querySelectorAll('.wa-tpl-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.wa-tpl-actions')) return
        const id = row.dataset.tplId
        if (id) {
          try { sessionStorage.setItem('wa_template_edit_id', id) } catch (_) {}
          window.rmRouter?.goTo('wa-template-edit')
        }
      })
    })
    document.querySelectorAll('[data-act="view"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const id = btn.dataset.tplId
        if (id) {
          try { sessionStorage.setItem('wa_template_edit_id', id) } catch (_) {}
          window.rmRouter?.goTo('wa-template-edit')
        }
      })
    })
  }

  async function mount () {
    state.loading = true
    state.error = null
    render()
    await loadFromDb()
    render()
    // Then refresh from Meta in the background — don't block initial render
    syncFromMeta()
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if (window.rmRouter?.currentPage() === PAGE_ID) mount()
  })
})()
