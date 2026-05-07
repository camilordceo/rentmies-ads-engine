/* ─────────────────────────────────────────────────────────────
   Settings — Meta Connection (System User Token / Camino B)

   Primary flow: paste a non-expiring System User token + Page ID
   (+ optional IG Business ID, WABA ID), Test Connection, Save.

   Reads/writes BOTH:
     - meta_connections (server-side, via /api/credentials/meta) —
       canonical source of truth across both /app and /dashboard
     - localStorage.meta_creds (browser) — kept in sync so legacy
       quickpost flows that read it directly keep working

   The "¿Cómo consigo el token?" link opens a step-by-step modal
   based on docs/GUIA_CONEXION_META.md.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const $ = (id) => document.getElementById(id)

  function getMetaLocal () {
    try { return JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) { return {} }
  }
  function setMetaLocal (meta) {
    localStorage.setItem('meta_creds', JSON.stringify(meta))
    if (meta.access_token) localStorage.setItem('wa_access_token', meta.access_token)
    if (meta.waba_id) localStorage.setItem('wa_waba_id', meta.waba_id)
  }
  function authToken () { return localStorage.getItem('sb_token') || '' }
  function authHeaders () {
    const t = authToken()
    const empresaId = (() => { try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id } catch (_) { return '' } })()
    const h = { 'Content-Type': 'application/json' }
    if (t) h.Authorization = 'Bearer ' + t
    else { h.Authorization = 'Bearer demo_local'; h['x-empresa-id'] = empresaId || 'demo' }
    return h
  }

  function escapeAttr (s) { return String(s == null ? '' : s).replace(/"/g, '&quot;') }
  function escapeHtml (s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]) }
  function fmtN (n) { if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n) }

  let state = {
    loading: false,
    serverConn: null,    // meta_connections row from server
    testResult: null,    // last response from /api/credentials/meta/test
    showToken: false,
    error: null
  }

  // ── Render ────────────────────────────────────────────────

  function html () {
    const meta = getMetaLocal()
    const conn = state.serverConn

    // Status indicator
    const dotColor = conn && conn.connected && conn.status === 'active' ? 'var(--rm-teal)' : '#9ca3af'
    const statusLabel = conn && conn.connected
      ? (conn.status === 'active'
         ? `Conectado a "${escapeHtml(conn.page_name || 'tu Página')}"`
         : `Estado: ${conn.status || 'desconocido'}`)
      : 'No conectado'

    const isConnected = conn && conn.connected && conn.status === 'active'

    return `
      <div class="rp-page rp-rise">

        <div class="rp-page-header">
          <span class="rp-eyebrow">CONFIGURACIÓN · INTEGRACIONES</span>
          <h1 class="rp-display">Conecta tu <em>Meta Business</em></h1>
          <p class="rp-subhead">Pega un System User Token desde tu Business Manager. Es <strong>permanente, no caduca</strong>, y solo accede a los assets que tú le asignes.</p>
        </div>

        ${!isConnected ? `
          <section class="ae-formcard" style="background:linear-gradient(135deg, rgba(64,217,157,0.10), rgba(0,108,74,0.04)); border-left:3px solid var(--rp-teal);">
            <div class="ae-formcard-h">
              <span style="display:flex; align-items:center; gap:10px;">
                ✨ <span>¿Primera vez? Te guiamos paso a paso</span>
              </span>
            </div>
            <p style="font-size:14px; line-height:1.55; color:var(--rm-ink-2); margin:8px 0 16px;">
              Si nunca has conectado Meta antes, usa nuestro asistente guiado. Te llevamos por cada
              clic en Meta, con explicaciones simples y validación automática. Toma <strong>~12 minutos</strong>.
            </p>
            <a class="ae-btn-authority" href="#connect" style="text-decoration:none;">Empezar conexión guiada →</a>
            <a class="ae-btn-ghost" href="#" id="s-skip-wizard" style="margin-left:10px;">O pega tu token directamente abajo ↓</a>
          </section>
        ` : ''}

        <!-- ═══════════ META CONNECTION CARD ═══════════ -->
        <section class="ae-formcard" id="settings-meta-card">
          <div class="ae-formcard-h">
            <span style="display:flex; align-items:center; gap:10px;">
              <span id="settings-status-dot" style="width:8px; height:8px; border-radius:50%; background:${dotColor}; ${dotColor === 'var(--rm-teal)' ? 'box-shadow:0 0 8px var(--rm-teal); animation:ae-pulse 1.6s ease-in-out infinite;' : ''}"></span>
              Meta · Facebook & Instagram
            </span>
            <span class="ae-formcard-h-accessory" id="settings-meta-status">${escapeHtml(statusLabel)}</span>
          </div>

          <div id="settings-result-block" style="margin-bottom:16px;"></div>

          <div class="ae-field">
            <label class="ae-field-label" for="s-token">System User Access Token</label>
            <div style="position:relative;">
              <input id="s-token" class="ae-input" type="${state.showToken ? 'text' : 'password'}"
                     placeholder="EAAxxxxxxxxxxxx…"
                     value="${escapeAttr(meta.access_token || '')}"
                     style="padding-right:90px;" autocomplete="off" spellcheck="false" />
              <button type="button" id="s-token-toggle"
                      style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:transparent; border:none; padding:6px 10px; cursor:pointer; font-family:var(--rm-mono); font-size:10px; font-weight:700; letter-spacing:0.1em; color:var(--rm-muted);">
                ${state.showToken ? 'OCULTAR' : 'MOSTRAR'}
              </button>
            </div>
            <div class="ae-field-hint">
              Token permanente desde tu Business Manager. No caduca.
              <a href="#" id="s-help-link" style="color:var(--rm-green-deep); text-decoration:underline;">¿Cómo lo consigo? →</a>
            </div>
          </div>

          <div class="ae-grid-2">
            <div class="ae-field">
              <label class="ae-field-label" for="s-page-id">Facebook Page ID</label>
              <input id="s-page-id" class="ae-input" type="text"
                     placeholder="123456789012345" value="${escapeAttr(meta.page_id || '')}" />
              <div class="ae-field-hint">Encuéntralo en la URL de tu página o en la pestaña "About".</div>
            </div>
            <div class="ae-field">
              <label class="ae-field-label" for="s-ig-id">Instagram Business ID <span style="color:var(--rm-muted); font-weight:400;">· opcional</span></label>
              <input id="s-ig-id" class="ae-input" type="text"
                     placeholder="17841400000000000" value="${escapeAttr(meta.ig_user_id || '')}" />
              <div class="ae-field-hint">Si tu Page tiene IG Business vinculada, lo detectamos automáticamente.</div>
            </div>
          </div>

          <div class="ae-field">
            <label class="ae-field-label" for="s-waba-id">WABA ID <span style="color:var(--rm-muted); font-weight:400;">· opcional</span></label>
            <input id="s-waba-id" class="ae-input" type="text"
                   placeholder="WhatsApp Business Account ID" value="${escapeAttr(meta.waba_id || '')}" />
            <div class="ae-field-hint">Solo si usas WhatsApp Business API.</div>
          </div>

          <div class="ae-action-row" style="margin-top:18px;">
            <button type="button" class="ae-btn-primary" id="s-save-btn">GUARDAR Y PROBAR</button>
            <button type="button" class="ae-btn-ghost" id="s-test-btn">SOLO PROBAR</button>
            <button type="button" class="ae-btn-ghost" id="s-clear-btn" style="margin-left:auto; color:var(--rm-red);">Limpiar</button>
          </div>

          <details class="ae-optional" style="margin-top:18px;">
            <summary>¿Cómo consigo el token? <span style="margin-left:auto; color:var(--rm-muted); font-weight:500;">resumen</span></summary>
            <div class="ae-optional-body">
              <ol style="margin:0; padding-left:20px; font-size:13px; line-height:1.7;">
                <li><strong>Entra a business.facebook.com</strong> con tu cuenta admin</li>
                <li><strong>Business Settings → Users → System Users → Add</strong> · nombre "Rentmies Connection", rol Admin</li>
                <li><strong>Add Assets</strong> · selecciona tu Página de Facebook + cuenta de Instagram (+ WABA si aplica) con permisos Manage</li>
                <li><strong>Generate New Token</strong> · selecciona la app Rentmies, marca permisos pages_manage_posts, pages_read_engagement, instagram_content_publish, instagram_basic, business_management</li>
                <li><strong>Copia el token</strong> y pégalo arriba</li>
                <li><strong>Click GUARDAR Y PROBAR</strong> — verás los assets detectados ✓</li>
              </ol>
              <div class="ae-action-row" style="margin-top:14px;">
                <a href="/docs/GUIA_CONEXION_META.md" target="_blank" class="ae-btn-ghost">Guía completa →</a>
                <a href="#" id="s-help-link-2" class="ae-btn-ghost">Abrir paso a paso visual →</a>
              </div>
            </div>
          </details>
        </section>

        <!-- ═══════════ ACCOUNT / SIGN OUT ═══════════ -->
        <section class="ae-formcard">
          <div class="ae-formcard-h"><span>Cuenta</span></div>
          <div id="settings-account" style="font-size:13px; color:var(--rm-ink-2);"></div>
          <div class="ae-action-row" style="margin-top:14px;">
            <a href="/login" class="ae-btn-ghost" id="settings-account-cta">Iniciar sesión</a>
          </div>
        </section>

        <!-- ═══════════ SERVER STATUS ═══════════ -->
        <section class="ae-formcard">
          <div class="ae-formcard-h">
            <span>Servicios del servidor</span>
            <span class="ae-formcard-h-accessory" id="settings-health-pill">cargando…</span>
          </div>
          <div id="settings-health-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;"></div>
        </section>
      </div>
    `
  }

  function resultBlockHtml (test) {
    if (!test) return ''
    if (!test.ok) {
      return `
        <div class="ae-help warn" style="font-size:13px; line-height:1.55;">
          <strong>✗ Conexión falló</strong> <span style="color:var(--rm-muted); font-size:11px;">· paso: ${escapeHtml(test.step || 'desconocido')}</span><br>
          ${escapeHtml(test.error || 'Error desconocido')}
          ${test.detail ? `<div style="margin-top:6px; font-family:var(--rm-mono); font-size:11px; color:var(--rm-muted);">${escapeHtml(test.detail)}</div>` : ''}
        </div>
      `
    }
    const igLine = test.instagram
      ? `<div class="rm-meta-asset"><span class="rm-meta-asset-emoji">📷</span> <span><strong>@${escapeHtml(test.instagram.username)}</strong> · ${fmtN(test.instagram.followers || 0)} seguidores</span></div>`
      : `<div class="rm-meta-asset muted"><span class="rm-meta-asset-emoji">📷</span> <span>Instagram no detectado <span style="color:var(--rm-muted); font-size:11px;">— vincula IG a tu Page o pega el IG Business ID arriba</span></span></div>`
    const waLine = test.whatsapp
      ? `<div class="rm-meta-asset"><span class="rm-meta-asset-emoji">💬</span> <span><strong>${escapeHtml(test.whatsapp.name || 'WhatsApp Business')}</strong>${test.whatsapp.phone ? ' · ' + escapeHtml(test.whatsapp.phone) : ''}</span></div>`
      : ''
    return `
      <div class="rm-meta-success">
        <div class="rm-meta-success-h">
          <span style="font-size:14px;">✅ Conectado a "${escapeHtml(test.page_name)}"</span>
          <span class="ae-ai-badge" style="margin-left:auto;">SYSTEM USER · NO CADUCA</span>
        </div>
        <div class="rm-meta-asset"><span class="rm-meta-asset-emoji">📘</span> <span><strong>Facebook Page</strong>${test.page_followers ? ' · ' + fmtN(test.page_followers) + ' seguidores' : ''}</span></div>
        ${igLine}
        ${waLine}
        <div class="rm-meta-asset" style="border-top:1px dashed var(--rm-border); margin-top:10px; padding-top:10px;"><span class="rm-meta-asset-emoji">🔑</span> <span style="color:var(--rm-muted); font-size:12px;">Token permanente · No caduca · Solo este Business Manager puede revocarlo</span></div>
      </div>
    `
  }

  // ── Health card (server services status) ─────────────────

  async function renderHealth () {
    const grid = $('settings-health-grid')
    const pill = $('settings-health-pill')
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
      { label: 'OpenAI',           ok: !!env.openai,        detail: env.openai ? 'env: OPENAI_API_KEY' : 'falta OPENAI_API_KEY' },
      { label: 'Supabase Storage', ok: !!env.supabase,      detail: env.supabase ? 'service_role activo' : 'falta SUPABASE_SERVICE_KEY' },
      { label: 'Supabase DB',      ok: db === 'connected',  detail: db || 'no probado' },
      { label: 'Meta env vars',    ok: !!env.meta,          detail: env.meta ? 'fallback configurado' : 'opcional · usa creds del navegador' },
      { label: 'Google AI',        ok: !!env.google_ai,     detail: env.google_ai ? 'configurada' : 'opcional' }
    ]
    grid.innerHTML = services.map(s => `
      <div style="background:${s.ok ? 'rgba(0,77,53,0.06)' : 'var(--rm-surface-2)'};
                  border:1px solid ${s.ok ? 'rgba(0,77,53,0.2)' : 'var(--rm-border)'};
                  padding:11px 14px; border-radius:6px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:13px; font-weight:600;">${s.label}</span>
          <span style="margin-left:auto; font-family:var(--rm-mono); font-size:9px; font-weight:700; letter-spacing:0.1em;
                       color:${s.ok ? 'var(--rm-green-deep)' : 'var(--rm-muted)'};">${s.ok ? '✓ OK' : '○ OFF'}</span>
        </div>
        <div style="margin-top:4px; font-size:10px; color:var(--rm-muted); font-family:var(--rm-mono);">${s.detail}</div>
      </div>
    `).join('')
    if (pill) {
      const okCount = services.filter(s => s.ok).length
      pill.innerHTML = `<span class="ae-ai-badge">${okCount} / ${services.length} servicios</span>`
    }
  }

  function renderAccount () {
    const block = $('settings-account')
    const cta = $('settings-account-cta')
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

  // ── Server actions ────────────────────────────────────────

  async function loadConnection () {
    try {
      const r = await fetch('/api/credentials/meta', { headers: authHeaders() })
      if (!r.ok) return
      state.serverConn = await r.json()
    } catch (e) { /* non-fatal */ }
  }

  function readForm () {
    return {
      access_token: $('s-token').value.trim(),
      page_id: $('s-page-id').value.trim(),
      instagram_id: $('s-ig-id').value.trim(),
      waba_id: $('s-waba-id').value.trim()
    }
  }

  async function save (alsoTest) {
    const form = readForm()
    if (!form.access_token) { window.rmToast?.('Pega el access token primero', 'error'); return }
    if (!form.page_id)      { window.rmToast?.('Pega el Page ID primero', 'error'); return }

    const saveBtn = $('s-save-btn')
    saveBtn.disabled = true
    const originalLabel = saveBtn.textContent
    saveBtn.textContent = alsoTest ? 'PROBANDO…' : 'GUARDANDO…'

    try {
      // 1. Save
      const r = await fetch('/api/credentials/meta', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form)
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error guardando')

      // 2. Mirror to localStorage so legacy quickpost flows keep working
      const meta = getMetaLocal()
      Object.assign(meta, {
        access_token: form.access_token,
        page_id: form.page_id,
        ig_user_id: form.instagram_id,
        waba_id: form.waba_id
      })
      setMetaLocal(meta)

      if (alsoTest) {
        await runTest(form)
      } else {
        window.rmToast?.('✅ Credenciales guardadas', 'success')
      }
      await loadConnection()
      renderResult()
      renderStatusHeader()
    } catch (err) {
      window.rmToast?.('Error: ' + err.message, 'error')
      state.error = err.message
    } finally {
      saveBtn.disabled = false
      saveBtn.textContent = originalLabel
    }
  }

  async function runTest (form) {
    const r = await fetch('/api/credentials/meta/test', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(form || readForm())
    })
    state.testResult = await r.json()
    if (state.testResult.ok) {
      window.rmToast?.(`✅ Conectado a ${state.testResult.page_name}`, 'success')
    } else {
      window.rmToast?.(`✗ ${state.testResult.error || 'Test falló'}`, 'error')
    }
  }

  async function testOnly () {
    const form = readForm()
    if (!form.access_token || !form.page_id) {
      window.rmToast?.('Pega token y Page ID primero', 'error'); return
    }
    const btn = $('s-test-btn')
    btn.disabled = true
    const orig = btn.textContent
    btn.textContent = 'PROBANDO…'
    try {
      await runTest(form)
      renderResult()
      await loadConnection()
      renderStatusHeader()
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  }

  function renderResult () {
    const block = $('settings-result-block')
    if (block) block.innerHTML = resultBlockHtml(state.testResult)
  }

  function renderStatusHeader () {
    const dot = $('settings-status-dot')
    const status = $('settings-meta-status')
    if (!dot || !status) return
    const conn = state.serverConn
    const ok = conn && conn.connected && conn.status === 'active'
    dot.style.background = ok ? 'var(--rm-teal)' : '#9ca3af'
    dot.style.boxShadow = ok ? '0 0 8px var(--rm-teal)' : 'none'
    dot.style.animation = ok ? 'ae-pulse 1.6s ease-in-out infinite' : 'none'
    status.textContent = ok ? `Conectado a "${conn.page_name || 'tu Página'}"`
                            : (conn && conn.connected ? `Estado: ${conn.status}` : 'No conectado')
  }

  function clearAll () {
    if (!confirm('¿Borrar las credenciales del navegador? La conexión en servidor queda intacta hasta que guardes una nueva.')) return
    localStorage.removeItem('meta_creds')
    localStorage.removeItem('wa_access_token')
    localStorage.removeItem('wa_waba_id')
    ;['s-token','s-page-id','s-ig-id','s-waba-id'].forEach(id => { const el = $(id); if (el) el.value = '' })
    state.testResult = null
    renderResult()
    window.rmToast?.('Credenciales locales limpiadas', 'info')
  }

  function toggleToken () {
    state.showToken = !state.showToken
    const inp = $('s-token')
    const btn = $('s-token-toggle')
    if (inp) inp.type = state.showToken ? 'text' : 'password'
    if (btn) btn.textContent = state.showToken ? 'OCULTAR' : 'MOSTRAR'
  }

  // ── Help modal ────────────────────────────────────────────

  const HELP_STEPS = [
    { num: '01', icon: '🏢', title: 'Entra a tu Business Manager', desc: 'Ve a <a href="https://business.facebook.com" target="_blank" style="color:var(--rm-green-deep);">business.facebook.com</a> con la cuenta admin de tu inmobiliaria.' },
    { num: '02', icon: '⚙️', title: 'Business Settings → Users → System Users', desc: 'En el menú de la izquierda, busca <strong>System Users</strong> bajo la sección Users.' },
    { num: '03', icon: '➕', title: 'Crea un System User', desc: 'Click <strong>Add</strong>, nombre <strong>"Rentmies Connection"</strong>, rol <strong>Admin</strong>. Confirma con tu contraseña.' },
    { num: '04', icon: '🔑', title: 'Asigna assets al System User', desc: 'Click <strong>Add Assets</strong> en el System User recién creado. Selecciona tu <strong>Facebook Page</strong> e <strong>Instagram</strong> (y WABA si usas WhatsApp), con permiso <strong>Manage</strong> en cada uno.' },
    { num: '05', icon: '📋', title: 'Genera el token', desc: 'Click <strong>Generate New Token</strong>. Selecciona la app <strong>Rentmies</strong>. Marca: <code class="rm-mono">pages_manage_posts</code>, <code class="rm-mono">pages_read_engagement</code>, <code class="rm-mono">instagram_content_publish</code>, <code class="rm-mono">instagram_basic</code>, <code class="rm-mono">business_management</code>.' },
    { num: '06', icon: '✅', title: 'Pégalo aquí', desc: 'Copia el token (lo verás solo una vez), pégalo en el campo "System User Access Token", agrega tu Page ID, y haz click en <strong>GUARDAR Y PROBAR</strong>.' }
  ]

  function openHelpModal (e) {
    if (e && e.preventDefault) e.preventDefault()
    if ($('rm-help-modal')) return
    const root = document.createElement('div')
    root.id = 'rm-help-modal'
    root.innerHTML = `
      <div class="rm-help-overlay"></div>
      <div class="rm-help-panel" role="dialog" aria-modal="true" aria-label="Cómo conseguir el token">
        <header class="rm-help-h">
          <div>
            <span class="ae-eyebrow">GUÍA · 6 PASOS · 10 MINUTOS</span>
            <h2 class="rm-help-title"><em>Conecta tu Meta Business</em> en pocos minutos</h2>
          </div>
          <button class="rm-help-close" aria-label="Cerrar">×</button>
        </header>
        <div class="rm-help-body">
          ${HELP_STEPS.map(s => `
            <div class="rm-help-step">
              <div class="rm-help-step-num">${s.num}</div>
              <div class="rm-help-step-icon">${s.icon}</div>
              <div class="rm-help-step-text">
                <div class="rm-help-step-title">${s.title}</div>
                <div class="rm-help-step-desc">${s.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <footer class="rm-help-foot">
          <span class="rm-help-foot-q">¿Te trabaste? Te ayudamos en una llamada de 15 min.</span>
          <a href="https://calendly.com/rentmies/onboarding" target="_blank" class="ae-btn-ghost">📅 Agendar llamada</a>
          <a href="/docs/GUIA_CONEXION_META.md" target="_blank" class="ae-btn-authority">Guía completa →</a>
        </footer>
      </div>
    `
    document.body.appendChild(root)
    requestAnimationFrame(() => root.classList.add('open'))
    root.querySelector('.rm-help-close').addEventListener('click', closeHelpModal)
    root.querySelector('.rm-help-overlay').addEventListener('click', closeHelpModal)
    document.addEventListener('keydown', escClose)
  }
  function closeHelpModal () {
    const root = $('rm-help-modal')
    if (!root) return
    root.classList.remove('open')
    setTimeout(() => root.remove(), 200)
    document.removeEventListener('keydown', escClose)
  }
  function escClose (e) { if (e.key === 'Escape') closeHelpModal() }

  function injectHelpStyles () {
    if ($('rm-help-styles')) return
    const css = `
      /* Help modal */
      #rm-help-modal { position:fixed; inset:0; z-index:2000; opacity:0; transition:opacity .2s; }
      #rm-help-modal.open { opacity:1; }
      .rm-help-overlay { position:absolute; inset:0; background:rgba(15,20,16,0.55); backdrop-filter:blur(2px); }
      .rm-help-panel { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.97); transition:transform .2s; max-width:680px; width:calc(100% - 32px); max-height:90vh; overflow:auto; background:var(--rm-bg, #f6f3ee); border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; box-shadow:0 24px 60px rgba(0,0,0,.18); display:flex; flex-direction:column; }
      #rm-help-modal.open .rm-help-panel { transform:translate(-50%,-50%) scale(1); }
      .rm-help-h { display:flex; align-items:flex-start; padding:24px 28px 18px; border-bottom:1px solid var(--rm-border, #e8e3dc); gap:14px; }
      .rm-help-title { font-family:var(--rp-font); font-weight:800; font-size:24px; line-height:1.2; letter-spacing:-0.02em; margin:6px 0 0; color:var(--rp-ink, #1c1b1b); }
      .rm-help-title em { color:var(--rp-teal, #40d99d); font-style:normal; font-weight:800; }
      .rm-help-close { margin-left:auto; background:transparent; border:none; font-size:24px; line-height:1; cursor:pointer; color:var(--rm-muted, #7a7e79); padding:4px 10px; border-radius:4px; }
      .rm-help-close:hover { background:var(--rm-surface-3, #f1ede6); color:var(--rm-ink, #0f1410); }
      .rm-help-body { padding:18px 28px 24px; }
      .rm-help-step { display:grid; grid-template-columns:48px 36px 1fr; gap:14px; align-items:start; padding:14px 0; border-bottom:1px solid var(--rm-border, #e8e3dc); }
      .rm-help-step:last-child { border-bottom:none; }
      .rm-help-step-num { font-family:'Inter',sans-serif; font-size:22px; font-weight:700; color:var(--rm-green-deep, #004d35); line-height:1; padding-top:2px; letter-spacing:-0.02em; }
      .rm-help-step-icon { font-size:22px; line-height:1; padding-top:2px; }
      .rm-help-step-title { font-size:14px; font-weight:600; color:var(--rm-ink, #0f1410); margin-bottom:4px; }
      .rm-help-step-desc { font-size:13px; color:var(--rm-ink-2, #3a3f3b); line-height:1.55; }
      .rm-help-step-desc code { background:var(--rm-surface-3, #f1ede6); padding:1px 6px; border-radius:3px; font-size:11.5px; }
      .rm-help-foot { display:flex; align-items:center; gap:10px; padding:18px 28px; border-top:1px solid var(--rm-border, #e8e3dc); background:var(--rm-surface, #fff); border-radius:0 0 8px 8px; flex-wrap:wrap; }
      .rm-help-foot-q { font-size:12px; color:var(--rm-muted, #7a7e79); flex:1; min-width:200px; }

      /* Test result block (Settings card) */
      .rm-meta-success { background:rgba(64,217,157,0.08); border:1px solid rgba(64,217,157,0.3); border-radius:6px; padding:14px 16px; }
      .rm-meta-success-h { display:flex; align-items:center; font-weight:600; font-size:14px; color:var(--rm-green-deep, #004d35); margin-bottom:10px; }
      .rm-meta-asset { display:flex; align-items:center; gap:10px; padding:6px 0; font-size:13px; color:var(--rm-ink, #0f1410); }
      .rm-meta-asset.muted { color:var(--rm-muted, #7a7e79); }
      .rm-meta-asset-emoji { font-size:14px; flex-shrink:0; width:18px; text-align:center; }
    `
    const s = document.createElement('style')
    s.id = 'rm-help-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  // ── Wire ──────────────────────────────────────────────────

  function wire () {
    $('s-save-btn').addEventListener('click', () => save(true))
    $('s-test-btn').addEventListener('click', testOnly)
    $('s-clear-btn').addEventListener('click', clearAll)
    $('s-token-toggle').addEventListener('click', toggleToken)
    $('s-help-link')?.addEventListener('click', openHelpModal)
    $('s-help-link-2')?.addEventListener('click', openHelpModal)
  }

  // ── Mount ─────────────────────────────────────────────────

  async function mount () {
    const slot = document.querySelector('section[data-page="settings"]')
    if (!slot) return
    injectHelpStyles()
    state.testResult = null
    state.serverConn = null
    slot.innerHTML = html()
    wire()
    renderHealth()
    renderAccount()
    // Load server-side connection status in background
    loadConnection().then(() => { renderStatusHeader() })
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'settings') mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'settings') mount()
  })
})()
