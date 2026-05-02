/* ─────────────────────────────────────────────────────────────
   Posts History — real published_posts from Supabase.
   Renders into the section[data-page="posts"] slot.

   Replaces the older mock decision-log on hash #posts. The mock
   "Decision Log" still lives at #history (history.js).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const $ = (id) => document.getElementById(id)
  const FILTERS = [
    { id: 'all',       label: 'Todo' },
    { id: 'facebook',  label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' }
  ]
  const STATUS_FILTERS = [
    { id: 'all',       label: 'Todos' },
    { id: 'published', label: 'Publicados' },
    { id: 'failed',    label: 'Fallidos' },
    { id: 'processing',label: 'Procesando' }
  ]

  let state = {
    posts: [],
    loading: false,
    activePlatform: 'all',
    activeStatus: 'all',
    error: null
  }

  function escapeHtml (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
  function escapeAttr (s) { return escapeHtml(s) }

  function fmtRelative (iso) {
    if (!iso) return '—'
    const t = new Date(iso).getTime()
    if (isNaN(t)) return '—'
    const diff = (Date.now() - t) / 1000
    if (diff < 60) return 'hace un momento'
    if (diff < 3600) return `hace ${Math.floor(diff/60)} min`
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`
    if (diff < 86400 * 7) return `hace ${Math.floor(diff/86400)} días`
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  }

  function platformBadge (p) {
    if ((p || '').startsWith('instagram')) {
      const variant = p === 'instagram_reels' ? 'Reels' : (p === 'instagram_stories' ? 'Stories' : '')
      return `<span class="ph-badge ig">📷 IG${variant ? ' · ' + variant : ''}</span>`
    }
    if (p === 'facebook') return `<span class="ph-badge fb">📘 Facebook</span>`
    return `<span class="ph-badge">${escapeHtml(p || '?')}</span>`
  }

  function statusBadge (s) {
    if (s === 'published')  return `<span class="ph-status ok">✓ PUBLISHED</span>`
    if (s === 'failed')     return `<span class="ph-status err">✗ FAILED</span>`
    if (s === 'processing') return `<span class="ph-status pending">⏳ PROCESSING</span>`
    if (s === 'publishing') return `<span class="ph-status pending">⏳ PUBLISHING</span>`
    return `<span class="ph-status">${escapeHtml((s || '?').toUpperCase())}</span>`
  }

  function html () {
    const filtered = state.posts.filter(p => {
      const okPlatform = state.activePlatform === 'all'
        || (state.activePlatform === 'instagram' ? (p.platform || '').startsWith('instagram') : p.platform === state.activePlatform)
      const okStatus = state.activeStatus === 'all' || p.status === state.activeStatus
      return okPlatform && okStatus
    })

    return `
      <div class="rp-page rp-rise">
        <div class="rp-page-header">
          <span class="rp-eyebrow">HISTORIAL · PUBLICACIONES</span>
          <h1 class="rp-display">Lo que has <em>publicado</em></h1>
          <p class="rp-subhead">Cada post enviado a Facebook o Instagram queda <strong>registrado aquí</strong>. Click "Ver" para abrirlo en Meta, o "Republicar" para crear uno nuevo a partir de éste.</p>
        </div>

        <div class="ae-filter-row">
          <span class="ae-eyebrow muted" style="margin:0;">Plataforma</span>
          <div class="ae-filter-pills">
            ${FILTERS.map(f => `<button class="ae-filter-pill ${state.activePlatform === f.id ? 'selected' : ''}" data-platform="${f.id}">${f.label}</button>`).join('')}
          </div>
          <span class="ae-eyebrow muted" style="margin:0 0 0 12px;">Estado</span>
          <div class="ae-filter-pills">
            ${STATUS_FILTERS.map(f => `<button class="ae-filter-pill ${state.activeStatus === f.id ? 'selected' : ''}" data-status="${f.id}">${f.label}</button>`).join('')}
          </div>
          <span class="rm-mono" style="font-size:10px; color:var(--rm-muted); margin-left:auto;">${filtered.length} POSTS</span>
        </div>

        <div class="ph-table">
          <div class="ph-row head">
            <span></span>
            <span>CAPTION</span>
            <span>PLATAFORMA</span>
            <span>ESTADO</span>
            <span>FECHA</span>
            <span>ACCIONES</span>
          </div>
          ${state.loading
            ? `<div class="ph-empty"><span class="qp-spinner"></span> Cargando…</div>`
            : (state.error
              ? `<div class="ph-empty err">✗ ${escapeHtml(state.error)}</div>`
              : (filtered.length === 0
                ? emptyHtml()
                : filtered.map(rowHtml).join('')))}
        </div>
      </div>
    `
  }

  function rowHtml (p) {
    const thumb = p.media_url
      ? (p.media_kind === 'video'
          ? `<div class="ph-thumb video"><span>▶</span></div>`
          : `<div class="ph-thumb" style="background-image:url('${escapeAttr(p.media_url)}');"></div>`)
      : `<div class="ph-thumb empty">·</div>`
    const cap = (p.caption || '').slice(0, 90)
    const truncated = (p.caption || '').length > 90 ? '…' : ''
    const viewLink = p.post_permalink
      ? `<a href="${escapeAttr(p.post_permalink)}" target="_blank" rel="noopener" class="ph-action">Ver →</a>`
      : `<span class="ph-action disabled">Sin link</span>`
    const errorRow = p.status === 'failed' && p.error_message
      ? `<div class="ph-error" title="${escapeAttr(p.error_message)}">⚠ ${escapeHtml(p.error_message.slice(0, 80))}${p.error_message.length > 80 ? '…' : ''}</div>` : ''

    return `
      <div class="ph-row" data-id="${escapeAttr(p.id)}">
        ${thumb}
        <div class="ph-caption">
          <div>${escapeHtml(cap) || '<span style="color:var(--rm-muted);">(sin caption)</span>'}${truncated}</div>
          ${errorRow}
        </div>
        <div>${platformBadge(p.platform)}</div>
        <div>${statusBadge(p.status)}</div>
        <div class="ph-date" title="${escapeAttr(p.published_at || p.created_at)}">${fmtRelative(p.published_at || p.created_at)}</div>
        <div class="ph-actions">
          ${viewLink}
          <button type="button" class="ph-action btn" data-republish="${escapeAttr(p.id)}">Republicar</button>
        </div>
      </div>
    `
  }

  function emptyHtml () {
    return `
      <div class="ph-empty">
        <div style="font-family:var(--rp-font); font-weight:700; font-size:20px; letter-spacing:-0.01em; color:var(--rp-ink); margin-bottom:6px;">Aún no has publicado nada.</div>
        <div style="color:var(--rm-muted); font-size:13px; margin-bottom:14px;">Tu primer post está a un click.</div>
        <a href="#quickpost" class="ae-btn-primary" style="font-size:11px; padding:10px 18px;">IR A QUICK POST →</a>
      </div>
    `
  }

  async function load () {
    state.loading = true; state.error = null
    render()
    const sbToken = localStorage.getItem('sb_token') || ''
    const empresaId = (() => { try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' } })()
    const headers = {}
    if (sbToken) headers.Authorization = 'Bearer ' + sbToken
    else { headers.Authorization = 'Bearer demo_local'; headers['x-empresa-id'] = empresaId }
    try {
      const r = await fetch('/api/posts/list?limit=100', { headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
      state.posts = j.posts || []
    } catch (err) {
      state.error = err.message
      state.posts = []
    } finally {
      state.loading = false
      render()
    }
  }

  function render () {
    const slot = document.querySelector('section[data-page="posts"]')
    if (!slot) return
    slot.innerHTML = html()
    slot.querySelectorAll('[data-platform]').forEach(b => b.addEventListener('click', () => { state.activePlatform = b.dataset.platform; render() }))
    slot.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { state.activeStatus = b.dataset.status; render() }))
    slot.querySelectorAll('[data-republish]').forEach(b => b.addEventListener('click', () => republish(b.dataset.republish)))
  }

  function republish (id) {
    const p = state.posts.find(x => x.id === id)
    if (!p) return
    // Stash in sessionStorage so Quick Post can pre-fill on next mount
    try {
      sessionStorage.setItem('rm_qp_prefill', JSON.stringify({
        caption: p.caption || '', image_url: p.media_kind === 'image' ? p.media_url : '', platform: p.platform || ''
      }))
    } catch (_) {}
    location.hash = '#quickpost'
    window.rmToast?.('Caption e imagen pre-cargados en Quick Post', 'info')
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'posts') load() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'posts') load()
  })

  window.rmPostsHistory = { reload: load }
})()
