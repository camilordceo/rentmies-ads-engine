/* ─────────────────────────────────────────────────────────────
   Reusable Video Library Picker

   Used by Quick Post + Campaign Builder to pick a video from the
   library without re-uploading.

   API:
     window.rmVideoLibrary.open(opts, callback)
       opts:
         platform:    'ig_reels' | 'ig_feed' | 'fb_feed' | 'fb_reels' | null
         title?:      'Elige un video'   (modal title)
         showCompatHint: true            (label why videos are filtered)
       callback(video|null)
         video = { id, source_url, title, duration_sec, width, height, ... }

     window.rmVideoLibrary.close()
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')

  const state = {
    open: false,
    videos: [],
    loading: false,
    selectedId: null,
    opts: null,
    callback: null,
    search: ''
  }

  function fmtDuration (sec) {
    if (!sec) return '—'
    const s = Math.round(Number(sec))
    return s < 60 ? `0:${String(s).padStart(2, '0')}` : `${Math.floor(s/60)}:${String(s%60).padStart(2, '0')}`
  }

  function platformLabel (p) {
    return ({ ig_reels: 'IG Reels', ig_feed: 'IG Feed', ig_stories: 'IG Stories', fb_feed: 'FB Feed', fb_reels: 'FB Reels' })[p] || p
  }

  function html () {
    const opts = state.opts || {}
    const title = opts.title || 'Elige un video de tu librería'
    const platform = opts.platform || 'all'
    const filtered = applyFilter(state.videos)

    return `
      <div class="vlp-overlay" data-act="cancel"></div>
      <div class="vlp-panel">
        <header class="vlp-h">
          <div>
            <div class="rp-eyebrow">VIDEO LIBRARY</div>
            <h2 class="vlp-title">${esc(title)}</h2>
            ${platform !== 'all' && opts.showCompatHint !== false ? `
              <div class="vlp-hint">Mostrando solo videos compatibles con <strong>${esc(platformLabel(platform))}</strong>.</div>
            ` : ''}
          </div>
          <button class="vlp-close" data-act="cancel" aria-label="Cerrar">×</button>
        </header>

        <div class="vlp-toolbar">
          <div class="wa-search" style="flex:1; max-width: 340px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="vlp-search" placeholder="Buscar título o tag…" value="${esc(state.search)}">
          </div>
          ${opts.allowUpload === false ? '' : `
            <a href="#meta/videos" class="ae-btn-ghost" data-act="cancel" style="text-decoration:none;">+ Subir nuevo</a>
          `}
        </div>

        <div class="vlp-body">
          ${state.loading ? `
            <div class="rmc-skel" style="padding: 24px;">
              <div class="rmc-skel-row"></div>
              <div class="rmc-skel-row"></div>
              <div class="rmc-skel-row"></div>
            </div>
          ` : filtered.length === 0 ? `
            <div class="vlp-empty">
              <div class="vlp-empty-icon">🎬</div>
              <div class="vlp-empty-title">${state.videos.length === 0 ? 'Tu librería está vacía' : 'Ningún video compatible'}</div>
              <div class="vlp-empty-body">
                ${state.videos.length === 0
                  ? 'Sube videos a tu librería para reusarlos en Quick Post y Campañas.'
                  : `Para ${esc(platformLabel(platform))} necesitas un video compatible. Sube uno o cambia el placement.`}
              </div>
              <a href="#meta/videos" class="ae-btn-primary" data-act="cancel" style="text-decoration:none; margin-top:14px;">Ir a la librería →</a>
            </div>
          ` : `
            <div class="vlp-grid">
              ${filtered.map(v => cardHtml(v)).join('')}
            </div>
          `}
        </div>

        <footer class="vlp-foot">
          <button class="ae-btn-ghost" data-act="cancel">Cancelar</button>
          <button class="ae-btn-primary" data-act="confirm" ${state.selectedId ? '' : 'disabled'}>
            Usar este video
          </button>
        </footer>
      </div>
    `
  }

  function cardHtml (v) {
    const isSelected = state.selectedId === v.id
    const orientation = v.orientation === 'vertical' ? '↕' : v.orientation === 'square' ? '◻' : '↔'
    return `
      <button type="button" class="vlp-card ${isSelected ? 'is-selected' : ''}" data-act="select" data-video-id="${esc(v.id)}">
        <div class="vlp-card-thumb">
          ${v.thumbnail_url
            ? `<img src="${escAttr(v.thumbnail_url)}" alt="" loading="lazy">`
            : `<video src="${escAttr(v.source_url)}#t=0.5" preload="metadata" muted playsinline></video>`}
          <div class="vlp-card-dur">${esc(fmtDuration(v.duration_sec))}</div>
          <div class="vlp-card-orient">${esc(orientation)} ${esc(v.aspect_ratio || '?')}</div>
          ${isSelected ? '<div class="vlp-card-check">✓</div>' : ''}
        </div>
        <div class="vlp-card-title">${esc(v.title || 'Sin título')}</div>
      </button>
    `
  }

  function applyFilter (list) {
    let out = list
    const opts = state.opts || {}
    if (opts.platform && opts.platform !== 'all') {
      const flag = 'compat_' + opts.platform
      out = out.filter(v => v[flag] === true)
    }
    const q = state.search.trim().toLowerCase()
    if (q) out = out.filter(v =>
      (v.title || '').toLowerCase().includes(q) ||
      (Array.isArray(v.tags) && v.tags.some(t => String(t).toLowerCase().includes(q)))
    )
    return out
  }

  function injectStylesOnce () {
    if (document.getElementById('vlp-styles')) return
    const css = `
      .vlp-overlay { position: fixed; inset: 0; background: rgba(15,20,16,0.55); backdrop-filter: blur(2px); z-index: 2200; opacity: 0; transition: opacity .2s; }
      .vlp-panel { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.96); transition: transform .2s, opacity .2s; max-width: 880px; width: calc(100% - 32px); max-height: 86vh; background: var(--rm-bg, #f6f3ee); border-radius: 10px; box-shadow: 0 24px 60px rgba(0,0,0,.22); display: flex; flex-direction: column; z-index: 2201; opacity: 0; }
      body.vlp-open .vlp-overlay { opacity: 1; }
      body.vlp-open .vlp-panel { transform: translate(-50%,-50%) scale(1); opacity: 1; }
      body.vlp-open { overflow: hidden; }

      .vlp-h { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 26px 14px; border-bottom: 1px solid var(--rm-border, #e8e3dc); flex-shrink: 0; }
      .vlp-title { font-family: var(--rp-font); font-weight: 800; font-size: 22px; line-height: 1.2; margin: 4px 0 0; }
      .vlp-hint { font-size: 12px; color: var(--rm-muted, #7a7e79); margin-top: 6px; }
      .vlp-close { background: transparent; border: none; font-size: 26px; line-height: 1; cursor: pointer; color: var(--rm-muted, #7a7e79); padding: 4px 10px; border-radius: 4px; }
      .vlp-close:hover { background: var(--rp-surface-raised, #f6f3ee); color: var(--rm-ink, #0f1410); }

      .vlp-toolbar { display: flex; gap: 12px; padding: 12px 26px; align-items: center; border-bottom: 1px solid var(--rm-border, #e8e3dc); flex-shrink: 0; }

      .vlp-body { flex: 1; overflow-y: auto; padding: 16px 26px; min-height: 0; }
      .vlp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
      .vlp-card { background: var(--rp-surface, #fff); border: 2px solid transparent; border-radius: 6px; overflow: hidden; cursor: pointer; padding: 0; text-align: left; transition: border-color .15s, transform .15s; }
      .vlp-card:hover { transform: translateY(-2px); border-color: rgba(64,217,157,0.4); }
      .vlp-card.is-selected { border-color: var(--rp-teal, #40d99d); box-shadow: 0 0 0 2px rgba(64,217,157,.18); }
      .vlp-card-thumb { position: relative; aspect-ratio: 16/9; background: #1c1c1c; overflow: hidden; }
      .vlp-card-thumb img, .vlp-card-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .vlp-card-dur { position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,.72); color: #fff; font-family: var(--rm-mono); font-size: 10px; padding: 2px 5px; border-radius: 2px; }
      .vlp-card-orient { position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,.72); color: #fff; font-family: var(--rm-mono); font-size: 9.5px; padding: 2px 5px; border-radius: 2px; }
      .vlp-card-check { position: absolute; top: 5px; right: 5px; background: var(--rp-teal, #40d99d); color: var(--rm-green-deep, #004d35); font-family: var(--rm-mono); font-size: 13px; font-weight: 800; padding: 2px 7px; border-radius: 999px; }
      .vlp-card-title { padding: 8px 10px; font-size: 12px; line-height: 1.35; color: var(--rm-ink, #0f1410); }

      .vlp-empty { text-align: center; padding: 48px 20px; }
      .vlp-empty-icon { font-size: 32px; margin-bottom: 8px; }
      .vlp-empty-title { font-size: 16px; font-weight: 700; }
      .vlp-empty-body { font-size: 13px; color: var(--rm-muted, #7a7e79); max-width: 360px; margin: 6px auto 0; line-height: 1.5; }

      .vlp-foot { display: flex; gap: 10px; padding: 16px 26px; justify-content: flex-end; border-top: 1px solid var(--rm-border, #e8e3dc); background: var(--rp-surface, #fff); flex-shrink: 0; border-radius: 0 0 10px 10px; }
    `
    const s = document.createElement('style'); s.id = 'vlp-styles'; s.textContent = css; document.head.appendChild(s)
  }

  function ensureRoot () {
    let root = document.getElementById('vlp-root')
    if (root) return root
    root = document.createElement('div')
    root.id = 'vlp-root'
    document.body.appendChild(root)
    return root
  }

  function render () {
    const root = ensureRoot()
    if (!state.open) {
      root.innerHTML = ''
      document.body.classList.remove('vlp-open')
      return
    }
    injectStylesOnce()
    root.innerHTML = html()
    wire()
    requestAnimationFrame(() => document.body.classList.add('vlp-open'))
  }

  function wire () {
    const root = document.getElementById('vlp-root')
    if (!root) return

    root.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation()
        const act = el.dataset.act
        if (act === 'cancel')  closeWith(null)
        if (act === 'select')  selectVideo(el.dataset.videoId)
        if (act === 'confirm') confirmSelection()
      })
    })

    document.getElementById('vlp-search')?.addEventListener('input', e => {
      state.search = e.target.value
      render()
      const inp = document.getElementById('vlp-search')
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length) }
    })

    // Esc closes
    document.addEventListener('keydown', escHandler)
  }

  function escHandler (e) { if (e.key === 'Escape' && state.open) closeWith(null) }

  function selectVideo (id) {
    state.selectedId = state.selectedId === id ? null : id
    render()
  }

  function confirmSelection () {
    if (!state.selectedId) return
    const v = state.videos.find(x => x.id === state.selectedId)
    closeWith(v || null)
  }

  function closeWith (video) {
    state.open = false
    document.removeEventListener('keydown', escHandler)
    const cb = state.callback
    state.callback = null
    state.selectedId = null
    state.opts = null
    state.search = ''
    render()
    if (typeof cb === 'function') cb(video)
  }

  async function open (opts, callback) {
    state.open = true
    state.opts = opts || {}
    state.callback = callback
    state.loading = true
    state.search = ''
    state.selectedId = null
    render()

    try {
      const params = new URLSearchParams()
      if (state.opts.platform && state.opts.platform !== 'all') params.set('platform', state.opts.platform)
      const r = await window.rmApi.get('/api/meta/videos/list?' + params.toString())
      state.videos = r.videos || []
    } catch (err) {
      console.error('[vlp] failed to load videos:', err)
      state.videos = []
    } finally {
      state.loading = false
      render()
    }
  }

  window.rmVideoLibrary = { open, close: () => closeWith(null) }
})()
