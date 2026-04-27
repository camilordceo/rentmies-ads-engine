/* ─────────────────────────────────────────────────────────────
   Quick Post — port of the working flow from /app to /dashboard.
   Uses /api/social-post + /api/ai with localStorage.meta_creds.
   Inmueble selection is decoupled: choose from a strip OR paste
   any URL OR upload a file. Caption is manual or AI-generated.
   "Pauta pagada" is collapsed under <details> — never required.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i

  let state = {
    selectedInmuebleId: '',
    inmuebles: [],
    inmuebleSource: '',
    customImageUrl: '',
    customInstructions: '',
    caption: '',
    platform: 'instagram',
    aiSize: '1024x1024',
    mediaKind: 'image'   // 'image' | 'video' — derived from URL/mime
  }

  const { escapeHtml, escapeAttr, cardHtml } = (window.rmInmuebles || {})

  function detectMediaKind(url) {
    if (!url) return 'image'
    return VIDEO_EXT_RE.test(url) ? 'video' : 'image'
  }

  // ── Render ────────────────────────────────────────────────

  function html() {
    return `
      <div class="ae-page-shell ae-rise">

        <header class="ae-page-head">
          <span class="ae-eyebrow">PUBLICAR EN INSTAGRAM / FACEBOOK</span>
          <h1 class="ae-display"><span class="ae-display-prefix">Quick</span> <em>Post</em></h1>
          <p class="ae-subhead">Selecciona un inmueble (o pega cualquier imagen), escribe el caption — manual o con IA — y publica. Sin pauta requerida.</p>
        </header>

        <div class="ae-workspace">
          <div class="ae-workspace-col">

            <!-- Inmueble selector strip -->
            <div class="ae-formcard">
              <div class="ae-formcard-h">
                <span>1. Inmueble</span>
                <span class="ae-formcard-h-accessory" id="qp-inmueble-source">cargando…</span>
              </div>
              <div id="qp-inmueble-strip" class="ae-prop-strip"></div>
              <div class="ae-help info" style="margin-top:10px;">
                <strong>Lead-magnet flow:</strong> también puedes saltarte el inmueble y pegar cualquier URL o subir una foto en el siguiente bloque.
              </div>
            </div>

            <!-- Image -->
            <div class="ae-formcard">
              <div class="ae-formcard-h">
                <span>2. Imagen</span>
                <span class="ae-formcard-h-accessory" id="qp-img-status"></span>
              </div>
              <div class="ae-grid-2">
                <div class="ae-field">
                  <label class="ae-field-label" for="qp-img-url">URL pública de imagen o video</label>
                  <input id="qp-img-url" class="ae-input" type="url" placeholder="https://…  (imagen .jpg / video .mp4)" />
                </div>
                <div class="ae-field">
                  <label class="ae-field-label" for="qp-img-file">O sube imagen (≤3MB) o video (≤250MB)</label>
                  <input id="qp-img-file" class="ae-input" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" style="padding:7px 10px; font-size:11px;" />
                </div>
              </div>

              <details class="ae-optional" style="margin-top:14px;">
                <summary>✨ Generar imagen con IA <span style="margin-left:auto; color:var(--rm-muted); font-weight:500;">opcional</span></summary>
                <div class="ae-optional-body">
                  <div class="ae-field">
                    <label class="ae-field-label" for="qp-ai-instructions">Instrucciones extras (opcional)</label>
                    <input id="qp-ai-instructions" class="ae-input" type="text" placeholder='Ej: banda inferior con "DESDE $4M/mes" en verde Rentmies' />
                    <div class="ae-field-hint">La IA tomará la imagen del inmueble como base. Si pides texto en la imagen, gpt-image-1 lo renderiza.</div>
                  </div>
                  <div class="ae-grid-2">
                    <div class="ae-field">
                      <label class="ae-field-label" for="qp-ai-size">Formato</label>
                      <select id="qp-ai-size" class="ae-select">
                        <option value="1024x1024">Cuadrado 1:1 — Feed (recomendado)</option>
                        <option value="1536x1024">Horizontal 3:2 — Feed FB</option>
                        <option value="1024x1536">Vertical 2:3 — Stories / Reels</option>
                      </select>
                    </div>
                    <div class="ae-field" style="display:flex; flex-direction:column; justify-content:flex-end;">
                      <button type="button" class="ae-btn-authority" id="qp-ai-image-btn">✨ Generar imagen</button>
                    </div>
                  </div>
                  <div id="qp-ai-image-status" style="font-size:11px; color:var(--rm-muted);"></div>
                </div>
              </details>

              <div id="qp-img-preview-wrap" style="margin-top:14px; display:none;">
                <div class="ae-img-preview" id="qp-img-preview" role="img" aria-label="Preview de la imagen"></div>
              </div>
            </div>

            <!-- Caption -->
            <div class="ae-formcard">
              <div class="ae-formcard-h">
                <span>3. Caption</span>
                <span class="ae-formcard-h-accessory" id="qp-caption-status"></span>
              </div>
              <div class="ae-field">
                <textarea id="qp-caption" class="ae-textarea" rows="6" placeholder="Escribe el texto del post o usa el botón de IA abajo…"></textarea>
                <div class="ae-action-row" style="margin-top:10px;">
                  <button type="button" class="ae-btn-ghost" id="qp-ai-caption-btn">✨ Generar caption con IA</button>
                  <button type="button" class="ae-btn-ghost" id="qp-caption-template-btn">Plantilla rápida (sin IA)</button>
                </div>
              </div>
            </div>

            <!-- Platform + Publish -->
            <div class="ae-formcard">
              <div class="ae-formcard-h">
                <span>4. Publicar</span>
                <span class="ae-formcard-h-accessory">Sin pauta · publicación orgánica</span>
              </div>
              <div class="ae-grid-2">
                <div class="ae-field">
                  <label class="ae-field-label" for="qp-platform">Plataforma</label>
                  <select id="qp-platform" class="ae-select">
                    <option value="instagram">📷 Instagram Business</option>
                    <option value="facebook_page">📘 Facebook Page</option>
                  </select>
                </div>
              </div>
              <div class="ae-action-row" style="margin-top:14px;">
                <button type="button" class="ae-btn-primary" id="qp-publish-btn" style="font-size:12px; padding:11px 18px;">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  PUBLICAR AHORA
                </button>
                <span class="ae-status-line" id="qp-publish-status"></span>
              </div>

              <details class="ae-optional" style="margin-top:18px;">
                <summary>💸 Pauta pagada (opcional) <span style="margin-left:auto; color:var(--rm-muted); font-weight:500;">próximamente</span></summary>
                <div class="ae-optional-body">
                  <div class="ae-help warn">
                    La integración de Meta Ads (boost paga) viene en una iteración futura. Por ahora el botón "Publicar ahora" hace publicación orgánica que es 100% gratis y aparece en el feed normal de tu página / cuenta.
                  </div>
                </div>
              </details>
            </div>

          </div>

          <aside class="ae-workspace-col ae-workspace-aside">

            <!-- Meta credentials check -->
            <div class="ae-formcard compact" id="qp-creds-card">
              <div class="ae-formcard-h" style="margin-bottom:10px;"><span>Credenciales Meta</span></div>
              <div id="qp-creds-status" style="font-size:12px; line-height:1.5;"></div>
              <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <a href="#settings" class="ae-btn-ghost" style="font-size:11px; padding:6px 10px;">Ir a Settings</a>
              </div>
            </div>

            <!-- Live preview -->
            <div class="ae-formcard compact">
              <div class="ae-formcard-h" style="margin-bottom:10px;"><span>Preview</span></div>
              <div id="qp-preview-block">
                <div class="ae-help">Selecciona un inmueble o escribe caption para ver el preview.</div>
              </div>
            </div>

          </aside>
        </div>

      </div>
    `
  }

  // ── Wiring ────────────────────────────────────────────────

  async function mount() {
    const slot = document.querySelector('section[data-page="quickpost"]')
    if (!slot) return
    slot.innerHTML = html()

    // Load inmuebles in parallel with renderers
    if (window.rmInmuebles) {
      const { items, source } = await window.rmInmuebles.load()
      state.inmuebles = items
      state.inmuebleSource = source
      // Auto-select the first one
      if (items.length && !state.selectedInmuebleId) state.selectedInmuebleId = items[0].id
      renderInmuebleStrip()
    }

    refreshCredsCard()
    wire()
    syncFromState()
  }

  function renderInmuebleStrip() {
    const strip = document.querySelector('#qp-inmueble-strip')
    const source = document.querySelector('#qp-inmueble-source')
    if (!strip) return
    if (!state.inmuebles.length) {
      strip.innerHTML = '<div class="ae-help">No hay inmuebles cargados. Ve a la sección Inmuebles o pega un URL en el siguiente bloque.</div>'
      if (source) source.textContent = 'sin inventario'
      return
    }
    strip.innerHTML = state.inmuebles.map(p => cardHtml(p, { selectedId: state.selectedInmuebleId })).join('')
    if (source) source.textContent = state.inmuebleSource === 'starter' ? 'inmuebles de muestra' : `${state.inmuebles.length} inmuebles`

    strip.querySelectorAll('[data-inmueble-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedInmuebleId = btn.dataset.inmuebleId
        renderInmuebleStrip()
        syncFromState()
      })
    })
  }

  function getSelectedInmueble() {
    return state.inmuebles.find(p => p.id === state.selectedInmuebleId) || null
  }

  function refreshCredsCard() {
    const status = document.querySelector('#qp-creds-status')
    if (!status) return
    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    if (!meta.access_token) {
      status.innerHTML = `
        <span style="color:var(--rm-red); font-weight:600;">⚠ Sin Access Token</span>
        <div style="color:var(--rm-muted); margin-top:4px;">No podrás publicar hasta que guardes tus credenciales de Meta.</div>
      `
      return
    }
    const masked = meta.access_token.slice(0, 6) + '…' + meta.access_token.slice(-4)
    const igLine = meta.ig_user_id ? `<div style="color:var(--rm-green-deep); font-size:11px;">IG ID: <code class="rm-mono">${escapeHtml(meta.ig_user_id)}</code></div>` :
                   meta.page_id ? `<div style="color:var(--rm-muted); font-size:11px;">Page ID: <code class="rm-mono">${escapeHtml(meta.page_id)}</code></div>` :
                   `<div style="color:var(--rm-amber); font-size:11px;">Sin Page ID — necesario para IG.</div>`
    status.innerHTML = `
      <span style="color:var(--rm-green-deep); font-weight:600;">✓ Token guardado</span>
      <div style="color:var(--rm-muted); font-family:var(--rm-mono); font-size:11px; margin-top:4px;">${escapeHtml(masked)}</div>
      ${igLine}
    `
  }

  function wire() {
    document.getElementById('qp-img-url').addEventListener('input', e => {
      state.customImageUrl = e.target.value.trim()
      syncFromState()
    })
    document.getElementById('qp-img-file').addEventListener('change', handleFileUpload)

    document.getElementById('qp-platform').addEventListener('change', e => state.platform = e.target.value)
    document.getElementById('qp-caption').addEventListener('input', e => { state.caption = e.target.value; updatePreview() })

    document.getElementById('qp-ai-caption-btn').addEventListener('click', generateAICaption)
    document.getElementById('qp-ai-image-btn').addEventListener('click', generateAIImage)
    document.getElementById('qp-caption-template-btn').addEventListener('click', generateTemplate)
    document.getElementById('qp-publish-btn').addEventListener('click', publishNow)

    document.getElementById('qp-ai-instructions').addEventListener('input', e => state.customInstructions = e.target.value.trim())
    document.getElementById('qp-ai-size').addEventListener('change', e => state.aiSize = e.target.value)
  }

  function syncFromState() {
    // Media URL — manual takes priority over inmueble
    const inmueble = getSelectedInmueble()
    const effectiveUrl = state.customImageUrl || (inmueble && inmueble.imagen) || ''
    // Auto-detect video by URL extension if user pasted one
    if (state.customImageUrl) state.mediaKind = detectMediaKind(state.customImageUrl)
    else if (effectiveUrl) state.mediaKind = detectMediaKind(effectiveUrl)
    document.getElementById('qp-img-url').value = state.customImageUrl
    setMediaPreview(effectiveUrl, state.mediaKind)
    updatePreview()
    refreshCredsCard()
  }

  function setMediaPreview(url, kind) {
    const wrap = document.getElementById('qp-img-preview-wrap')
    const block = document.getElementById('qp-img-preview')
    if (!url) {
      block.style.backgroundImage = ''
      block.classList.remove('video-mode')
      block.innerHTML = ''
      wrap.style.display = 'none'
      return
    }
    if (kind === 'video') {
      block.style.backgroundImage = ''
      block.classList.add('video-mode')
      const safe = url.replace(/"/g, '&quot;')
      block.innerHTML = `<video src="${safe}" controls muted preload="metadata" playsinline></video>`
    } else {
      block.classList.remove('video-mode')
      block.innerHTML = ''
      block.style.backgroundImage = `url('${url.replace(/'/g, "\\'")}')`
    }
    wrap.style.display = ''
  }

  function updatePreview() {
    const block = document.getElementById('qp-preview-block')
    if (!block) return
    const inmueble = getSelectedInmueble()
    const effectiveUrl = state.customImageUrl || (inmueble && inmueble.imagen) || ''
    const kind = effectiveUrl ? detectMediaKind(effectiveUrl) : 'image'
    const headline = inmueble ? `${inmueble.proyecto || 'Inmueble'} · ${inmueble.ciudad || ''}`.replace(/ · $/, '') : (state.customImageUrl ? (kind === 'video' ? 'Video propio' : 'Imagen propia') : 'Sin inmueble')
    const cap = state.caption.slice(0, 140)
    const platformLabel = state.platform === 'instagram' ? (kind === 'video' ? 'IG · Reels' : 'IG · Feed') : 'FB · Page'

    let mediaHtml
    if (!effectiveUrl) {
      mediaHtml = `<div class="ae-img-preview" style="display:flex; align-items:center; justify-content:center; color:var(--rm-muted); font-size:12px;">Sin media</div>`
    } else if (kind === 'video') {
      mediaHtml = `<div class="ae-img-preview video-mode"><video src="${effectiveUrl.replace(/"/g, '&quot;')}" muted preload="metadata" playsinline></video></div>`
    } else {
      mediaHtml = `<div class="ae-img-preview" style="background-image: url('${effectiveUrl.replace(/'/g, "\\'")}');"></div>`
    }

    block.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${mediaHtml}
        <div>
          <div style="font-size:13px; font-weight:600; color:var(--rm-ink);">${escapeHtml(headline)}</div>
          <div style="font-size:11px; color:var(--rm-muted); font-family:var(--rm-mono); margin-top:2px;">${escapeHtml(platformLabel)}</div>
          ${cap ? `<div style="font-size:11.5px; color:var(--rm-ink-2); margin-top:8px; line-height:1.5; white-space:pre-wrap;">${escapeHtml(cap)}${state.caption.length > 140 ? '…' : ''}</div>` : ''}
        </div>
      </div>
    `
  }

  // ── File upload (Supabase via /api/ai?action=upload-ref) ──

  async function handleFileUpload(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const status = document.getElementById('qp-img-status')
    const isVideo = /^video\//i.test(file.type) || VIDEO_EXT_RE.test(file.name)

    if (isVideo) {
      if (file.size > 250 * 1024 * 1024) {
        status.textContent = '✗ Video > 250 MB'; e.target.value = ''; return
      }
      status.textContent = '⏳ Pidiendo URL…'
      try {
        const empresaId = empresaIdFromStorage()
        const r1 = await fetch('/api/ai?action=video-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
          body: JSON.stringify({ filename: file.name, contentType: file.type })
        })
        const meta = await r1.json()
        if (!r1.ok) throw new Error(meta.error || 'No se pudo obtener URL')
        status.textContent = `⏳ Subiendo video… (${(file.size / 1024 / 1024).toFixed(1)}MB)`
        const r2 = await fetch(meta.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'video/mp4', 'x-upsert': 'false' },
          body: file
        })
        if (!r2.ok) {
          const t = await r2.text().catch(() => '')
          throw new Error(`Upload falló (${r2.status}) ${t.slice(0, 80)}`)
        }
        state.customImageUrl = meta.publicUrl
        state.mediaKind = 'video'
        document.getElementById('qp-img-url').value = meta.publicUrl
        status.textContent = '✓ Video subido'
        syncFromState()
      } catch (err) {
        status.textContent = '✗ ' + err.message
      }
      return
    }

    // Image flow (legacy)
    if (file.size > 3 * 1024 * 1024) {
      status.textContent = '✗ Imagen > 3 MB'; e.target.value = ''; return
    }
    status.textContent = '⏳ Subiendo imagen…'
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(r.error)
        r.readAsDataURL(file)
      })
      const base64 = String(dataUrl).split(',')[1]
      const empresaId = empresaIdFromStorage()
      const r = await fetch('/api/ai?action=upload-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({ data: base64, contentType: file.type, filename: file.name })
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Upload falló')
      state.customImageUrl = json.url
      state.mediaKind = 'image'
      document.getElementById('qp-img-url').value = json.url
      status.textContent = '✓ Imagen subida'
      syncFromState()
    } catch (err) {
      status.textContent = '✗ ' + err.message
    }
  }

  // ── AI helpers ─────────────────────────────────────────────

  async function generateAICaption() {
    const inmueble = getSelectedInmueble()
    const status = document.getElementById('qp-caption-status')
    const btn = document.getElementById('qp-ai-caption-btn')
    if (!inmueble && !state.customImageUrl && !state.customInstructions) {
      status.textContent = '✗ Selecciona inmueble, agrega imagen o escribe instrucciones'
      return
    }
    status.textContent = '⏳ Generando…'; btn.disabled = true
    try {
      const empresaId = empresaIdFromStorage()
      const r = await fetch('/api/ai?action=caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({
          inmueble: inmueble ? toLegacyInmueble(inmueble) : null,
          platform: state.platform,
          reference_image_url: state.customImageUrl || (inmueble && inmueble.imagen) || undefined,
          custom_instructions: state.customInstructions || undefined
        })
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Error')
      state.caption = json.caption
      document.getElementById('qp-caption').value = json.caption
      status.textContent = '✓ Caption generado'
      updatePreview()
    } catch (err) {
      status.textContent = '✗ ' + err.message
    } finally { btn.disabled = false }
  }

  async function generateAIImage() {
    const inmueble = getSelectedInmueble()
    const status = document.getElementById('qp-ai-image-status')
    const btn = document.getElementById('qp-ai-image-btn')
    const refUrl = state.customImageUrl || (inmueble && inmueble.imagen) || ''
    status.textContent = '⏳ Generando imagen IA (30–60s)…'
    btn.disabled = true
    try {
      const empresaId = empresaIdFromStorage()
      const r = await fetch('/api/ai?action=image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({
          inmueble: inmueble ? toLegacyInmueble(inmueble) : null,
          reference_image_url: refUrl,
          custom_instructions: state.customInstructions,
          size: state.aiSize,
          platform: state.platform
        })
      })
      const text = await r.text()
      let json = {}
      try { json = JSON.parse(text) } catch (_) { json = { error: 'Respuesta inesperada' } }
      if (!r.ok) throw new Error((json.error || 'Error') + (json.detail ? ' — ' + json.detail : ''))
      state.customImageUrl = json.url
      document.getElementById('qp-img-url').value = json.url
      const refMsg = json.reference_used ? ' (usó la foto base como referencia)' : ' (de cero)'
      status.textContent = `✓ Imagen lista${refMsg}`
      syncFromState()
    } catch (err) {
      status.textContent = '✗ ' + err.message
    } finally { btn.disabled = false }
  }

  function generateTemplate() {
    const inmueble = getSelectedInmueble()
    const headline = inmueble ? `${inmueble.proyecto || 'Inmueble disponible'}${inmueble.ciudad ? ' · ' + inmueble.ciudad : ''}` : 'Inmueble disponible'
    const ciudad = (inmueble?.ciudad || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')
    const tipo = (inmueble?.tipo || 'inmueble').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')
    state.caption = `🏠 ${headline}\n\n✅ Disponible ahora\n📍 Ubicación premium\n💬 Escríbenos por WhatsApp para agendar visita\n\n#rentmies${ciudad ? ' #' + ciudad : ''}${tipo ? ' #' + tipo : ''} #inmobiliaria`
    document.getElementById('qp-caption').value = state.caption
    updatePreview()
  }

  // ── Publish ───────────────────────────────────────────────

  async function publishNow() {
    const status = document.getElementById('qp-publish-status')
    const btn = document.getElementById('qp-publish-btn')
    status.classList.remove('success', 'error')

    const inmueble = getSelectedInmueble()
    const mediaUrl = state.customImageUrl || (inmueble && inmueble.imagen) || ''
    const isVideo = mediaUrl ? detectMediaKind(mediaUrl) === 'video' : false
    const caption = state.caption.trim()

    if (!caption) { status.textContent = '✗ Escribe un caption'; status.classList.add('error'); return }

    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    if (!meta.access_token) {
      status.innerHTML = '✗ Faltan credenciales Meta. <a href="#settings" style="color:var(--rm-green-deep); text-decoration:underline;">Configurarlas →</a>'
      status.classList.add('error')
      return
    }

    if (state.platform === 'instagram' && !mediaUrl) {
      status.textContent = '✗ Instagram requiere imagen o video'; status.classList.add('error'); return
    }

    btn.disabled = true; btn.textContent = isVideo ? '⏳ Subiendo video a Meta…' : '⏳ Publicando…'
    status.textContent = isVideo ? 'Procesando video — puede tardar 30-90s' : ''

    const empresaId = empresaIdFromStorage()
    const headers = {
      'Content-Type': 'application/json',
      'x-empresa-id': empresaId,
      'x-meta-token': meta.access_token
    }
    if (meta.page_id)         headers['x-meta-page-id']        = meta.page_id
    if (meta.ad_account_id)   headers['x-meta-ad-account-id']  = meta.ad_account_id
    if (meta.waba_id)         headers['x-waba-id']             = meta.waba_id
    if (meta.phone_number_id) headers['x-meta-phone-number-id']= meta.phone_number_id
    if (meta.ig_user_id)      headers['x-meta-ig-user-id']     = meta.ig_user_id

    try {
      const body = {
        platform: state.platform,
        caption,
        empresa_id: empresaId,
        inventario_id: inmueble ? inmueble.id : null
      }
      if (isVideo) { body.media_type = 'video'; body.video_url = mediaUrl }
      else { body.image_url = mediaUrl }

      const r = await fetch('/api/social-post', {
        method: 'POST', headers, body: JSON.stringify(body)
      })
      const text = await r.text()
      let data = {}
      try { data = JSON.parse(text) } catch (_) { data = { error: 'Respuesta inesperada' } }

      if (r.status === 202 && data.status === 'processing' && data.container_id) {
        // IG video still processing — poll in background
        status.innerHTML = '⏳ Video procesando en Meta · reintentando…'
        await pollVideoUntilDone(data.container_id, headers, empresaId, status)
        // pollVideoUntilDone updates status itself
        return
      }

      if (!r.ok) throw new Error((data.error || 'Error') + (data.detail ? ' — ' + data.detail : ''))

      status.innerHTML = `✓ Publicado · <a href="${escapeAttr(data.url)}" target="_blank" rel="noopener" style="color:var(--rm-green-deep); text-decoration:underline;">ver post →</a>`
      status.classList.add('success')
      window.rmToast?.((isVideo ? 'Video publicado en ' : 'Post publicado en ') + (state.platform === 'instagram' ? 'Instagram' : 'Facebook'), 'success')

      state.caption = ''
      document.getElementById('qp-caption').value = ''
      updatePreview()
    } catch (err) {
      status.textContent = '✗ ' + err.message
      status.classList.add('error')
      window.rmToast?.('Error: ' + err.message, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> PUBLICAR AHORA'
    }
  }

  async function pollVideoUntilDone(containerId, headers, empresaId, status) {
    const maxAttempts = 6   // 6 * 30s = 3 min total
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 30000))
      try {
        const r = await fetch('/api/social-post?action=video-status', {
          method: 'POST', headers,
          body: JSON.stringify({ container_id: containerId, empresa_id: empresaId })
        })
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'Error')
        if (json.status === 'published') {
          status.innerHTML = `✓ Video publicado · <a href="${escapeAttr(json.url)}" target="_blank" rel="noopener" style="color:var(--rm-green-deep); text-decoration:underline;">ver post →</a>`
          status.classList.add('success')
          window.rmToast?.('Video publicado', 'success')
          state.caption = ''
          document.getElementById('qp-caption').value = ''
          updatePreview()
          return
        }
        if (json.status === 'processing') {
          status.innerHTML = `⏳ Video aún procesando (intento ${i + 1}/${maxAttempts})…`
          continue
        }
      } catch (err) {
        status.textContent = '✗ ' + err.message
        status.classList.add('error')
        return
      }
    }
    status.innerHTML = '⚠ Timeout — el video sigue procesando en Meta. Revisa tu IG en unos minutos.'
  }

  // ── Helpers ───────────────────────────────────────────────

  function empresaIdFromStorage() {
    try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' }
  }

  // Maps the new normalized shape to the legacy {nombre_barrio, tipo_inmueble_propiedad,...}
  // shape that /api/ai expects.
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

  // ── Page lifecycle ────────────────────────────────────────

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'quickpost') mount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'quickpost') mount()
  })
})()
