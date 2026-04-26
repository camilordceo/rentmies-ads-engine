/* ─────────────────────────────────────────────────────────────
   Settings — Meta credentials + IG detect + server status.
   Reads/writes localStorage.meta_creds (same key /app uses) so
   credentials are shared across both surfaces.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const FIELDS = [
    { key: 'access_token',     label: 'Access Token',         type: 'password', placeholder: 'EAAxxxxxxxxxxxx…', span: 2, hint: 'System User token con scopes pages_manage_posts, instagram_basic, instagram_content_publish.' },
    { key: 'page_id',          label: 'Facebook Page ID',     type: 'text',     placeholder: '123456789',         span: 1, hint: 'Necesario para publicar en FB y para detectar IG vinculada.' },
    { key: 'ig_user_id',       label: 'Instagram Business ID',type: 'text',     placeholder: '17841400000000000', span: 1, hint: 'Opcional. Si lo guardas, evitamos el page lookup al publicar en IG.' },
    { key: 'app_id',           label: 'App ID',               type: 'text',     placeholder: '271128…',           span: 1 },
    { key: 'app_secret',       label: 'App Secret',           type: 'password', placeholder: '055efe…',           span: 1 },
    { key: 'ad_account_id',    label: 'Ad Account ID',        type: 'text',     placeholder: 'act_XXXXXXXXX',     span: 1 },
    { key: 'waba_id',          label: 'WABA ID',              type: 'text',     placeholder: 'WhatsApp Business Account', span: 1 },
    { key: 'phone_number_id',  label: 'Phone Number ID',      type: 'text',     placeholder: 'Phone Number ID',   span: 1 },
    { key: 'openai_key_local', label: 'OpenAI Key (override local)', type: 'password', placeholder: 'sk-proj-… (opcional, solo si quieres override)', span: 2, hint: 'Por defecto usamos la key del servidor (env var OPENAI_API_KEY). Override aquí solo si tu cuenta tiene otra.' }
  ]

  function getMeta() {
    try { return JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) { return {} }
  }
  function setMeta(meta) {
    localStorage.setItem('meta_creds', JSON.stringify(meta))
    if (meta.access_token) localStorage.setItem('wa_access_token', meta.access_token)
    if (meta.waba_id) localStorage.setItem('wa_waba_id', meta.waba_id)
  }
  function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;') }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]) }

  // ── Render ────────────────────────────────────────────────

  function html() {
    const meta = getMeta()
    return `
      <div class="ae-page-shell ae-rise">

        <header class="ae-page-head">
          <span class="ae-eyebrow">CONFIGURACIÓN · CREDENCIALES</span>
          <h1 class="ae-display"><span class="ae-display-prefix">Tus llaves,</span> <em>tu control</em></h1>
          <p class="ae-subhead">Pega tus tokens de Meta (Facebook, Instagram, WhatsApp). Se guardan en este navegador y se usan al publicar. Nada se envía a Rentmies sin que tú dispares un POST.</p>
        </header>

        <!-- Server-side environment status (read-only) -->
        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Servicios del servidor</span>
            <span class="ae-formcard-h-accessory" id="settings-health-pill">cargando…</span>
          </div>
          <div id="settings-health-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;"></div>
          <div class="ae-help info" style="margin-top:14px;">
            Estas keys viven en Vercel como env vars del servidor. Para cambiarlas: dashboard de Vercel → Project → Settings → Environment Variables → Save → Redeploy.
          </div>
        </section>

        <!-- Meta credentials editor -->
        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Meta Business — credenciales</span>
            <span class="ae-formcard-h-accessory" id="settings-meta-status">${meta.access_token ? '<span class="ae-ai-badge">Token guardado</span>' : '<span class="ae-status pending">Sin token</span>'}</span>
          </div>

          ${FIELDS.map(f => fieldHtml(f, meta[f.key] || '')).join('')}

          <div class="ae-action-row" style="margin-top:18px;">
            <button type="button" class="ae-btn-primary" id="settings-save-btn">💾 Guardar y probar</button>
            <button type="button" class="ae-btn-ghost" id="settings-test-btn">🔌 Probar token</button>
            <button type="button" class="ae-btn-ghost" id="settings-detect-ig-btn">🆔 Detectar IG ID</button>
            <button type="button" class="ae-btn-ghost" id="settings-clear-btn" style="margin-left:auto; color:var(--rm-red);">Limpiar todo</button>
          </div>
          <div id="settings-status" style="font-size:12px; color:var(--rm-muted); margin-top:10px; min-height:18px; line-height:1.5;"></div>
        </section>

        <!-- Account / Sign out -->
        <section class="ae-formcard">
          <div class="ae-formcard-h"><span>Cuenta</span></div>
          <div id="settings-account" style="font-size:13px; color:var(--rm-ink-2);"></div>
          <div class="ae-action-row" style="margin-top:14px;">
            <a href="/login" class="ae-btn-ghost" id="settings-account-cta">Iniciar sesión</a>
          </div>
        </section>

      </div>
    `
  }

  function fieldHtml(f, value) {
    const span = f.span === 2 ? 'grid-column: span 2;' : ''
    return `
      <div class="ae-field" style="${span} margin-bottom:14px;">
        <label class="ae-field-label" for="s-${f.key}">${f.label}</label>
        <input id="s-${f.key}" class="ae-input" type="${f.type}" placeholder="${escapeAttr(f.placeholder)}" value="${escapeAttr(value)}" data-key="${f.key}" />
        ${f.hint ? `<div class="ae-field-hint">${escapeHtml(f.hint)}</div>` : ''}
      </div>
    `
  }

  // ── Health card ───────────────────────────────────────────

  async function renderHealth() {
    const grid = document.getElementById('settings-health-grid')
    const pill = document.getElementById('settings-health-pill')
    if (!grid) return
    grid.innerHTML = '<div style="font-size:11px; color:var(--rm-muted); grid-column:1/-1; text-align:center; padding:12px;">Verificando…</div>'

    let env = {}, db = ''
    try {
      const r = await fetch('/api/health')
      const j = await r.json()
      env = j.env || {}
      db = j.database || ''
    } catch (_) {}

    const services = [
      { key: 'openai',         label: 'OpenAI',          ok: !!env.openai,        detail: env.openai ? 'env: OPENAI_API_KEY' : 'falta OPENAI_API_KEY' },
      { key: 'supabase',       label: 'Supabase Storage',ok: !!env.supabase,      detail: env.supabase ? 'service_role activo' : 'falta SUPABASE_SERVICE_KEY' },
      { key: 'supabase_db',    label: 'Supabase DB',     ok: db === 'connected',  detail: db || 'no probado' },
      { key: 'meta',           label: 'Meta env vars',   ok: !!env.meta,          detail: env.meta ? 'fallback configurado' : 'opcional · usa creds del navegador' },
      { key: 'google_ai',      label: 'Google AI (legacy)',ok: !!env.google_ai,   detail: env.google_ai ? 'configurada' : 'opcional' }
    ]

    grid.innerHTML = services.map(s => `
      <div style="background:${s.ok ? 'rgba(0,77,53,0.06)' : 'var(--rm-surface-2)'};
                  border:1px solid ${s.ok ? 'rgba(0,77,53,0.2)' : 'var(--rm-border)'};
                  padding:11px 14px; border-radius:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600; color:var(--rm-ink);">${s.label}</span>
          <span style="margin-left:auto; font-family:var(--rm-mono); font-size:9px; font-weight:700; letter-spacing:0.1em;
                       color:${s.ok ? 'var(--rm-green-deep)' : 'var(--rm-muted)'};">
            ${s.ok ? '✓ OK' : '○ OFF'}
          </span>
        </div>
        <div style="margin-top:4px; font-size:10px; color:var(--rm-muted); font-family:var(--rm-mono);">${s.detail}</div>
      </div>
    `).join('')

    if (pill) {
      const okCount = services.filter(s => s.ok).length
      pill.innerHTML = `<span class="ae-ai-badge">${okCount} / ${services.length} servicios</span>`
    }
  }

  function renderAccount() {
    const block = document.getElementById('settings-account')
    const cta = document.getElementById('settings-account-cta')
    if (!block) return
    let user = {}
    try { user = JSON.parse(localStorage.getItem('sb_user') || '{}') } catch (_) {}
    if (user.email) {
      block.innerHTML = `Sesión activa: <strong>${escapeHtml(user.email)}</strong> <span style="color:var(--rm-muted); font-size:11px;">(empresa_id: <code class="rm-mono">${escapeHtml(user.id || 'demo')}</code>)</span>`
      if (cta) {
        cta.textContent = 'Cerrar sesión'
        cta.href = '#'
        cta.onclick = e => {
          e.preventDefault()
          if (!confirm('¿Cerrar sesión?')) return
          localStorage.removeItem('sb_token')
          localStorage.removeItem('sb_refresh_token')
          localStorage.removeItem('sb_user')
          location.href = '/login'
        }
      }
    } else {
      block.innerHTML = '<span style="color:var(--rm-muted);">Modo demo. Inicia sesión para guardar configuración en servidor.</span>'
    }
  }

  // ── Wiring ────────────────────────────────────────────────

  function wire() {
    document.getElementById('settings-save-btn').addEventListener('click', saveAndTest)
    document.getElementById('settings-test-btn').addEventListener('click', testToken)
    document.getElementById('settings-detect-ig-btn').addEventListener('click', detectIg)
    document.getElementById('settings-clear-btn').addEventListener('click', clearAll)
  }

  function readForm() {
    const out = {}
    FIELDS.forEach(f => {
      const el = document.getElementById('s-' + f.key)
      if (el) out[f.key] = el.value.trim()
    })
    return out
  }

  function setStatus(msg, kind) {
    const status = document.getElementById('settings-status')
    if (!status) return
    status.textContent = msg
    status.style.color = kind === 'success' ? 'var(--rm-green-deep)' :
                        kind === 'error' ? 'var(--rm-red)' :
                        'var(--rm-muted)'
  }

  async function saveAndTest() {
    const meta = readForm()
    setMeta(meta)
    document.getElementById('settings-meta-status').innerHTML = meta.access_token
      ? '<span class="ae-ai-badge">Token guardado</span>'
      : '<span class="ae-status pending">Sin token</span>'

    if (!meta.access_token) {
      setStatus('Guardado (sin token, no hay nada que probar)', 'success')
      return
    }
    setStatus('⏳ Guardando y probando…')
    try {
      const r = await fetch('/api/credentials?action=meta-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: meta.access_token })
      })
      const j = await r.json()
      if (j.success) {
        setStatus('✓ ' + (j.message || 'Token válido'), 'success')
        window.rmToast?.('Credenciales guardadas y verificadas', 'success')
      } else {
        setStatus('✗ Token guardado pero falló prueba: ' + (j.error || 'inválido'), 'error')
        window.rmToast?.('Token guardado pero NO funciona', 'error')
      }
    } catch (err) {
      setStatus('✗ ' + err.message, 'error')
    }
  }

  async function testToken() {
    const meta = readForm()
    if (!meta.access_token) { setStatus('Pega un Access Token primero', 'error'); return }
    setStatus('⏳ Probando contra Graph /me…')
    try {
      const r = await fetch('/api/credentials?action=meta-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: meta.access_token })
      })
      const j = await r.json()
      setStatus(j.success ? '✓ ' + (j.message || 'Conectado') : '✗ ' + (j.error || 'inválido'), j.success ? 'success' : 'error')
    } catch (err) {
      setStatus('✗ ' + err.message, 'error')
    }
  }

  async function detectIg() {
    const meta = readForm()
    if (!meta.access_token) { setStatus('Pega Access Token primero', 'error'); return }
    if (!meta.page_id)      { setStatus('Llena Facebook Page ID primero', 'error'); return }
    setStatus('⏳ Consultando Graph para descubrir IG vinculada…')
    try {
      const r = await fetch('/api/credentials?action=meta-detect-ig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: meta.access_token, page_id: meta.page_id })
      })
      const j = await r.json()
      if (!j.success) { setStatus('✗ ' + (j.error || 'No se pudo'), 'error'); return }
      const igEl = document.getElementById('s-ig_user_id')
      if (igEl) igEl.value = j.ig_user_id
      // auto-save it too
      const updated = readForm()
      setMeta(updated)
      setStatus(`✓ IG detectada: ${j.ig_user_id} (${j.page_name || meta.page_id}) — ya guardado`, 'success')
      window.rmToast?.('IG Business Account ID detectado y guardado', 'success')
    } catch (err) {
      setStatus('✗ ' + err.message, 'error')
    }
  }

  function clearAll() {
    if (!confirm('¿Borrar TODAS las credenciales del navegador? Esto no afecta las env vars del servidor.')) return
    localStorage.removeItem('meta_creds')
    localStorage.removeItem('wa_access_token')
    localStorage.removeItem('wa_waba_id')
    FIELDS.forEach(f => {
      const el = document.getElementById('s-' + f.key)
      if (el) el.value = ''
    })
    document.getElementById('settings-meta-status').innerHTML = '<span class="ae-status pending">Sin token</span>'
    setStatus('✓ Limpiado', 'success')
    window.rmToast?.('Credenciales limpiadas', 'info')
  }

  // ── Mount ─────────────────────────────────────────────────

  function mount() {
    const slot = document.querySelector('[data-page="settings"]')
    if (!slot) return
    slot.innerHTML = html()
    wire()
    renderHealth()
    renderAccount()
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'settings') mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'settings') mount()
  })
})()
