/* ─────────────────────────────────────────────────────────────
   Programar — multi-post scheduling.
   Reuses localStorage 'rm_scheduled_posts' so any posts the user
   already scheduled in /app show up here, and any new ones here
   work in /app too.
   For FASE 4 we ship the SCHEDULER + LIST. The full N-slot wizard
   stays in /app for now (it works, no need to duplicate yet).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const SCHED_KEY = 'rm_scheduled_posts'

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) }
  function escapeAttr(s) { return escapeHtml(s) }

  function loadScheduled() {
    try { return JSON.parse(localStorage.getItem(SCHED_KEY) || '[]') } catch (_) { return [] }
  }
  function saveScheduled(arr) { localStorage.setItem(SCHED_KEY, JSON.stringify(arr)) }
  function updateOne(id, patch) {
    const arr = loadScheduled()
    const idx = arr.findIndex(p => p.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...patch }; saveScheduled(arr) }
  }

  // ── Single-post scheduler form ────────────────────────────

  let formState = {
    inmuebleId: '',
    inmuebles: [],
    customImageUrl: '',
    caption: '',
    platform: 'instagram',
    scheduledAt: ''   // datetime-local string
  }

  // ── Render ────────────────────────────────────────────────

  function html() {
    const all = loadScheduled()
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

    const counts = all.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {})

    return `
      <div class="ae-page-shell ae-rise">

        <header class="ae-page-head">
          <span class="ae-eyebrow">PROGRAMACIÓN · MULTI-POST</span>
          <h1 class="ae-display"><span class="ae-display-prefix">Programa</span> <em>posts a futuro</em></h1>
          <p class="ae-subhead">Cliente-side via setTimeout — mantén la pestaña abierta. Para programación robusta a largo plazo, el cron server-side viene después.</p>
        </header>

        <div class="ae-help warn">
          <strong>⚠ Beta:</strong> Esta vista programa posts individuales. La campaña multi-post completa (varias fotos a la vez con auto-spacing) sigue en
          <a href="/app" style="color:var(--rm-green-deep); text-decoration:underline;">/app · Campañas</a> mientras la portamos por completo. Lo que programes acá aparecerá en ambas vistas — comparten localStorage.
        </div>

        <!-- Quick scheduler -->
        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Programar un post</span>
            <span class="ae-formcard-h-accessory" id="sched-creds-status"></span>
          </div>

          <div class="ae-grid-2">
            <div class="ae-field">
              <label class="ae-field-label" for="sched-inmueble">Inmueble</label>
              <select id="sched-inmueble" class="ae-select">
                <option value="">— Sin inmueble (usa URL manual) —</option>
              </select>
            </div>
            <div class="ae-field">
              <label class="ae-field-label" for="sched-platform">Plataforma</label>
              <select id="sched-platform" class="ae-select">
                <option value="instagram">📷 Instagram</option>
                <option value="facebook_page">📘 Facebook</option>
              </select>
            </div>
          </div>

          <div class="ae-field" style="margin-top:14px;">
            <label class="ae-field-label" for="sched-img-url">URL de imagen (opcional — auto-llenado del inmueble)</label>
            <input id="sched-img-url" class="ae-input" type="url" placeholder="https://…" />
          </div>

          <div class="ae-field" style="margin-top:14px;">
            <label class="ae-field-label" for="sched-caption">Caption</label>
            <textarea id="sched-caption" class="ae-textarea" rows="4" placeholder="Texto del post…"></textarea>
          </div>

          <div class="ae-grid-2" style="margin-top:14px;">
            <div class="ae-field">
              <label class="ae-field-label" for="sched-when">Fecha y hora</label>
              <input id="sched-when" class="ae-input" type="datetime-local" />
            </div>
            <div class="ae-field" style="display:flex; flex-direction:column; justify-content:flex-end;">
              <button class="ae-btn-primary" id="sched-submit-btn">📅 PROGRAMAR POST</button>
            </div>
          </div>
          <div id="sched-form-status" style="font-size:11px; color:var(--rm-muted); margin-top:8px; min-height:18px;"></div>
        </section>

        <!-- Scheduled list -->
        <section>
          <div class="ae-formcard-h" style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--rm-border);">
            <span style="font-size:15px; font-weight:600; color:var(--rm-ink);">Posts programados</span>
            <span class="ae-formcard-h-accessory">
              ${counts.pending ? `<span class="ae-status pending" style="margin-right:6px;">${counts.pending} pendientes</span>` : ''}
              ${counts.published ? `<span class="ae-status scheduled" style="margin-right:6px;">${counts.published} publicados</span>` : ''}
              ${counts.failed ? `<span class="ae-status paused" style="margin-right:6px;">${counts.failed} fallidos</span>` : ''}
              ${all.length === 0 ? '<span class="ae-status pending">Vacío</span>' : ''}
            </span>
          </div>

          ${campaigns.length === 0
            ? `<div class="ae-help">Aún no has programado nada. Usa el formulario de arriba o ve a <a href="/app" style="color:var(--rm-green-deep); text-decoration:underline;">/app · Campañas</a> para multi-post.</div>`
            : campaigns.map(([cid, c]) => campaignHtml(cid, c)).join('')
          }
        </section>

      </div>
    `
  }

  function campaignHtml(cid, c) {
    const posts = c.posts.slice().sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    return `
      <div class="ae-formcard" style="margin-bottom:12px;">
        <div class="ae-formcard-h" style="margin-bottom:10px;">
          <span style="font-size:13px;">${escapeHtml(c.name)}</span>
          <button class="ae-btn-ghost" style="font-size:10px; padding:4px 9px;" data-delete-camp="${escapeAttr(cid)}">Borrar</button>
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
        const s = Math.floor((due % 60000) / 1000)
        countdown = m > 0 ? ` · ${m}m ${s}s` : ` · ${s}s`
      } else countdown = ' · ahora'
    }
    const linkHtml = p.postUrl ? ` · <a href="${escapeAttr(p.postUrl)}" target="_blank" style="color:var(--rm-green-deep); text-decoration:underline;">ver post</a>` : ''
    const errHtml = p.error ? `<div style="font-size:10px; color:var(--rm-red); margin-top:3px;">${escapeHtml(p.error)}</div>` : ''
    return `
      <div style="display:flex; gap:10px; align-items:flex-start; padding:10px 12px; background:var(--rm-surface-2); border:1px solid var(--rm-border); border-radius:5px;">
        ${p.imageUrl ? `<img src="${escapeAttr(p.imageUrl)}" style="width:42px; height:42px; border-radius:4px; object-fit:cover; flex-shrink:0;" onerror="this.style.opacity='0.3'">` : ''}
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; color:var(--rm-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml((p.caption || '').slice(0, 100))}</div>
          <div style="font-size:11px; color:var(--rm-muted); margin-top:3px; font-family:var(--rm-mono);">${p.platform === 'instagram' ? 'IG' : 'FB'} · ${dtStr}${countdown}${linkHtml}</div>
          ${errHtml}
        </div>
        <span class="ae-status ${({pending:'pending',publishing:'pending',published:'scheduled',failed:'paused',expired:'paused',cancelled:'paused'})[p.status] || 'pending'}" style="flex-shrink:0;">${p.status}</span>
      </div>
    `
  }

  // ── Wiring ────────────────────────────────────────────────

  async function mount() {
    const slot = document.querySelector('[data-page="schedule"]')
    if (!slot) return
    slot.innerHTML = html()

    // Hydrate inmuebles dropdown
    if (window.rmInmuebles) {
      const { items } = await window.rmInmuebles.load()
      formState.inmuebles = items
      const sel = document.getElementById('sched-inmueble')
      if (sel) {
        items.forEach(p => {
          const opt = document.createElement('option')
          opt.value = p.id
          opt.textContent = `${p.proyecto || 'Inmueble'} · ${p.tipo || ''} · ${p.ciudad || ''}`.replace(/\s*·\s*$/, '')
          opt.dataset.imagen = p.imagen || ''
          sel.appendChild(opt)
        })
      }
    }

    // Pre-select if coming from Inmuebles
    const preselect = sessionStorage.getItem('rm_schedule_preselect')
    if (preselect) {
      sessionStorage.removeItem('rm_schedule_preselect')
      const sel = document.getElementById('sched-inmueble')
      if (sel) {
        sel.value = preselect
        sel.dispatchEvent(new Event('change'))
      }
    }

    refreshCredsStatus()
    wire()

    // Tick countdowns every 1s while page is visible
    if (window._schedTicker) clearInterval(window._schedTicker)
    window._schedTicker = setInterval(() => {
      if (window.rmRouter?.currentPage() === 'schedule') {
        // Soft-update only the scheduled list area without losing focus on form inputs
        // For simplicity here we re-render only when a post status changes
      }
    }, 1000)
  }

  function refreshCredsStatus() {
    const el = document.getElementById('sched-creds-status')
    if (!el) return
    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    el.innerHTML = meta.access_token
      ? '<span class="ae-ai-badge">Token OK</span>'
      : '<span class="ae-status pending"><a href="#settings" style="color:inherit; text-decoration:underline;">Falta token</a></span>'
  }

  function wire() {
    document.getElementById('sched-inmueble').addEventListener('change', e => {
      formState.inmuebleId = e.target.value
      const opt = e.target.selectedOptions[0]
      if (opt && opt.dataset.imagen) {
        document.getElementById('sched-img-url').value = opt.dataset.imagen
        formState.customImageUrl = opt.dataset.imagen
      }
    })
    document.getElementById('sched-img-url').addEventListener('input', e => formState.customImageUrl = e.target.value.trim())
    document.getElementById('sched-caption').addEventListener('input', e => formState.caption = e.target.value)
    document.getElementById('sched-platform').addEventListener('change', e => formState.platform = e.target.value)
    document.getElementById('sched-when').addEventListener('input', e => formState.scheduledAt = e.target.value)
    document.getElementById('sched-submit-btn').addEventListener('click', submitSchedule)

    document.querySelectorAll('[data-delete-camp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.deleteCamp
        if (!confirm('¿Borrar todos los posts de este grupo?')) return
        const arr = loadScheduled().filter(p => (p.campaignId || 'standalone') !== cid)
        saveScheduled(arr)
        if (window.rmFromSchedSetTimers) window.rmFromSchedSetTimers()   // re-arm timers
        mount()
      })
    })
  }

  function submitSchedule() {
    const status = document.getElementById('sched-form-status')
    status.style.color = 'var(--rm-muted)'

    const imgUrl = formState.customImageUrl
    const caption = formState.caption.trim()
    const whenStr = formState.scheduledAt
    if (!caption) { status.textContent = '✗ Falta caption'; status.style.color = 'var(--rm-red)'; return }
    if (!whenStr) { status.textContent = '✗ Falta fecha/hora'; status.style.color = 'var(--rm-red)'; return }
    const when = new Date(whenStr)
    if (isNaN(when.getTime())) { status.textContent = '✗ Fecha inválida'; status.style.color = 'var(--rm-red)'; return }
    if (when.getTime() < Date.now() - 60000) { status.textContent = '✗ La fecha está en el pasado'; status.style.color = 'var(--rm-red)'; return }
    if (formState.platform === 'instagram' && !imgUrl) { status.textContent = '✗ IG requiere imagen'; status.style.color = 'var(--rm-red)'; return }

    let meta = {}
    try { meta = JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) {}
    if (!meta.access_token) {
      status.innerHTML = '✗ Faltan credenciales Meta. <a href="#settings" style="color:var(--rm-green-deep); text-decoration:underline;">Configurarlas →</a>'
      status.style.color = 'var(--rm-red)'
      return
    }

    const all = loadScheduled()
    const post = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      campaignId: 'standalone',
      campaignName: 'Posts individuales',
      platform: formState.platform,
      imageUrl: imgUrl,
      caption,
      scheduledAt: when.toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    all.push(post)
    saveScheduled(all)

    // Arm a setTimeout — when due, hit /api/social-post
    armTimer(post)

    status.textContent = '✓ Post programado'; status.style.color = 'var(--rm-green-deep)'
    window.rmToast?.(`Post programado para ${when.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`, 'success')

    // Reset caption only (keep inmueble + image for iteration)
    formState.caption = ''
    document.getElementById('sched-caption').value = ''

    setTimeout(mount, 100)   // re-render list
  }

  // ── setTimeout-based scheduler ────────────────────────────

  const armed = new Map()

  function armTimer(post) {
    if (armed.has(post.id)) return
    const due = new Date(post.scheduledAt).getTime() - Date.now()
    if (due <= 0) {
      updateOne(post.id, { status: 'expired' })
      return
    }
    if (due > 7 * 24 * 60 * 60 * 1000) return   // > 7 days, setTimeout unsafe
    const tid = setTimeout(() => publishScheduled(post.id), due)
    armed.set(post.id, tid)
  }

  function rearmAll() {
    for (const [id, tid] of armed.entries()) clearTimeout(tid)
    armed.clear()
    const all = loadScheduled()
    let modified = false
    for (const p of all) {
      if (p.status !== 'pending') continue
      const due = new Date(p.scheduledAt).getTime() - Date.now()
      if (due <= 0) {
        updateOne(p.id, { status: 'expired' })
        modified = true
        continue
      }
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
      const empresaId = (function () { try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' } })()
      const headers = {
        'Content-Type': 'application/json',
        'x-empresa-id': empresaId,
        'x-meta-token': meta.access_token
      }
      if (meta.page_id) headers['x-meta-page-id'] = meta.page_id
      if (meta.ad_account_id) headers['x-meta-ad-account-id'] = meta.ad_account_id
      if (meta.waba_id) headers['x-waba-id'] = meta.waba_id
      if (meta.phone_number_id) headers['x-meta-phone-number-id'] = meta.phone_number_id
      if (meta.ig_user_id) headers['x-meta-ig-user-id'] = meta.ig_user_id

      const r = await fetch('/api/social-post', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          platform: post.platform,
          caption: post.caption,
          image_url: post.imageUrl,
          empresa_id: empresaId
        })
      })
      const text = await r.text()
      let data = {}
      try { data = JSON.parse(text) } catch (_) { data = { error: 'Respuesta inesperada' } }
      if (!r.ok) throw new Error((data.error || 'Error') + (data.detail ? ' — ' + data.detail : ''))
      updateOne(id, { status: 'published', postUrl: data.url, publishedAt: new Date().toISOString(), error: null })
      window.rmToast?.('Post publicado: ' + post.caption.slice(0, 40) + '…', 'success')
    } catch (err) {
      updateOne(id, { status: 'failed', error: err.message })
      window.rmToast?.('Falló post programado · ' + err.message, 'error')
    } finally {
      if (window.rmRouter?.currentPage() === 'schedule') mount()
    }
  }

  // Re-arm whenever the dashboard loads (covers tab refresh)
  document.addEventListener('DOMContentLoaded', () => {
    rearmAll()
  })

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'schedule') mount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'schedule') mount()
  })
})()
