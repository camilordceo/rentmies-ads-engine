/* ─────────────────────────────────────────────────────────────
   Campaign Builder — multi-day, multi-format wizard.
   Mounts on section[data-page="schedule"].

   Modos de contenido:
   - images : N imágenes (auto-llenadas del inmueble) + IA opcional para regenerar
   - mixed  : el user sube K videos, los demás slots usan imagen del inmueble (+ IA)
   - videos : el user sube K videos, se rotan round-robin entre los N slots

   Persistencia: rm_scheduled_posts (compatible con /app y page-schedule legacy).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const SCHED_KEY = 'rm_scheduled_posts'
  const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i

  const { escapeHtml, escapeAttr } = (window.rmInmuebles || {})

  // ── State ────────────────────────────────────────────────

  let s = freshState()

  function freshState() {
    return {
      step: 1,
      inmuebles: [],
      inmuebleSource: '',
      selectedInmuebleId: '',
      cfg: {
        days: 7,
        postsPerDay: 1,
        startHour: 9,
        endHour: 19,
        platform: 'instagram',
        mediaMode: 'images',     // images | mixed | videos
        tone: 'casual',
        startDate: ''            // YYYY-MM-DD, default = today
      },
      assets: [],                // [{ id, kind: 'image'|'video', url, name, status }]
      posts: []                  // [{ id, idx, caption, mediaKind, mediaUrl, scheduledAt, vibe }]
    }
  }

  // ── Loading scheduled posts (shared with /app) ────────────

  function loadScheduled() {
    try { return JSON.parse(localStorage.getItem(SCHED_KEY) || '[]') } catch (_) { return [] }
  }
  function saveScheduled(arr) { localStorage.setItem(SCHED_KEY, JSON.stringify(arr)) }
  function updateOne(id, patch) {
    const arr = loadScheduled()
    const idx = arr.findIndex(p => p.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...patch }; saveScheduled(arr) }
  }

  // ── Render ────────────────────────────────────────────────

  function html() {
    const allScheduled = loadScheduled()
    const counts = allScheduled.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {})

    return `
      <div class="ae-page-shell ae-rise">

        <header class="ae-page-head">
          <span class="ae-eyebrow">CAMPAÑAS · MULTI-DÍA</span>
          <h1 class="ae-display"><span class="ae-display-prefix">Campaign</span> <em>Builder</em></h1>
          <p class="ae-subhead">Selecciona un inmueble, define cuántos días y posts, y la IA arma toda la campaña — captions con vibes rotando, imágenes IA, o videos que tú subes.</p>
        </header>

        ${stepperHtml(s.step)}

        <div id="cb-step-body">${stepBodyHtml()}</div>

        ${controlsHtml()}

        ${allScheduled.length ? scheduledListHtml(allScheduled, counts) : ''}

      </div>
    `
  }

  function stepperHtml(active) {
    const steps = [
      { n: 1, label: 'Inmueble' },
      { n: 2, label: 'Configurar' },
      { n: 3, label: 'Generar' },
      { n: 4, label: 'Confirmar' }
    ]
    return `
      <div class="ae-cb-stepper">
        ${steps.map(st => {
          const cls = st.n < active ? 'done' : (st.n === active ? 'active' : '')
          return `<div class="ae-cb-step ${cls}"><div class="ae-cb-num">${st.n}</div><div>${st.label}</div></div>`
        }).join('')}
      </div>
    `
  }

  function stepBodyHtml() {
    if (s.step === 1) return step1Html()
    if (s.step === 2) return step2Html()
    if (s.step === 3) return step3Html()
    if (s.step === 4) return step4Html()
    return ''
  }

  // ── Step 1: Inmueble ──────────────────────────────────────

  function step1Html() {
    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h">
          <span>1. Selecciona un inmueble</span>
          <span class="ae-formcard-h-accessory" id="cb-inmueble-source">cargando…</span>
        </div>
        <div id="cb-inmueble-strip" class="ae-prop-strip"></div>
        <div class="ae-help info" style="margin-top:10px;">
          <strong>Nota:</strong> el inmueble se usa como base para los captions. Si no hay inventario real, usaremos los inmuebles de muestra. También puedes saltarte y usar solo los videos que subas.
        </div>
        <div class="ae-action-row" style="margin-top:14px;">
          <button class="ae-btn-ghost" id="cb-skip-inmueble" type="button">Saltar inmueble (solo videos)</button>
          <span class="ae-cb-status-line" id="cb-step1-status"></span>
        </div>
      </section>
    `
  }

  // ── Step 2: Configurar ────────────────────────────────────

  function step2Html() {
    const c = s.cfg
    const totalPosts = c.days * c.postsPerDay
    const today = new Date().toISOString().slice(0, 10)
    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h"><span>2. Configura la campaña</span></div>

        <div class="ae-cb-config-grid">
          <div class="ae-field">
            <label class="ae-field-label" for="cb-days">Duración (días)</label>
            <input id="cb-days" class="ae-input" type="number" min="1" max="30" value="${c.days}" />
            <div class="ae-field-hint">Entre 1 y 30 días</div>
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-ppd">Posts por día</label>
            <input id="cb-ppd" class="ae-input" type="number" min="1" max="5" value="${c.postsPerDay}" />
            <div class="ae-field-hint">Recomendado: 1-2</div>
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-start">Empezar el</label>
            <input id="cb-start" class="ae-input" type="date" value="${c.startDate || today}" min="${today}" />
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-platform">Plataforma</label>
            <select id="cb-platform" class="ae-select">
              <option value="instagram" ${c.platform === 'instagram' ? 'selected' : ''}>📷 Instagram</option>
              <option value="facebook_page" ${c.platform === 'facebook_page' ? 'selected' : ''}>📘 Facebook</option>
            </select>
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-h-start">Ventana — desde</label>
            <input id="cb-h-start" class="ae-input" type="number" min="0" max="23" value="${c.startHour}" />
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-h-end">Ventana — hasta</label>
            <input id="cb-h-end" class="ae-input" type="number" min="1" max="23" value="${c.endHour}" />
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="cb-tone">Tono</label>
            <select id="cb-tone" class="ae-select">
              <option value="casual" ${c.tone === 'casual' ? 'selected' : ''}>Casual / cercano</option>
              <option value="formal" ${c.tone === 'formal' ? 'selected' : ''}>Formal / profesional</option>
              <option value="urgency" ${c.tone === 'urgency' ? 'selected' : ''}>Urgencia / FOMO</option>
              <option value="storytelling" ${c.tone === 'storytelling' ? 'selected' : ''}>Storytelling</option>
            </select>
          </div>
        </div>

        <div style="margin-top:18px;">
          <div class="ae-field-label" style="margin-bottom:10px;">Tipo de contenido</div>
          <div class="ae-cb-mode-row">
            ${modeCard('images', '🖼', 'Solo imágenes', 'Cada post usa la foto del inmueble. Puedes regenerar con IA en el siguiente paso.')}
            ${modeCard('mixed', '🎬', 'Mixto', 'Algunos posts son video (los que tú subas), otros son imagen del inmueble.')}
            ${modeCard('videos', '🎥', 'Solo videos', 'Tú subes los videos. Se rotan entre los slots de la campaña.')}
          </div>
        </div>

        <div class="ae-help" style="margin-top:14px;">
          <strong>Total de posts:</strong> ${c.days} días × ${c.postsPerDay}/día = <strong>${totalPosts} posts</strong>
        </div>
      </section>
    `
  }

  function modeCard(value, icon, title, desc) {
    const sel = s.cfg.mediaMode === value ? 'selected' : ''
    return `
      <button type="button" class="ae-cb-mode-card ${sel}" data-mode="${value}">
        <span class="ae-cb-mode-icon">${icon}</span>
        <div class="ae-cb-mode-title">${title}</div>
        <div class="ae-cb-mode-desc">${desc}</div>
      </button>
    `
  }

  // ── Step 3: Generar ───────────────────────────────────────

  function step3Html() {
    const total = totalPosts()
    const mode = s.cfg.mediaMode
    const videosCount = s.assets.filter(a => a.kind === 'video' && a.status === 'ready').length
    const imagesCount = s.assets.filter(a => a.kind === 'image' && a.status === 'ready').length
    const captionsReady = s.posts.filter(p => p.caption).length

    // Uploader config according to mode
    let acceptAttr, uploaderTitle, uploaderHint, uploaderCount
    if (mode === 'videos') {
      acceptAttr = 'video/mp4,video/quicktime,video/webm'
      uploaderTitle = '📹 Subir videos'
      uploaderHint = 'MP4 / MOV / WEBM · max 250MB c/u · vertical 9:16 ideal para Reels · 3-90s'
      uploaderCount = `${videosCount} videos subidos`
    } else if (mode === 'images') {
      acceptAttr = 'image/png,image/jpeg,image/webp'
      uploaderTitle = '🖼 Subir imágenes propias (opcional)'
      uploaderHint = 'JPG / PNG / WEBP · ratio 4:5 o 1:1 ideal para IG Feed · max 3MB inline / 250MB con URL firmada'
      uploaderCount = `${imagesCount} imágenes subidas — si no subes ninguna, se usa la foto del inmueble`
    } else {
      // mixed
      acceptAttr = 'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm'
      uploaderTitle = '🎬 Subir imágenes y/o videos'
      uploaderHint = 'JPG / PNG / MP4 / MOV — sube los que quieras y los rotamos entre los slots'
      uploaderCount = `${videosCount} videos + ${imagesCount} imágenes propias`
    }

    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h">
          <span>3. Genera el contenido</span>
          <span class="ae-formcard-h-accessory">${total} posts</span>
        </div>

        <div style="margin-bottom:18px;">
          <div class="ae-field-label" style="margin-bottom:8px;">
            ${mode === 'videos' ? 'Videos para la campaña' : (mode === 'images' ? 'Imágenes (opcional)' : 'Assets de la campaña')}
            <span style="color:var(--rm-muted); font-weight:400;"> — ${uploaderCount}</span>
          </div>
          <label class="ae-cb-uploader" for="cb-asset-input">
            <div class="ae-cb-uploader-title">${uploaderTitle}</div>
            <div class="ae-cb-uploader-hint">${uploaderHint}</div>
            <input id="cb-asset-input" type="file" accept="${acceptAttr}" multiple style="display:none;" />
          </label>
          ${s.assets.length ? `<div class="ae-cb-asset-grid" id="cb-asset-grid" style="margin-top:14px;">${s.assets.map(assetCardHtml).join('')}</div>` : ''}
        </div>

        ${mode !== 'videos' ? `
          <div class="ae-help info" style="margin-bottom:14px;">
            ${mode === 'mixed'
              ? `<strong>Mixto:</strong> los slots se llenan alternando — primero usamos los videos que subas, luego las imágenes que subas, y los slots restantes la foto del inmueble. Puedes ajustar slot por slot en el paso 4.`
              : `<strong>Solo imágenes:</strong> si no subes nada, cada post usa la foto del inmueble. Puedes regenerar individualmente con IA (~$0.04 c/u) o sustituir por una imagen propia.`
            }
          </div>
        ` : ''}

        <div class="ae-action-row" style="margin-top:14px;">
          <button class="ae-btn-authority" id="cb-gen-captions" type="button">
            ✨ ${captionsReady ? 'Regenerar captions' : 'Generar captions'} (${total})
          </button>
          <span class="ae-cb-status-line" id="cb-gen-status">${captionsReady ? `${captionsReady}/${total} captions listos` : ''}</span>
        </div>

        <div id="cb-preview-grid" style="margin-top:18px;">
          ${s.posts.length ? `<div class="ae-cb-grid">${s.posts.map(postCardHtml).join('')}</div>` : ''}
        </div>
      </section>
    `
  }

  function assetCardHtml(a) {
    const isVideo = a.kind === 'video'
    const tag = isVideo ? 'VIDEO' : 'IMG'
    if (a.status === 'uploading') {
      return `<div class="ae-cb-asset"><div class="ae-cb-asset-progress">${escapeHtml(a.progressLabel || 'Subiendo…')}</div></div>`
    }
    if (a.status === 'error') {
      return `
        <div class="ae-cb-asset" style="border-color:var(--rm-red);">
          <div class="ae-cb-asset-progress" style="background:rgba(220,53,69,0.85);">${escapeHtml(a.error || 'Error')}</div>
          <button class="ae-cb-asset-remove" data-remove-asset="${escapeAttr(a.id)}" type="button">×</button>
        </div>
      `
    }
    return `
      <div class="ae-cb-asset">
        ${isVideo
          ? `<video src="${escapeAttr(a.url)}" muted preload="metadata" playsinline></video>`
          : `<img src="${escapeAttr(a.url)}" alt="${escapeAttr(a.name || 'asset')}" />`
        }
        <span class="ae-cb-asset-tag">${tag}</span>
        <button class="ae-cb-asset-remove" data-remove-asset="${escapeAttr(a.id)}" type="button" title="Eliminar">×</button>
      </div>
    `
  }

  function postCardHtml(p) {
    const isVideo = p.mediaKind === 'video'
    const dt = new Date(p.scheduledAt)
    const dtStr = isNaN(dt.getTime()) ? '—' : dt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    const cls = (!p.caption || !p.mediaUrl) ? 'invalid' : ''
    return `
      <article class="ae-cb-card ${cls}" data-post-idx="${p.idx}">
        <div class="ae-cb-card-media ${isVideo ? 'video' : ''}" ${p.mediaUrl && !isVideo ? `style="background-image:url('${escapeAttr(p.mediaUrl)}')"` : ''}>
          ${isVideo && p.mediaUrl ? `<video src="${escapeAttr(p.mediaUrl)}" muted preload="metadata" playsinline style="width:100%;height:100%;object-fit:cover;"></video>` : ''}
          ${!p.mediaUrl ? '<div class="ae-cb-card-media-empty">Sin media · falta video o imagen</div>' : ''}
        </div>
        <div class="ae-cb-card-body">
          <div class="ae-cb-card-meta">
            <span class="ae-cb-card-vibe">${escapeHtml((p.vibe || '').slice(0, 28))}</span>
            <span class="ae-cb-card-time">#${p.idx + 1} · ${dtStr}</span>
          </div>
          <textarea class="ae-cb-card-caption" data-caption-idx="${p.idx}" rows="5" placeholder="Caption…">${escapeHtml(p.caption || '')}</textarea>
          <div class="ae-cb-card-actions">
            <button class="ae-btn-ghost" data-regen-caption="${p.idx}" type="button">↻ Caption</button>
            ${!isVideo ? `<button class="ae-btn-ghost" data-regen-image="${p.idx}" type="button">✨ Imagen IA</button>` : ''}
            <button class="ae-btn-ghost" data-toggle-media="${p.idx}" type="button">${isVideo ? '🖼 a imagen' : '🎥 a video'}</button>
            <button class="ae-btn-ghost" data-remove-post="${p.idx}" type="button" style="color:var(--rm-red);">Eliminar</button>
          </div>
        </div>
      </article>
    `
  }

  // ── Step 4: Confirmar ─────────────────────────────────────

  function step4Html() {
    const total = s.posts.length
    const ready = s.posts.filter(p => p.caption && p.mediaUrl).length
    const incomplete = total - ready
    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h">
          <span>4. Confirma y programa</span>
          <span class="ae-formcard-h-accessory">${ready}/${total} listos</span>
        </div>

        ${incomplete > 0 ? `
          <div class="ae-help warn">
            <strong>⚠ ${incomplete} post${incomplete > 1 ? 's' : ''} incompletos</strong> — sin caption o sin media. Vuelve atrás o elimínalos antes de programar.
          </div>
        ` : `
          <div class="ae-help" style="border-left-color:var(--rm-green-deep); background:rgba(0,77,53,0.05);">
            <strong>✓ Todo listo.</strong> Se programarán ${ready} posts en ${s.cfg.platform === 'instagram' ? 'Instagram' : 'Facebook'} desde ${s.cfg.startDate || 'hoy'} durante ${s.cfg.days} día${s.cfg.days > 1 ? 's' : ''} (${s.cfg.postsPerDay}/día, entre ${s.cfg.startHour}h y ${s.cfg.endHour}h).
          </div>
        `}

        <div class="ae-cb-grid" style="margin-top:14px;">
          ${s.posts.map(postCardHtml).join('')}
        </div>

        <div class="ae-action-row" style="margin-top:18px;">
          <button class="ae-btn-primary" id="cb-confirm-btn" type="button" ${incomplete > 0 ? 'disabled' : ''}>
            📅 PROGRAMAR ${ready} POSTS
          </button>
          <span class="ae-cb-status-line" id="cb-confirm-status"></span>
        </div>
      </section>
    `
  }

  // ── Controls (Atrás/Siguiente) ────────────────────────────

  function controlsHtml() {
    const canBack = s.step > 1
    const isLast = s.step === 4
    return `
      <div class="ae-cb-controls">
        <button class="ae-btn-ghost" id="cb-back-btn" type="button" ${canBack ? '' : 'disabled style="visibility:hidden;"'}>← Atrás</button>
        <div class="right">
          <button class="ae-btn-ghost" id="cb-reset-btn" type="button">Reiniciar</button>
          ${!isLast ? '<button class="ae-btn-primary" id="cb-next-btn" type="button">Siguiente →</button>' : ''}
        </div>
      </div>
    `
  }

  // ── Scheduled list (always visible at bottom) ─────────────

  function scheduledListHtml(all, counts) {
    const grouped = {}
    for (const p of all) {
      const cid = p.campaignId || 'standalone'
      grouped[cid] = grouped[cid] || { name: p.campaignName || 'Posts individuales', posts: [] }
      grouped[cid].posts.push(p)
    }
    const campaigns = Object.entries(grouped).sort((a, b) => {
      const ta = Math.max(...a[1].posts.map(p => Date.parse(p.createdAt) || 0))
      const tb = Math.max(...b[1].posts.map(p => Date.parse(p.createdAt) || 0))
      return tb - ta
    })

    return `
      <section style="margin-top:32px;">
        <div class="ae-formcard-h" style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--rm-border);">
          <span style="font-size:15px; font-weight:600; color:var(--rm-ink);">Posts programados</span>
          <span class="ae-formcard-h-accessory">
            ${counts.pending ? `<span class="ae-status pending" style="margin-right:6px;">${counts.pending} pendientes</span>` : ''}
            ${counts.published ? `<span class="ae-status scheduled" style="margin-right:6px;">${counts.published} publicados</span>` : ''}
            ${counts.failed ? `<span class="ae-status paused" style="margin-right:6px;">${counts.failed} fallidos</span>` : ''}
          </span>
        </div>
        ${campaigns.map(([cid, c]) => campaignBlockHtml(cid, c)).join('')}
      </section>
    `
  }

  function campaignBlockHtml(cid, c) {
    const posts = c.posts.slice().sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    return `
      <div class="ae-formcard" style="margin-bottom:12px;">
        <div class="ae-formcard-h" style="margin-bottom:10px;">
          <span style="font-size:13px;">${escapeHtml(c.name)}</span>
          <button class="ae-btn-ghost" style="font-size:10px; padding:4px 9px;" data-delete-camp="${escapeAttr(cid)}" type="button">Borrar</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${posts.map(postRowHtml).join('')}
        </div>
      </div>
    `
  }

  function postRowHtml(p) {
    const dt = new Date(p.scheduledAt)
    const dtStr = isNaN(dt.getTime()) ? '—' : dt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    const due = dt.getTime() - Date.now()
    let countdown = ''
    if (p.status === 'pending') {
      if (due > 0) {
        const m = Math.floor(due / 60000)
        countdown = m > 60 ? ` · ${Math.floor(m/60)}h ${m%60}m` : (m > 0 ? ` · ${m}m` : ' · ahora')
      } else countdown = ' · ahora'
    }
    const linkHtml = p.postUrl ? ` · <a href="${escapeAttr(p.postUrl)}" target="_blank" style="color:var(--rm-green-deep); text-decoration:underline;">ver post</a>` : ''
    const errHtml = p.error ? `<div style="font-size:10px; color:var(--rm-red); margin-top:3px;">${escapeHtml(p.error)}</div>` : ''
    const isVideo = p.mediaKind === 'video' || (p.imageUrl && VIDEO_EXT_RE.test(p.imageUrl))
    const mediaTag = isVideo ? '🎥' : '🖼'
    return `
      <div style="display:flex; gap:10px; align-items:flex-start; padding:10px 12px; background:var(--rm-surface-2); border:1px solid var(--rm-border); border-radius:5px;">
        ${p.imageUrl
          ? (isVideo
              ? `<div style="width:42px;height:42px;border-radius:4px;background:var(--rm-ink);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">▶</div>`
              : `<img src="${escapeAttr(p.imageUrl)}" style="width:42px; height:42px; border-radius:4px; object-fit:cover; flex-shrink:0;" onerror="this.style.opacity='0.3'">`
            )
          : ''}
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:var(--rm-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${mediaTag} ${escapeHtml((p.caption || '').slice(0, 100))}</div>
          <div style="font-size:11px; color:var(--rm-muted); margin-top:3px; font-family:var(--rm-mono);">${p.platform === 'instagram' ? 'IG' : 'FB'} · ${dtStr}${countdown}${linkHtml}</div>
          ${errHtml}
        </div>
        <span class="ae-status ${({pending:'pending',publishing:'pending',published:'scheduled',failed:'paused',expired:'paused',cancelled:'paused',processing:'pending'})[p.status] || 'pending'}" style="flex-shrink:0;">${p.status}</span>
      </div>
    `
  }

  // ── Mount + wire ──────────────────────────────────────────

  async function mount() {
    const slot = document.querySelector('section[data-page="schedule"]')
    if (!slot) return
    slot.innerHTML = html()

    // Hydrate inmuebles for step 1
    if (s.step === 1 && window.rmInmuebles) {
      const { items, source } = await window.rmInmuebles.load()
      s.inmuebles = items
      s.inmuebleSource = source
      renderInmuebleStrip()
    }

    wire()
  }

  function renderInmuebleStrip() {
    const strip = document.querySelector('#cb-inmueble-strip')
    const source = document.querySelector('#cb-inmueble-source')
    if (!strip) return
    const cardHtml = window.rmInmuebles && window.rmInmuebles.cardHtml
    if (!s.inmuebles.length || !cardHtml) {
      strip.innerHTML = '<div class="ae-help">Sin inmuebles. Puedes saltar este paso si vas a usar solo videos.</div>'
      if (source) source.textContent = 'sin inventario'
      return
    }
    strip.innerHTML = s.inmuebles.map(p => cardHtml(p, { selectedId: s.selectedInmuebleId })).join('')
    if (source) source.textContent = s.inmuebleSource === 'starter' ? 'inmuebles de muestra' : `${s.inmuebles.length} inmuebles`

    strip.querySelectorAll('[data-inmueble-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        s.selectedInmuebleId = btn.dataset.inmuebleId
        renderInmuebleStrip()
        const stat = document.getElementById('cb-step1-status')
        if (stat) { stat.textContent = '✓ Inmueble listo'; stat.classList.add('success') }
      })
    })
  }

  function wire() {
    // Stepper / controls
    const back = document.getElementById('cb-back-btn')
    const next = document.getElementById('cb-next-btn')
    const reset = document.getElementById('cb-reset-btn')
    if (back) back.addEventListener('click', goBack)
    if (next) next.addEventListener('click', goNext)
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('¿Reiniciar la campaña? Perderás el progreso.')) return
      s = freshState(); mount()
    })

    if (s.step === 1) {
      const skip = document.getElementById('cb-skip-inmueble')
      if (skip) skip.addEventListener('click', () => { s.selectedInmuebleId = ''; goNext(true) })
    }

    if (s.step === 2) {
      ['cb-days','cb-ppd','cb-h-start','cb-h-end','cb-platform','cb-tone','cb-start'].forEach(id => {
        const el = document.getElementById(id)
        if (!el) return
        el.addEventListener('input', () => readConfigFromDom())
        el.addEventListener('change', () => readConfigFromDom())
      })
      document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          s.cfg.mediaMode = btn.dataset.mode
          mount()
        })
      })
    }

    if (s.step === 3) {
      const fileIn = document.getElementById('cb-asset-input')
      if (fileIn) fileIn.addEventListener('change', handleAssetUpload)
      document.querySelectorAll('[data-remove-asset]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation()
          const id = btn.dataset.removeAsset
          s.assets = s.assets.filter(a => a.id !== id)
          regenerateMediaAssignments()
          mount()
        })
      })
      const genBtn = document.getElementById('cb-gen-captions')
      if (genBtn) genBtn.addEventListener('click', generateCaptionsForAll)

      wirePostCards()
    }

    if (s.step === 4) {
      wirePostCards()
      const confirmBtn = document.getElementById('cb-confirm-btn')
      if (confirmBtn) confirmBtn.addEventListener('click', confirmAndSchedule)
    }

    // Scheduled list (always at bottom)
    document.querySelectorAll('[data-delete-camp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.deleteCamp
        if (!confirm('¿Borrar todos los posts de este grupo?')) return
        const arr = loadScheduled().filter(p => (p.campaignId || 'standalone') !== cid)
        saveScheduled(arr)
        rearmAll()
        mount()
      })
    })
  }

  function wirePostCards() {
    document.querySelectorAll('[data-caption-idx]').forEach(ta => {
      ta.addEventListener('input', () => {
        const i = parseInt(ta.dataset.captionIdx, 10)
        if (s.posts[i]) s.posts[i].caption = ta.value
      })
    })
    document.querySelectorAll('[data-regen-caption]').forEach(btn => {
      btn.addEventListener('click', () => regenerateOneCaption(parseInt(btn.dataset.regenCaption, 10)))
    })
    document.querySelectorAll('[data-regen-image]').forEach(btn => {
      btn.addEventListener('click', () => regenerateOneImage(parseInt(btn.dataset.regenImage, 10)))
    })
    document.querySelectorAll('[data-toggle-media]').forEach(btn => {
      btn.addEventListener('click', () => toggleMediaKind(parseInt(btn.dataset.toggleMedia, 10)))
    })
    document.querySelectorAll('[data-remove-post]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.removePost, 10)
        s.posts.splice(i, 1)
        s.posts.forEach((p, idx) => p.idx = idx)
        mount()
      })
    })
  }

  // ── Step navigation ───────────────────────────────────────

  function goNext(skip) {
    if (s.step === 1) {
      // need inmueble OR explicit skip
      if (!s.selectedInmuebleId && !skip) {
        const stat = document.getElementById('cb-step1-status')
        if (stat) { stat.textContent = '✗ Selecciona un inmueble o pulsa "Saltar inmueble"'; stat.classList.add('error') }
        return
      }
      s.step = 2; mount(); return
    }
    if (s.step === 2) {
      readConfigFromDom()
      const total = totalPosts()
      if (total < 1 || total > 100) { window.rmToast?.('Total de posts fuera de rango (1-100)', 'error'); return }
      // Pre-build empty post slots with scheduled times so step 3 can show preview grid
      s.posts = buildEmptyPostSlots()
      s.step = 3; mount(); return
    }
    if (s.step === 3) {
      // require captions present + media assignments
      regenerateMediaAssignments()
      const incomplete = s.posts.filter(p => !p.caption || !p.mediaUrl)
      if (incomplete.length === s.posts.length) {
        window.rmToast?.('Genera captions y asigna media antes de continuar', 'error')
        return
      }
      s.step = 4; mount(); return
    }
  }

  function goBack() {
    if (s.step > 1) { s.step -= 1; mount() }
  }

  // ── Step 2 helpers ────────────────────────────────────────

  function readConfigFromDom() {
    const c = s.cfg
    const days = parseInt((document.getElementById('cb-days') || {}).value || c.days, 10)
    const ppd = parseInt((document.getElementById('cb-ppd') || {}).value || c.postsPerDay, 10)
    const hs = parseInt((document.getElementById('cb-h-start') || {}).value || c.startHour, 10)
    const he = parseInt((document.getElementById('cb-h-end') || {}).value || c.endHour, 10)
    c.days = clamp(days, 1, 30)
    c.postsPerDay = clamp(ppd, 1, 5)
    c.startHour = clamp(hs, 0, 23)
    c.endHour = clamp(he, c.startHour + 1, 23)
    c.platform = (document.getElementById('cb-platform') || {}).value || c.platform
    c.tone = (document.getElementById('cb-tone') || {}).value || c.tone
    c.startDate = (document.getElementById('cb-start') || {}).value || c.startDate
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, isNaN(n) ? lo : n)) }

  function totalPosts() { return s.cfg.days * s.cfg.postsPerDay }

  // ── Build empty post slots (step 2 → step 3) ──────────────

  function buildEmptyPostSlots() {
    const c = s.cfg
    const total = totalPosts()
    const startDate = c.startDate ? new Date(c.startDate + 'T00:00:00') : new Date()
    startDate.setHours(0, 0, 0, 0)
    const slots = []
    for (let d = 0; d < c.days; d++) {
      for (let p = 0; p < c.postsPerDay; p++) {
        const dt = new Date(startDate)
        dt.setDate(dt.getDate() + d)
        // Distribute posts within window
        let h
        if (c.postsPerDay === 1) {
          h = c.startHour + (c.endHour - c.startHour) * 0.5
        } else {
          h = c.startHour + ((c.endHour - c.startHour) / (c.postsPerDay - 1)) * p
        }
        const hh = Math.floor(h)
        const mm = Math.floor((h - hh) * 60)
        dt.setHours(hh, mm, 0, 0)
        // If this is today and the time is in the past, push at least 5 min ahead
        if (dt.getTime() < Date.now() + 60000) {
          dt.setTime(Date.now() + (slots.length * 90 + 300) * 1000)
        }
        slots.push({
          id: 'slot_' + Date.now() + '_' + slots.length + '_' + Math.random().toString(36).slice(2, 6),
          idx: slots.length,
          caption: '',
          mediaKind: '', mediaUrl: '',
          scheduledAt: dt.toISOString(),
          vibe: ''
        })
      }
    }
    return slots
  }

  // ── Step 3: asset upload (image OR video, via shared helper) ──

  async function handleAssetUpload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!window.rmUploadAsset) {
      window.rmToast?.('Helper de upload no cargado — refresca la página', 'error')
      return
    }
    for (const file of files) {
      const kind = window.rmUploadAsset.detectKindFromFile(file)
      const asset = {
        id: 'ast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        kind, url: '', name: file.name,
        status: 'uploading',
        progressLabel: 'Iniciando…'
      }
      s.assets.push(asset)
      mount()
      try {
        const result = await window.rmUploadAsset.upload(file, {
          onStatus: msg => { asset.progressLabel = msg; mount() }
        })
        asset.url = result.url
        asset.kind = result.kind
        asset.status = 'ready'
        regenerateMediaAssignments()
        mount()
      } catch (err) {
        console.error('[campaign-builder] asset upload failed', err)
        asset.status = 'error'
        asset.error = err.message
        mount()
      }
    }
  }

  // ── Step 3: media assignment (round-robin) ────────────────

  function regenerateMediaAssignments() {
    const inmueble = getSelectedInmueble()
    const inmuebleImg = (inmueble && inmueble.imagen) || ''
    const videos = s.assets.filter(a => a.kind === 'video' && a.status === 'ready')
    const userImages = s.assets.filter(a => a.kind === 'image' && a.status === 'ready')
    const mode = s.cfg.mediaMode

    s.posts.forEach((post, i) => {
      // Don't override media the user explicitly picked later
      if (post._userPickedMedia) return

      if (mode === 'videos') {
        if (videos.length === 0) { post.mediaKind = ''; post.mediaUrl = ''; return }
        const v = videos[i % videos.length]
        post.mediaKind = 'video'; post.mediaUrl = v.url
      } else if (mode === 'images') {
        // Prefer user-uploaded images, fall back to inmueble photo
        if (userImages.length > 0) {
          const img = userImages[i % userImages.length]
          post.mediaKind = 'image'; post.mediaUrl = img.url
        } else {
          post.mediaKind = 'image'; post.mediaUrl = inmuebleImg
        }
      } else {
        // mixed: round-robin through [videos..., user images..., inmueble photo]
        const pool = []
        videos.forEach(v => pool.push({ kind: 'video', url: v.url }))
        userImages.forEach(im => pool.push({ kind: 'image', url: im.url }))
        if (inmuebleImg) pool.push({ kind: 'image', url: inmuebleImg })
        if (pool.length === 0) { post.mediaKind = ''; post.mediaUrl = ''; return }
        const pick = pool[i % pool.length]
        post.mediaKind = pick.kind; post.mediaUrl = pick.url
      }
    })
  }

  function getSelectedInmueble() {
    return s.inmuebles.find(p => p.id === s.selectedInmuebleId) || null
  }

  // ── Step 3: caption generation ────────────────────────────

  async function generateCaptionsForAll() {
    const btn = document.getElementById('cb-gen-captions')
    const status = document.getElementById('cb-gen-status')
    const inmueble = getSelectedInmueble()
    if (!inmueble && s.assets.length === 0) {
      if (status) { status.textContent = '✗ Sin inmueble ni assets — agrega contexto'; status.classList.add('error') }
      return
    }
    btn.disabled = true; status.textContent = '⏳ Generando captions…'; status.classList.remove('error', 'success')
    try {
      const empresaId = empresaIdFromStorage()
      const r = await fetch('/api/ai?action=batch-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({
          inmueble: inmueble ? toLegacyInmueble(inmueble) : null,
          count: s.posts.length,
          platform: s.cfg.platform,
          reference_image_url: (inmueble && inmueble.imagen) || undefined,
          custom_instructions: `Tono: ${s.cfg.tone}. Cada caption debe ser claramente diferente al resto.`
        })
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Error')
      const captions = json.captions || []
      captions.forEach((c, i) => {
        const idx = (typeof c.index === 'number' ? c.index - 1 : i)
        if (s.posts[idx]) {
          s.posts[idx].caption = c.caption
          s.posts[idx].vibe = c.vibe
        }
      })
      regenerateMediaAssignments()
      mount()
      window.rmToast?.(`✓ ${captions.length} captions generados`, 'success')
    } catch (err) {
      status.textContent = '✗ ' + err.message; status.classList.add('error')
      window.rmToast?.(err.message, 'error')
    } finally {
      btn.disabled = false
    }
  }

  async function regenerateOneCaption(idx) {
    const post = s.posts[idx]
    if (!post) return
    const inmueble = getSelectedInmueble()
    const empresaId = empresaIdFromStorage()
    try {
      const r = await fetch('/api/ai?action=caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({
          inmueble: inmueble ? toLegacyInmueble(inmueble) : null,
          platform: s.cfg.platform,
          vibe: post.vibe || 'enfoque diferente al anterior',
          reference_image_url: (inmueble && inmueble.imagen) || undefined,
          custom_instructions: `Tono: ${s.cfg.tone}. Distinto al resto de captions de esta campaña.`
        })
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Error')
      post.caption = json.caption
      mount()
      window.rmToast?.('✓ Caption regenerado', 'success')
    } catch (err) {
      window.rmToast?.('✗ ' + err.message, 'error')
    }
  }

  async function regenerateOneImage(idx) {
    const post = s.posts[idx]
    if (!post) return
    if (!confirm('Generar imagen IA cuesta ~$0.04. ¿Continuar?')) return
    const inmueble = getSelectedInmueble()
    const empresaId = empresaIdFromStorage()
    try {
      const r = await fetch('/api/ai?action=image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({
          inmueble: inmueble ? toLegacyInmueble(inmueble) : null,
          reference_image_url: (inmueble && inmueble.imagen) || '',
          custom_instructions: `Variante #${idx + 1} — ${post.vibe || 'enfoque diferente'}.`,
          size: '1024x1024',
          platform: s.cfg.platform
        })
      })
      const text = await r.text()
      let json = {}
      try { json = JSON.parse(text) } catch (_) { json = { error: 'Respuesta inesperada' } }
      if (!r.ok) throw new Error(json.error || 'Error')
      post.mediaKind = 'image'; post.mediaUrl = json.url; post._userPickedMedia = true
      mount()
      window.rmToast?.('✓ Imagen IA lista', 'success')
    } catch (err) {
      window.rmToast?.('✗ ' + err.message, 'error')
    }
  }

  function toggleMediaKind(idx) {
    const post = s.posts[idx]
    if (!post) return
    const videos = s.assets.filter(a => a.kind === 'video' && a.status === 'ready')
    if (post.mediaKind === 'video') {
      const inmueble = getSelectedInmueble()
      post.mediaKind = 'image'; post.mediaUrl = (inmueble && inmueble.imagen) || ''
      post._userPickedMedia = true
    } else {
      if (!videos.length) { window.rmToast?.('Sube al menos un video primero', 'warning'); return }
      const v = videos[idx % videos.length]
      post.mediaKind = 'video'; post.mediaUrl = v.url
      post._userPickedMedia = true
    }
    mount()
  }

  // ── Step 4: confirm & schedule ────────────────────────────

  function confirmAndSchedule() {
    const status = document.getElementById('cb-confirm-status')
    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    if (!meta.access_token) {
      status.innerHTML = '✗ Faltan credenciales Meta. <a href="#settings" style="color:var(--rm-green-deep); text-decoration:underline;">Configurar →</a>'
      status.classList.add('error'); return
    }
    const inmueble = getSelectedInmueble()
    const campaignId = 'camp_' + Date.now()
    const campaignName = `Campaña — ${inmueble ? (inmueble.proyecto || inmueble.tipo || 'Inmueble') : 'Solo videos'} · ${s.cfg.days}d`

    const all = loadScheduled()
    const ready = s.posts.filter(p => p.caption && p.mediaUrl)
    let created = 0
    for (const p of ready) {
      const post = {
        id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + p.idx,
        campaignId,
        campaignName,
        platform: s.cfg.platform,
        imageUrl: p.mediaUrl,        // legacy field — works for both image+video URLs in /app
        mediaKind: p.mediaKind,      // 'image' | 'video' — used for routing
        videoUrl: p.mediaKind === 'video' ? p.mediaUrl : null,
        caption: p.caption,
        scheduledAt: p.scheduledAt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        inventarioId: inmueble ? inmueble.id : null,
        vibe: p.vibe
      }
      all.push(post)
      armTimer(post)
      created++
    }
    saveScheduled(all)
    status.textContent = `✓ ${created} posts programados`; status.classList.remove('error'); status.classList.add('success')
    window.rmToast?.(`✓ Campaña creada: ${created} posts programados`, 'success')

    // Reset wizard but keep view to show the scheduled list
    s = freshState()
    setTimeout(mount, 600)
  }

  // ── Scheduler engine (image OR video) ─────────────────────

  const armed = new Map()

  function armTimer(post) {
    if (armed.has(post.id)) return
    const due = new Date(post.scheduledAt).getTime() - Date.now()
    if (due <= 0) {
      updateOne(post.id, { status: 'expired' })
      return
    }
    if (due > 7 * 24 * 60 * 60 * 1000) return    // > 7 days, setTimeout unsafe
    const tid = setTimeout(() => publishScheduled(post.id), due)
    armed.set(post.id, tid)
  }

  function rearmAll() {
    for (const tid of armed.values()) clearTimeout(tid)
    armed.clear()
    const all = loadScheduled()
    let modified = false
    for (const p of all) {
      if (p.status === 'processing' && p.containerId) {
        // Resume video publish polling — the user may have closed the tab
        // before Meta finished processing the container.
        setTimeout(() => resumeVideoPublish(p.id), 5000)
        continue
      }
      if (p.status !== 'pending') continue
      const due = new Date(p.scheduledAt).getTime() - Date.now()
      if (due <= 0) { updateOne(p.id, { status: 'expired' }); modified = true; continue }
      armTimer(p)
    }
    if (modified && window.rmRouter?.currentPage() === 'schedule') mount()
  }
  window.rmFromSchedSetTimers = rearmAll

  async function publishScheduled(id) {
    const post = loadScheduled().find(p => p.id === id)
    if (!post || post.status !== 'pending') return
    updateOne(id, { status: 'publishing' })
    try {
      let meta = {}
      try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
      if (!meta.access_token) throw new Error('Sin token')
      const empresaId = empresaIdFromStorage()
      const headers = { 'Content-Type': 'application/json', 'x-empresa-id': empresaId, 'x-meta-token': meta.access_token }
      if (meta.page_id) headers['x-meta-page-id'] = meta.page_id
      if (meta.ad_account_id) headers['x-meta-ad-account-id'] = meta.ad_account_id
      if (meta.waba_id) headers['x-waba-id'] = meta.waba_id
      if (meta.phone_number_id) headers['x-meta-phone-number-id'] = meta.phone_number_id
      if (meta.ig_user_id) headers['x-meta-ig-user-id'] = meta.ig_user_id

      const isVideo = post.mediaKind === 'video' || (post.videoUrl && post.videoUrl.length) || (post.imageUrl && VIDEO_EXT_RE.test(post.imageUrl))
      const body = {
        platform: post.platform,
        caption: post.caption,
        empresa_id: empresaId,
        inventario_id: post.inventarioId || null
      }
      if (isVideo) {
        body.media_type = 'video'
        body.video_url = post.videoUrl || post.imageUrl
      } else {
        body.image_url = post.imageUrl
      }

      const r = await fetch('/api/social-post', {
        method: 'POST', headers, body: JSON.stringify(body)
      })
      const text = await r.text()
      let data = {}
      try { data = JSON.parse(text) } catch (_) { data = { error: 'Respuesta inesperada' } }

      if (r.status === 202 && data.status === 'processing' && data.container_id) {
        // Video aún procesando — guardar container_id y reintentar en 60s
        updateOne(id, { status: 'processing', containerId: data.container_id })
        setTimeout(() => resumeVideoPublish(id), 60000)
        window.rmToast?.('Video procesando · reintentaré en 60s', 'info')
        return
      }

      if (!r.ok) throw new Error((data.error || 'Error') + (data.detail ? ' — ' + data.detail : ''))
      updateOne(id, { status: 'published', postUrl: data.url, publishedAt: new Date().toISOString(), error: null })
      window.rmToast?.('✓ Post publicado: ' + post.caption.slice(0, 40) + '…', 'success')
    } catch (err) {
      updateOne(id, { status: 'failed', error: err.message })
      window.rmToast?.('✗ Falló post programado · ' + err.message, 'error')
    } finally {
      if (window.rmRouter?.currentPage() === 'schedule') mount()
    }
  }

  async function resumeVideoPublish(id) {
    const post = loadScheduled().find(p => p.id === id)
    if (!post || post.status !== 'processing' || !post.containerId) return
    try {
      let meta = {}
      try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
      const empresaId = empresaIdFromStorage()
      const headers = { 'Content-Type': 'application/json', 'x-empresa-id': empresaId, 'x-meta-token': meta.access_token }
      if (meta.page_id) headers['x-meta-page-id'] = meta.page_id
      if (meta.ig_user_id) headers['x-meta-ig-user-id'] = meta.ig_user_id

      const r = await fetch('/api/social-post?action=video-status', {
        method: 'POST', headers,
        body: JSON.stringify({ container_id: post.containerId, empresa_id: empresaId })
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Error')
      if (json.status === 'processing') {
        // still processing, retry again
        setTimeout(() => resumeVideoPublish(id), 60000)
        return
      }
      if (json.status === 'published') {
        updateOne(id, { status: 'published', postUrl: json.url, publishedAt: new Date().toISOString() })
        window.rmToast?.('✓ Video publicado', 'success')
      }
    } catch (err) {
      updateOne(id, { status: 'failed', error: err.message })
      window.rmToast?.('✗ Video falló: ' + err.message, 'error')
    } finally {
      if (window.rmRouter?.currentPage() === 'schedule') mount()
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  function empresaIdFromStorage() {
    try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' }
  }

  function toLegacyInmueble(p) {
    return {
      id: p.id,
      proyecto: p.proyecto,
      nombre_barrio: p.proyecto,
      tipo: p.tipo,
      tipo_inmueble_propiedad: p.tipo,
      ciudad: p.ciudad,
      nombre_ciudad: p.ciudad,
      descripcion: p.descripcion,
      image_link_1: p.imagen
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'schedule') mount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    rearmAll()
    if ((window.rmRouter?.currentPage() || 'studio') === 'schedule') mount()
  })
})()
