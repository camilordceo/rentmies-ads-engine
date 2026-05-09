/* ─────────────────────────────────────────────────────────────
   Meta Videos library page
   /dashboard#meta/videos · #meta-videos

   Inventory of videos uploaded by this empresa. Drag-drop or
   click to upload, grid view with thumbnails + duration + aspect
   badges, filters by orientation / platform compatibility, and
   per-video edit + delete.

   Upload flow:
     1. Client extracts metadata (duration / w / h) from a local
        <video> element BEFORE uploading.
     2. Uses window.rmUploadAsset.upload() — picks inline (<3MB) or
        signed URL (≥3MB).
     3. Calls /api/meta/videos/confirm with metadata to register in DB.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'meta-videos'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')

  const state = {
    loading: true,
    videos: [],
    filterOrientation: 'all',          // 'all' | 'vertical' | 'square' | 'horizontal'
    filterPlatform: 'all',             // 'all' | 'ig_reels' | 'ig_feed' | 'fb_feed' | 'fb_reels'
    search: '',
    uploads: [],                       // [{ name, progress, status, error }] in-flight
    error: null
  }

  // ─── Helpers ─────────────────────────────────────────────
  function fmtDuration (sec) {
    if (!sec) return '—'
    const s = Math.round(Number(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`
  }
  function fmtSize (bytes) {
    if (!bytes) return '—'
    const mb = bytes / (1024 * 1024)
    return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB'
  }
  function fmtDate (iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
  }

  function applyFilters (list) {
    let out = list
    if (state.filterOrientation !== 'all') out = out.filter(v => v.orientation === state.filterOrientation)
    if (state.filterPlatform !== 'all') {
      const flag = 'compat_' + state.filterPlatform
      out = out.filter(v => v[flag] === true)
    }
    const q = state.search.trim().toLowerCase()
    if (q) out = out.filter(v =>
      (v.title || '').toLowerCase().includes(q) ||
      (Array.isArray(v.tags) && v.tags.some(t => String(t).toLowerCase().includes(q)))
    )
    return out
  }

  // ─── HTML ────────────────────────────────────────────────
  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html(PAGE_ID) : ''
    const filtered = applyFilters(state.videos)

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">META · VIDEO LIBRARY</span>
            <h1 class="rp-display">Tus <em>videos</em></h1>
            <p class="rp-subhead">Inventario central. Sube una vez, reusa en Quick Post y Campañas. Las compatibilidades con cada placement (IG Reels, FB Feed, etc.) se calculan automáticamente desde aspect ratio + duración.</p>
          </div>
        </div>

        ${state.uploads.length > 0 ? uploadsHtml() : ''}

        <!-- Upload zone -->
        <div class="mv-drop ${state.uploads.length > 0 ? 'is-compact' : ''}" id="mv-drop">
          <input type="file" id="mv-file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden multiple>
          <div class="mv-drop-icon">📹</div>
          <div class="mv-drop-title">Arrastra un video aquí</div>
          <div class="mv-drop-sub">o haz click — MP4, MOV o WEBM · max 250MB</div>
          <button type="button" class="ae-btn-primary" id="mv-pick" style="margin-top:10px;">Seleccionar archivo</button>
        </div>

        <!-- Toolbar -->
        <div class="wa-toolbar" style="margin-top: 24px;">
          <div class="wa-chips">
            ${[
              ['all',        'Todos',     state.videos.length],
              ['vertical',   'Verticales', state.videos.filter(v => v.orientation === 'vertical').length],
              ['square',     'Cuadrados',  state.videos.filter(v => v.orientation === 'square').length],
              ['horizontal', 'Apaisados',  state.videos.filter(v => v.orientation === 'horizontal').length]
            ].map(([k, label, count]) => `
              <button type="button" class="wa-chip ${state.filterOrientation === k ? 'is-active' : ''}" data-orient="${esc(k)}">
                ${esc(label)} <span class="wa-chip-count">${count}</span>
              </button>
            `).join('')}
          </div>
          <div class="wa-chips">
            ${[
              ['all',       'Todas plataformas'],
              ['ig_reels',  'IG Reels'],
              ['ig_feed',   'IG Feed'],
              ['fb_feed',   'FB Feed'],
              ['fb_reels',  'FB Reels']
            ].map(([k, label]) => `
              <button type="button" class="wa-chip ${state.filterPlatform === k ? 'is-active' : ''}" data-platform="${esc(k)}">${esc(label)}</button>
            `).join('')}
          </div>
          <div class="wa-search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" id="mv-search" placeholder="Buscar por título o tag…" value="${esc(state.search)}">
          </div>
        </div>

        ${state.loading ? `
          <div class="ae-formcard"><div class="rmc-skel"><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div></div></div>
        ` : filtered.length === 0 ? `
          ${state.videos.length === 0 ? emptyHtml() : `
            <div class="ae-formcard" style="text-align:center; padding:32px; color:var(--rm-muted);">Ningún video en este filtro</div>
          `}
        ` : `
          <div class="mv-grid">
            ${filtered.map(cardHtml).join('')}
          </div>
        `}
      </section>
    `
  }

  function uploadsHtml () {
    return `
      <div class="mv-uploads">
        ${state.uploads.map((u, i) => `
          <div class="mv-upload-row mv-upload-${esc(u.status)}" data-upload-i="${i}">
            <div class="mv-upload-name">📹 ${esc(u.name)}</div>
            <div class="mv-upload-progress"><div class="mv-upload-bar" style="width:${u.progress || 0}%"></div></div>
            <div class="mv-upload-status">
              ${u.status === 'uploading' ? esc(u.label || 'Subiendo…') :
                u.status === 'confirming' ? 'Registrando…' :
                u.status === 'done' ? '✓ ' + esc(u.label || 'Listo') :
                u.status === 'error' ? '✗ ' + esc(u.error || 'Error') : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `
  }

  function cardHtml (v) {
    const orientationLabel = v.orientation === 'vertical' ? '↕ 9:16'
                            : v.orientation === 'square' ? '◻ 1:1'
                            : v.orientation === 'horizontal' ? '↔ 16:9'
                            : v.aspect_ratio || '?'
    const compats = []
    if (v.compat_ig_reels)   compats.push({ k: 'ig-reels', label: 'IG Reels' })
    if (v.compat_ig_feed)    compats.push({ k: 'ig-feed',  label: 'IG Feed' })
    if (v.compat_fb_reels)   compats.push({ k: 'fb-reels', label: 'FB Reels' })
    if (v.compat_fb_feed)    compats.push({ k: 'fb-feed',  label: 'FB Feed' })
    const usage = (v.published_total || v.usage_count) || 0

    return `
      <div class="mv-card" data-video-id="${esc(v.id)}">
        <div class="mv-card-thumb" data-action="preview" data-video-id="${esc(v.id)}">
          ${v.thumbnail_url
            ? `<img src="${escAttr(v.thumbnail_url)}" alt="${escAttr(v.title)}" loading="lazy">`
            : `<video src="${escAttr(v.source_url)}#t=0.5" preload="metadata" muted></video>`}
          <div class="mv-card-duration">${fmtDuration(v.duration_sec)}</div>
          <div class="mv-card-orientation">${esc(orientationLabel)}</div>
          <div class="mv-card-play">▶</div>
        </div>
        <div class="mv-card-body">
          <div class="mv-card-title">${esc(v.title || 'Sin título')}</div>
          <div class="mv-card-meta">
            <span>${fmtDate(v.created_at)}</span>
            ${v.file_size_bytes ? `<span>${fmtSize(v.file_size_bytes)}</span>` : ''}
            ${usage > 0 ? `<span class="mv-card-usage">${usage} publicación${usage === 1 ? '' : 'es'}</span>` : ''}
          </div>
          ${compats.length ? `
            <div class="mv-compat-row">
              ${compats.map(c => `<span class="mv-compat mv-compat-${esc(c.k)}">${esc(c.label)}</span>`).join('')}
            </div>
          ` : `
            <div class="mv-compat-row">
              <span class="mv-compat mv-compat-incompat">No compatible con placements estándar</span>
            </div>
          `}
          <div class="mv-card-actions">
            <button type="button" class="ae-btn-ghost" data-action="edit" data-video-id="${esc(v.id)}">Editar</button>
            <button type="button" class="ae-btn-ghost" data-action="use" data-video-id="${esc(v.id)}">Usar →</button>
            <button type="button" class="ae-btn-ghost mv-card-delete" data-action="delete" data-video-id="${esc(v.id)}">Eliminar</button>
          </div>
        </div>
      </div>
    `
  }

  function emptyHtml () {
    return window.rmc?.emptyState ? window.rmc.emptyState({
      icon: '🎬',
      eyebrow: 'NINGÚN VIDEO TODAVÍA',
      title: 'Sube tu primer video',
      body: 'Una vez subido lo puedes reusar en Quick Post y Campañas sin re-subirlo. Calculamos automáticamente si sirve para Reels, Feed o Stories según aspect ratio y duración.',
      ctaLabel: 'Seleccionar archivo',
      ctaAction: 'mv-pick-empty'
    }) : ''
  }

  // ─── Upload flow ─────────────────────────────────────────
  async function handleFiles (fileList) {
    const files = Array.from(fileList || [])
    for (const file of files) {
      if (file.size > 250 * 1024 * 1024) {
        window.rmToast?.(`${file.name}: archivo > 250MB`, 'error')
        continue
      }
      const isVideo = /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
      if (!isVideo) {
        window.rmToast?.(`${file.name}: no es un video`, 'error')
        continue
      }
      uploadOne(file)
    }
  }

  async function uploadOne (file) {
    const slot = { name: file.name, status: 'uploading', progress: 5, label: 'Leyendo metadata…' }
    state.uploads.push(slot)
    render()

    try {
      // 1. Extract metadata client-side
      const meta = await extractMetadata(file)
      slot.progress = 15
      slot.label = `${Math.round(meta.duration_sec)}s · ${meta.width}×${meta.height} · subiendo…`
      render()

      // 2. Upload via existing helper
      const up = await window.rmUploadAsset.upload(file, {
        onStatus: msg => { slot.label = msg; render() }
      })
      slot.progress = 70

      // 3. Confirm + register in media_videos
      slot.status = 'confirming'
      slot.label = 'Registrando en librería'
      render()

      const titleFromFilename = file.name.replace(/\.(mp4|mov|webm|m4v)$/i, '').replace(/[-_]+/g, ' ').slice(0, 80)
      const r = await window.rmApi.post('/api/meta/videos/confirm', {
        storage_path: up.path,
        source_url: up.url,
        title: titleFromFilename,
        duration_sec: meta.duration_sec,
        width: meta.width,
        height: meta.height,
        file_size_bytes: file.size,
        mime_type: file.type || 'video/mp4'
      })

      slot.status = 'done'
      slot.progress = 100
      slot.label = 'subido a librería'
      render()

      state.videos.unshift(r.video)
      // Auto-clear after 3s
      setTimeout(() => {
        state.uploads = state.uploads.filter(u => u !== slot)
        render()
      }, 3000)

    } catch (err) {
      slot.status = 'error'
      slot.error = err.message || 'Error desconocido'
      render()
      console.error('[mv-upload] failed:', err)
    }
  }

  // Reads duration / width / height from a local video file
  function extractMetadata (file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      const url = URL.createObjectURL(file)
      const cleanup = () => URL.revokeObjectURL(url)

      video.onloadedmetadata = () => {
        const out = {
          duration_sec: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0
        }
        cleanup()
        resolve(out)
      }
      video.onerror = () => { cleanup(); reject(new Error('No se pudo leer metadata del video')) }
      video.src = url
      // Trigger load (Safari is finicky)
      try { video.load() } catch (_) {}
    })
  }

  // ─── Edit / delete / use ─────────────────────────────────
  function openEditModal (video) {
    closeAnyModal()
    const root = document.createElement('div')
    root.id = 'mv-edit-modal'
    root.innerHTML = `
      <div class="mv-modal-overlay"></div>
      <div class="mv-modal">
        <header class="mv-modal-h">
          <h2 class="mv-modal-title">Editar video</h2>
          <button class="mv-modal-close">×</button>
        </header>
        <div class="mv-modal-body">
          <div class="ae-field">
            <label class="ae-field-label" for="mv-edit-title">Título</label>
            <input id="mv-edit-title" class="ae-input" type="text" value="${escAttr(video.title)}" />
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="mv-edit-desc">Descripción</label>
            <textarea id="mv-edit-desc" class="ae-input" rows="3">${esc(video.description || '')}</textarea>
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="mv-edit-tags">Tags · separados por coma</label>
            <input id="mv-edit-tags" class="ae-input" type="text" value="${escAttr((video.tags || []).join(', '))}" placeholder="penthouse, bogota, lujo" />
          </div>
          <div class="ae-field" style="background:var(--rp-surface-raised, #f6f3ee); padding:12px 14px; border-radius:6px; font-size:12px;">
            <strong>Metadata:</strong> ${video.width}×${video.height} · ${fmtDuration(video.duration_sec)} · ${video.aspect_ratio || '?'} (${video.orientation || '?'})
          </div>
        </div>
        <footer class="mv-modal-foot">
          <button type="button" class="ae-btn-ghost mv-modal-cancel">Cancelar</button>
          <button type="button" class="ae-btn-primary mv-modal-save">Guardar</button>
        </footer>
      </div>
    `
    document.body.appendChild(root)
    requestAnimationFrame(() => root.classList.add('open'))

    root.querySelector('.mv-modal-close').addEventListener('click', closeAnyModal)
    root.querySelector('.mv-modal-cancel').addEventListener('click', closeAnyModal)
    root.querySelector('.mv-modal-overlay').addEventListener('click', closeAnyModal)
    root.querySelector('.mv-modal-save').addEventListener('click', async () => {
      const title = document.getElementById('mv-edit-title').value.trim()
      const description = document.getElementById('mv-edit-desc').value.trim()
      const tagsRaw = document.getElementById('mv-edit-tags').value.trim()
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
      try {
        const r = await window.rmApi.post('/api/meta/videos/update?id=' + encodeURIComponent(video.id), {
          title, description, tags
        })
        const idx = state.videos.findIndex(v => v.id === video.id)
        if (idx !== -1) state.videos[idx] = { ...state.videos[idx], ...r.video }
        closeAnyModal()
        render()
        window.rmToast?.('✓ Guardado', 'success')
      } catch (err) {
        window.rmToast?.(`✗ ${err.message}`, 'error')
      }
    })
  }

  function openPreviewModal (video) {
    closeAnyModal()
    const root = document.createElement('div')
    root.id = 'mv-preview-modal'
    root.innerHTML = `
      <div class="mv-modal-overlay"></div>
      <div class="mv-modal mv-modal-preview" style="max-width: 480px;">
        <header class="mv-modal-h">
          <h2 class="mv-modal-title">${esc(video.title || 'Sin título')}</h2>
          <button class="mv-modal-close">×</button>
        </header>
        <div class="mv-modal-body" style="padding: 0;">
          <video src="${escAttr(video.source_url)}" controls autoplay style="width:100%; max-height:70vh; display:block; background:#000;"></video>
        </div>
        <footer class="mv-modal-foot" style="font-size: 12px; color: var(--rm-muted);">
          <span>${video.width}×${video.height} · ${fmtDuration(video.duration_sec)} · ${esc(video.aspect_ratio || '')}</span>
          <a href="${escAttr(video.source_url)}" target="_blank" class="ae-btn-ghost" style="margin-left:auto;">Abrir directo ↗</a>
        </footer>
      </div>
    `
    document.body.appendChild(root)
    requestAnimationFrame(() => root.classList.add('open'))
    root.querySelectorAll('.mv-modal-close, .mv-modal-overlay').forEach(el => el.addEventListener('click', closeAnyModal))
  }

  function closeAnyModal () {
    const ids = ['mv-edit-modal', 'mv-preview-modal']
    ids.forEach(id => {
      const root = document.getElementById(id)
      if (root) {
        root.classList.remove('open')
        setTimeout(() => root.remove(), 200)
      }
    })
  }

  async function deleteVideo (video) {
    if (!confirm(`¿Archivar "${video.title}"? Los posts publicados quedan intactos.`)) return
    try {
      await window.rmApi.post('/api/meta/videos/delete?id=' + encodeURIComponent(video.id), {})
      state.videos = state.videos.filter(v => v.id !== video.id)
      render()
      window.rmToast?.('✓ Video archivado', 'success')
    } catch (err) {
      window.rmToast?.(`✗ ${err.message}`, 'error')
    }
  }

  function useVideo (video) {
    // Stash + go to Quick Post; Quick Post reads the stash on mount
    try {
      sessionStorage.setItem('rm_quickpost_preset_video', JSON.stringify({
        url: video.source_url,
        title: video.title,
        kind: 'video',
        video_id: video.id
      }))
    } catch (_) {}
    window.rmRouter?.goTo('quickpost')
  }

  // ─── Wire ────────────────────────────────────────────────
  function wire () {
    const drop = document.getElementById('mv-drop')
    const file = document.getElementById('mv-file')
    document.getElementById('mv-pick')?.addEventListener('click', () => file?.click())
    file?.addEventListener('change', e => handleFiles(e.target.files))

    if (drop) {
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-dragging') })
      drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'))
      drop.addEventListener('drop', e => {
        e.preventDefault()
        drop.classList.remove('is-dragging')
        handleFiles(e.dataTransfer.files)
      })
    }

    document.querySelectorAll('[data-orient]').forEach(btn => {
      btn.addEventListener('click', () => { state.filterOrientation = btn.dataset.orient; render() })
    })
    document.querySelectorAll('[data-platform]').forEach(btn => {
      btn.addEventListener('click', () => { state.filterPlatform = btn.dataset.platform; render() })
    })
    document.getElementById('mv-search')?.addEventListener('input', e => {
      state.search = e.target.value
      render()
      const inp = document.getElementById('mv-search')
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length) }
    })

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const id = btn.dataset.videoId
        const action = btn.dataset.action
        const video = state.videos.find(v => v.id === id)
        if (!video) {
          if (action === 'mv-pick-empty') file?.click()
          return
        }
        if (action === 'preview') openPreviewModal(video)
        if (action === 'edit')    openEditModal(video)
        if (action === 'delete')  deleteVideo(video)
        if (action === 'use')     useVideo(video)
      })
    })
  }

  // ─── Styles ──────────────────────────────────────────────
  function injectStylesOnce () {
    if (document.getElementById('mv-styles')) return
    const css = `
      .mv-drop { border: 2px dashed var(--rm-border, #e8e3dc); border-radius: 8px; padding: 38px 24px; text-align: center; transition: background .15s, border-color .15s; cursor: pointer; }
      .mv-drop.is-compact { padding: 18px 24px; }
      .mv-drop.is-dragging { background: rgba(64,217,157,0.08); border-color: var(--rp-teal, #40d99d); }
      .mv-drop-icon { font-size: 32px; margin-bottom: 6px; }
      .mv-drop-title { font-size: 14px; font-weight: 600; }
      .mv-drop-sub { font-size: 12px; color: var(--rm-muted, #7a7e79); margin-top: 4px; }

      .mv-uploads { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
      .mv-upload-row { display: grid; grid-template-columns: 1fr 200px 140px; gap: 14px; padding: 10px 14px; background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; align-items: center; }
      .mv-upload-name { font-size: 12.5px; font-family: var(--rm-mono); }
      .mv-upload-progress { height: 6px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; overflow: hidden; }
      .mv-upload-bar { height: 100%; background: linear-gradient(90deg, var(--rp-teal-deep, #004d35), var(--rp-teal, #40d99d)); transition: width .25s; }
      .mv-upload-status { font-size: 11.5px; color: var(--rm-muted, #7a7e79); text-align: right; font-family: var(--rm-mono); }
      .mv-upload-done .mv-upload-status { color: var(--rm-green-deep, #004d35); }
      .mv-upload-error .mv-upload-status { color: var(--rm-red, #c0392b); }

      .mv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-top: 18px; }
      .mv-card { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; overflow: hidden; transition: transform .15s, border-color .15s, box-shadow .15s; display: flex; flex-direction: column; }
      .mv-card:hover { transform: translateY(-2px); border-color: var(--rp-teal, #40d99d); box-shadow: 0 6px 18px rgba(0,0,0,.06); }
      .mv-card-thumb { position: relative; aspect-ratio: 16/9; background: #1c1c1c; cursor: pointer; overflow: hidden; }
      .mv-card-thumb img, .mv-card-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .mv-card-duration { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,.7); color: #fff; font-family: var(--rm-mono); font-size: 11px; padding: 2px 7px; border-radius: 3px; }
      .mv-card-orientation { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.7); color: #fff; font-family: var(--rm-mono); font-size: 10px; padding: 2px 7px; border-radius: 3px; }
      .mv-card-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,.55); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; opacity: 0; transition: opacity .15s; }
      .mv-card-thumb:hover .mv-card-play { opacity: 1; }
      .mv-card-body { padding: 12px 14px; flex: 1; display: flex; flex-direction: column; }
      .mv-card-title { font-size: 13.5px; font-weight: 600; line-height: 1.35; margin-bottom: 4px; }
      .mv-card-meta { display: flex; gap: 10px; font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); margin-bottom: 8px; flex-wrap: wrap; }
      .mv-card-usage { color: var(--rm-green-deep, #004d35); font-weight: 600; }
      .mv-compat-row { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
      .mv-compat { font-family: var(--rm-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 3px 7px; border-radius: 3px; background: rgba(64,217,157,0.10); color: var(--rm-green-deep, #004d35); text-transform: uppercase; }
      .mv-compat-incompat { background: rgba(192,57,43,0.10); color: var(--rm-red, #c0392b); }
      .mv-compat-fb-feed, .mv-compat-fb-reels { background: rgba(66,133,244,0.10); color: #1d4ed8; }
      .mv-card-actions { margin-top: auto; display: flex; gap: 4px; }
      .mv-card-actions .ae-btn-ghost { padding: 4px 10px; font-size: 11px; flex: 1; }
      .mv-card-delete { color: var(--rm-red, #c0392b); flex: 0 1 auto !important; }

      /* Modals */
      #mv-edit-modal, #mv-preview-modal { position: fixed; inset: 0; z-index: 2000; opacity: 0; transition: opacity .2s; }
      #mv-edit-modal.open, #mv-preview-modal.open { opacity: 1; }
      .mv-modal-overlay { position: absolute; inset: 0; background: rgba(15,20,16,0.55); backdrop-filter: blur(2px); }
      .mv-modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.97); transition: transform .2s; max-width: 540px; width: calc(100% - 32px); max-height: 90vh; overflow: auto; background: var(--rm-bg, #f6f3ee); border-radius: 8px; box-shadow: 0 24px 60px rgba(0,0,0,.18); display: flex; flex-direction: column; }
      #mv-edit-modal.open .mv-modal, #mv-preview-modal.open .mv-modal { transform: translate(-50%,-50%) scale(1); }
      .mv-modal-h { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 12px; border-bottom: 1px solid var(--rm-border, #e8e3dc); }
      .mv-modal-title { font-family: var(--rp-font); font-size: 18px; font-weight: 700; margin: 0; }
      .mv-modal-close { background: transparent; border: none; font-size: 24px; line-height: 1; cursor: pointer; padding: 4px 10px; }
      .mv-modal-body { padding: 18px 24px; }
      .mv-modal-foot { display: flex; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--rm-border, #e8e3dc); justify-content: flex-end; align-items: center; background: var(--rp-surface, #fff); }
    `
    const s = document.createElement('style'); s.id = 'mv-styles'; s.textContent = css; document.head.appendChild(s)
  }

  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  async function load () {
    state.loading = true
    state.error = null
    render()
    try {
      const r = await window.rmApi.get('/api/meta/videos/list')
      state.videos = r.videos || []
    } catch (err) {
      state.error = err.message
    } finally {
      state.loading = false
      render()
    }
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) load() })
  document.addEventListener('DOMContentLoaded', () => { if (window.rmRouter?.currentPage() === PAGE_ID) load() })
})()
