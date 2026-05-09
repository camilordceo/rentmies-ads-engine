/* ─────────────────────────────────────────────────────────────
   Settings — Multi-channel connection hub
   Renders one card per channel (Meta · WhatsApp · Google · TikTok)
   with a status indicator and channel-specific actions. Meta keeps
   its existing System User Token flow inline; the other channels
   show their connect-CTAs and minimal forms.

   Reads/writes:
     - meta_connections (server) via /api/credentials/meta
     - localStorage.meta_creds  (legacy mirror for /app)
     - google_connections (server) via /api/google/connection (Bloque 3)
     - tiktok_connections (server) via /api/tiktok/connection (later)
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

  function escapeAttr (s) { return String(s == null ? '' : s).replace(/"/g, '&quot;') }
  function escapeHtml (s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]) }
  function fmtN (n) { if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n) }

  // ─── State per channel ────────────────────────────────────
  const state = {
    loading: false,
    showToken: false,
    error: null,
    meta:     { conn: null, testResult: null },
    whatsapp: { conn: null },                         // derived from meta connection (waba_id)
    google:   { conn: null, loaded: false },
    tiktok:   { conn: null, loaded: false }
  }

  // ─── Channel status helpers ───────────────────────────────
  function metaStatus () {
    const c = state.meta.conn
    if (!c || !c.connected) return { kind: 'off',  label: 'No conectado' }
    if (c.status !== 'active')                            return { kind: 'warn', label: 'Estado: ' + c.status }
    return { kind: 'ok', label: `Conectado a "${c.page_name || 'tu Página'}"` }
  }

  function whatsappStatus () {
    const c = state.meta.conn
    const waba = (c && c.waba_id) || getMetaLocal().waba_id
    if (!waba)                            return { kind: 'off',  label: 'WABA no configurada' }
    if (!c || c.status !== 'active')      return { kind: 'warn', label: 'Conexión Meta inactiva' }
    return { kind: 'ok', label: 'WABA · ' + waba.slice(0, 6) + '…' }
  }

  function googleStatus () {
    if (!state.google.loaded)             return { kind: 'off',  label: 'Cargando…' }
    const c = state.google.conn
    if (!c || !c.connected)               return { kind: 'off',  label: 'No conectado' }
    if (c.status !== 'active')            return { kind: 'warn', label: 'Estado: ' + c.status }
    return { kind: 'ok', label: 'Customer ID · ' + (c.customer_id || '—') }
  }

  function tiktokStatus () {
    if (!state.tiktok.loaded)             return { kind: 'off',  label: 'Cargando…' }
    const c = state.tiktok.conn
    if (!c || !c.connected)               return { kind: 'off',  label: 'No conectado' }
    if (c.status !== 'active')            return { kind: 'warn', label: 'Estado: ' + c.status }
    return { kind: 'ok', label: '@' + (c.username || 'business') }
  }

  // Visual treatment per status kind
  function dotForKind (kind) {
    const c = kind === 'ok'   ? 'var(--rm-teal)'
            : kind === 'warn' ? '#f59e0b'
            : '#9ca3af'
    const glow = kind === 'ok' ? 'box-shadow:0 0 8px var(--rm-teal); animation:ae-pulse 1.6s ease-in-out infinite;' : ''
    return `<span style="width:8px; height:8px; border-radius:50%; background:${c}; ${glow}"></span>`
  }

  // ─── Render: status overview row ──────────────────────────
  function overviewRowHtml () {
    const channels = [
      { key: 'meta',     label: 'Meta',     emoji: '📘', s: metaStatus() },
      { key: 'whatsapp', label: 'WhatsApp', emoji: '💬', s: whatsappStatus() },
      { key: 'google',   label: 'Google',   emoji: '🔍', s: googleStatus() },
      { key: 'tiktok',   label: 'TikTok',   emoji: '🎵', s: tiktokStatus() }
    ]
    return `
      <div class="rm-channels-overview">
        ${channels.map(ch => `
          <a href="#settings" class="rm-channel-tile rm-channel-${ch.key} rm-status-${ch.s.kind}" data-jump="${ch.key}">
            <div class="rm-channel-tile-h">
              <span class="rm-channel-tile-emoji">${ch.emoji}</span>
              ${dotForKind(ch.s.kind)}
            </div>
            <div class="rm-channel-tile-label">${ch.label}</div>
            <div class="rm-channel-tile-status">${escapeHtml(ch.s.label)}</div>
          </a>
        `).join('')}
      </div>
    `
  }

  // ─── Render: each channel card ────────────────────────────
  function metaCardHtml () {
    const meta = getMetaLocal()
    const s = metaStatus()
    const isConnected = s.kind === 'ok'

    return `
      <section class="ae-formcard rm-channel-card" id="settings-meta-card" data-channel="meta">
        <div class="ae-formcard-h">
          <span style="display:flex; align-items:center; gap:10px;">
            ${dotForKind(s.kind)}
            <span>📘 Meta · Facebook & Instagram</span>
          </span>
          <span class="ae-formcard-h-accessory" id="settings-meta-status">${escapeHtml(s.label)}</span>
        </div>

        ${!isConnected ? `
          <div class="rm-channel-card-cta">
            <p style="margin:0 0 12px; font-size:13.5px; line-height:1.55; color:var(--rm-ink-2);">
              ¿Primera vez? Te guiamos paso a paso por Business Manager. Toma <strong>~12 minutos</strong>.
            </p>
            <a class="ae-btn-authority" href="#connect" style="text-decoration:none;">Empezar conexión guiada →</a>
            <button class="ae-btn-ghost" id="s-toggle-advanced">o pega tu token directamente ↓</button>
          </div>
        ` : ''}

        <div id="settings-result-block" style="margin-bottom:16px;"></div>

        <div class="rm-channel-card-body" id="meta-advanced-body" ${!isConnected ? 'hidden' : ''}>
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

          <div class="ae-action-row" style="margin-top:18px;">
            <button type="button" class="ae-btn-primary" id="s-save-btn">GUARDAR Y PROBAR</button>
            <button type="button" class="ae-btn-ghost" id="s-test-btn">SOLO PROBAR</button>
            <button type="button" class="ae-btn-ghost" id="s-clear-btn" style="margin-left:auto; color:var(--rm-red);">Limpiar</button>
          </div>
        </div>
      </section>
    `
  }

  function whatsappCardHtml () {
    const meta = getMetaLocal()
    const s = whatsappStatus()
    const isConnected = s.kind === 'ok'
    const metaConnected = metaStatus().kind === 'ok'

    return `
      <section class="ae-formcard rm-channel-card" data-channel="whatsapp">
        <div class="ae-formcard-h">
          <span style="display:flex; align-items:center; gap:10px;">
            ${dotForKind(s.kind)}
            <span>💬 WhatsApp Business</span>
          </span>
          <span class="ae-formcard-h-accessory">${escapeHtml(s.label)}</span>
        </div>

        ${!metaConnected ? `
          <p style="margin:0 0 8px; font-size:13.5px; color:var(--rm-ink-2); line-height:1.55;">
            WhatsApp Business API se activa con tu mismo Business Manager de Meta.
            <strong>Conecta Meta primero</strong> y luego pega tu WABA ID aquí.
          </p>
        ` : `
          <p style="margin:0 0 12px; font-size:13.5px; color:var(--rm-ink-2); line-height:1.55;">
            Pega tu WABA ID y Phone Number ID. Los puedes encontrar en
            <a href="https://business.facebook.com/wa/manage/home/" target="_blank" style="color:var(--rm-green-deep); text-decoration:underline;">WhatsApp Manager</a>.
          </p>
        `}

        <div class="ae-grid-2">
          <div class="ae-field">
            <label class="ae-field-label" for="s-waba-id">WABA ID</label>
            <input id="s-waba-id" class="ae-input" type="text"
                   placeholder="WhatsApp Business Account ID"
                   value="${escapeAttr(meta.waba_id || '')}" ${!metaConnected ? 'disabled' : ''} />
            <div class="ae-field-hint">Ej: 1234567890123456</div>
          </div>
          <div class="ae-field">
            <label class="ae-field-label" for="s-phone-id">Phone Number ID <span style="color:var(--rm-muted); font-weight:400;">· opcional</span></label>
            <input id="s-phone-id" class="ae-input" type="text"
                   placeholder="123456789012345"
                   value="${escapeAttr(meta.phone_number_id || '')}" ${!metaConnected ? 'disabled' : ''} />
            <div class="ae-field-hint">Solo si tienes varios números asociados a la WABA.</div>
          </div>
        </div>

        <div class="ae-action-row" style="margin-top:18px;">
          <button type="button" class="ae-btn-primary" id="s-wa-save-btn" ${!metaConnected ? 'disabled' : ''}>GUARDAR WHATSAPP</button>
          <a class="ae-btn-ghost" href="#whatsapp">Ver Templates →</a>
          ${isConnected ? `<a class="ae-btn-ghost" href="#wa-broadcasts" style="margin-left:auto;">Crear broadcast →</a>` : ''}
        </div>
      </section>
    `
  }

  function googleCardHtml () {
    const s = googleStatus()
    const c = state.google.conn
    const isConnected = s.kind === 'ok'

    return `
      <section class="ae-formcard rm-channel-card" data-channel="google">
        <div class="ae-formcard-h">
          <span style="display:flex; align-items:center; gap:10px;">
            ${dotForKind(s.kind)}
            <span>🔍 Google Ads</span>
          </span>
          <span class="ae-formcard-h-accessory">${escapeHtml(s.label)}</span>
        </div>

        ${isConnected ? `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px;">
            <div>
              <div class="ae-field-label" style="margin-bottom:4px;">CUSTOMER ID</div>
              <div style="font-family:var(--rm-mono); font-size:13px; color:var(--rm-ink);">${escapeHtml(c?.customer_id || '—')}</div>
            </div>
            <div>
              <div class="ae-field-label" style="margin-bottom:4px;">CUENTA</div>
              <div style="font-size:13px; color:var(--rm-ink);">${escapeHtml(c?.descriptive_name || c?.account_name || '—')}</div>
            </div>
            <div>
              <div class="ae-field-label" style="margin-bottom:4px;">MONEDA</div>
              <div style="font-size:13px; color:var(--rm-ink);">${escapeHtml(c?.currency_code || 'COP')}</div>
            </div>
          </div>
          <div class="ae-action-row" style="margin-top:18px;">
            <a class="ae-btn-primary" href="#google-campaigns" style="text-decoration:none;">Ir a Campaigns →</a>
            <button type="button" class="ae-btn-ghost" id="s-google-refresh">Renovar OAuth</button>
            <button type="button" class="ae-btn-ghost" id="s-google-disconnect" style="margin-left:auto; color:var(--rm-red);">Desconectar</button>
          </div>
        ` : `
          <p style="margin:0 0 14px; font-size:13.5px; color:var(--rm-ink-2); line-height:1.55;">
            Conecta tu cuenta de Google Ads para crear campañas de Search, Display y Performance Max
            directamente desde Rentmies. Necesitas un <strong>customer ID activo</strong> y
            (recomendado) una cuenta MCC.
          </p>
          <div class="ae-action-row">
            <a class="ae-btn-authority" href="/api/google/oauth/start" style="text-decoration:none;">
              Conectar con Google →
            </a>
            <a class="ae-btn-ghost" href="https://ads.google.com/intl/es-419/home/tools/manager-accounts/" target="_blank">
              Crear cuenta MCC ↗
            </a>
          </div>
          <details class="ae-optional" style="margin-top:14px;">
            <summary>¿Qué es lo que vamos a poder hacer? <span style="margin-left:auto; color:var(--rm-muted); font-weight:500;">resumen</span></summary>
            <div class="ae-optional-body">
              <ul style="margin:0; padding-left:20px; font-size:13px; line-height:1.7;">
                <li>Crear campañas de Search con keywords pre-armadas para inmobiliarias</li>
                <li>Lanzar Performance Max con assets multi-formato (texto + imagen + video)</li>
                <li>Capturar leads sin que el usuario salga de Google con Lead Forms</li>
                <li>Sincronizar leads automáticamente con tu agente de WhatsApp</li>
              </ul>
            </div>
          </details>
        `}
      </section>
    `
  }

  function tiktokCardHtml () {
    const s = tiktokStatus()
    const c = state.tiktok.conn
    const isConnected = s.kind === 'ok'

    return `
      <section class="ae-formcard rm-channel-card" data-channel="tiktok">
        <div class="ae-formcard-h">
          <span style="display:flex; align-items:center; gap:10px;">
            ${dotForKind(s.kind)}
            <span>🎵 TikTok</span>
          </span>
          <span class="ae-formcard-h-accessory">${escapeHtml(s.label)}</span>
        </div>

        ${isConnected ? `
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:8px;">
            ${c?.avatar_url ? `<img src="${escapeAttr(c.avatar_url)}" alt="" style="width:44px; height:44px; border-radius:50%;">` : ''}
            <div>
              <div style="font-weight:600; font-size:14px;">@${escapeHtml(c?.username || 'business')}</div>
              <div style="font-size:12px; color:var(--rm-muted);">Token expira en ${c?.token_hours_left || '—'}h · auto-refresh activo</div>
            </div>
          </div>
          <div class="ae-action-row">
            <a class="ae-btn-primary" href="#tiktok-videos" style="text-decoration:none;">Ir a Videos →</a>
            <button type="button" class="ae-btn-ghost" id="s-tiktok-refresh">Refrescar token</button>
            <button type="button" class="ae-btn-ghost" id="s-tiktok-disconnect" style="margin-left:auto; color:var(--rm-red);">Desconectar</button>
          </div>
        ` : `
          <p style="margin:0 0 14px; font-size:13.5px; color:var(--rm-ink-2); line-height:1.55;">
            Conecta tu TikTok Business Account para subir Reels verticales y programar videos.
            Token de TikTok expira cada 24h — Rentmies lo refresca automáticamente.
          </p>
          <div class="ae-action-row">
            <a class="ae-btn-authority" href="/api/tiktok/oauth/start" style="text-decoration:none;">
              Conectar con TikTok →
            </a>
            <a class="ae-btn-ghost" href="https://business.tiktok.com/" target="_blank">
              Crear TikTok Business Account ↗
            </a>
          </div>
        `}
      </section>
    `
  }

  // ─── Render: server health card ───────────────────────────
  function serverHealthCardHtml () {
    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h">
          <span>Servicios del servidor</span>
          <span class="ae-formcard-h-accessory" id="settings-health-pill">cargando…</span>
        </div>
        <div id="settings-health-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;"></div>
      </section>
    `
  }

  function accountCardHtml () {
    return `
      <section class="ae-formcard">
        <div class="ae-formcard-h"><span>Cuenta</span></div>
        <div id="settings-account" style="font-size:13px; color:var(--rm-ink-2);"></div>
        <div class="ae-action-row" style="margin-top:14px;">
          <a href="/login" class="ae-btn-ghost" id="settings-account-cta">Iniciar sesión</a>
        </div>
      </section>
    `
  }

  // ─── Whole page HTML ──────────────────────────────────────
  function html () {
    return `
      <div class="rp-page rp-rise">

        <div class="rp-page-header">
          <span class="rp-eyebrow">CONFIGURACIÓN · INTEGRACIONES</span>
          <h1 class="rp-display">Conecta tus <em>canales</em></h1>
          <p class="rp-subhead">Una conexión por canal — Meta, WhatsApp, Google, TikTok. Cada conexión vive en su propio card y mantiene su salud independiente. Puedes empezar con el que ya tienes y agregar el resto cuando quieras.</p>
        </div>

        <!-- Status overview row -->
        ${overviewRowHtml()}

        <!-- Channel cards -->
        ${metaCardHtml()}
        ${whatsappCardHtml()}
        ${googleCardHtml()}
        ${tiktokCardHtml()}

        <!-- Server status + Account -->
        ${serverHealthCardHtml()}
        ${accountCardHtml()}
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

  // ─── Server actions ──────────────────────────────────────
  async function loadMetaConnection () {
    try {
      const r = await fetch('/api/credentials/meta', { headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' } })
      if (!r.ok) return
      state.meta.conn = await r.json()
    } catch (_) {}
  }

  async function loadGoogleConnection () {
    try {
      const r = await fetch('/api/google/connection', { headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' } })
      state.google.loaded = true
      if (!r.ok) {
        state.google.conn = null
        return
      }
      state.google.conn = await r.json()
    } catch (_) {
      state.google.loaded = true
      state.google.conn = null
    }
  }

  async function loadTikTokConnection () {
    try {
      const r = await fetch('/api/tiktok/connection', { headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' } })
      state.tiktok.loaded = true
      if (!r.ok) {
        state.tiktok.conn = null
        return
      }
      state.tiktok.conn = await r.json()
    } catch (_) {
      state.tiktok.loaded = true
      state.tiktok.conn = null
    }
  }

  function readMetaForm () {
    return {
      access_token: $('s-token')?.value.trim() || '',
      page_id:      $('s-page-id')?.value.trim() || '',
      instagram_id: $('s-ig-id')?.value.trim() || '',
      waba_id:      $('s-waba-id')?.value.trim() || ''
    }
  }

  async function saveMeta (alsoTest) {
    const form = readMetaForm()
    if (!form.access_token) { window.rmToast?.('Pega el access token primero', 'error'); return }
    if (!form.page_id)      { window.rmToast?.('Pega el Page ID primero', 'error'); return }

    const saveBtn = $('s-save-btn')
    saveBtn.disabled = true
    const originalLabel = saveBtn.textContent
    saveBtn.textContent = alsoTest ? 'PROBANDO…' : 'GUARDANDO…'

    try {
      const r = await fetch('/api/credentials/meta', {
        method: 'POST',
        headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error guardando')

      const meta = getMetaLocal()
      Object.assign(meta, {
        access_token: form.access_token,
        page_id: form.page_id,
        ig_user_id: form.instagram_id,
        waba_id: form.waba_id
      })
      setMetaLocal(meta)

      if (alsoTest) await runMetaTest(form)
      else window.rmToast?.('✅ Credenciales guardadas', 'success')
      await loadMetaConnection()
      renderResult()
      renderHeaderStatus()
    } catch (err) {
      window.rmToast?.('Error: ' + err.message, 'error')
    } finally {
      saveBtn.disabled = false
      saveBtn.textContent = originalLabel
    }
  }

  async function runMetaTest (form) {
    const r = await fetch('/api/credentials/meta/test', {
      method: 'POST',
      headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' },
      body: JSON.stringify(form || readMetaForm())
    })
    state.meta.testResult = await r.json()
    if (state.meta.testResult.ok) {
      window.rmToast?.(`✅ Conectado a ${state.meta.testResult.page_name}`, 'success')
    } else {
      window.rmToast?.(`✗ ${state.meta.testResult.error || 'Test falló'}`, 'error')
    }
  }

  async function metaTestOnly () {
    const form = readMetaForm()
    if (!form.access_token || !form.page_id) {
      window.rmToast?.('Pega token y Page ID primero', 'error'); return
    }
    const btn = $('s-test-btn')
    btn.disabled = true
    const orig = btn.textContent
    btn.textContent = 'PROBANDO…'
    try {
      await runMetaTest(form)
      renderResult()
      await loadMetaConnection()
      renderHeaderStatus()
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  }

  function clearMeta () {
    if (!confirm('¿Borrar las credenciales del navegador? La conexión en servidor queda intacta hasta que guardes una nueva.')) return
    localStorage.removeItem('meta_creds')
    localStorage.removeItem('wa_access_token')
    localStorage.removeItem('wa_waba_id')
    ;['s-token','s-page-id','s-ig-id','s-waba-id','s-phone-id'].forEach(id => { const el = $(id); if (el) el.value = '' })
    state.meta.testResult = null
    renderResult()
    window.rmToast?.('Credenciales locales limpiadas', 'info')
  }

  function toggleMetaToken () {
    state.showToken = !state.showToken
    const inp = $('s-token')
    const btn = $('s-token-toggle')
    if (inp) inp.type = state.showToken ? 'text' : 'password'
    if (btn) btn.textContent = state.showToken ? 'OCULTAR' : 'MOSTRAR'
  }

  async function saveWhatsApp () {
    const waba = $('s-waba-id')?.value.trim()
    const phoneId = $('s-phone-id')?.value.trim()
    if (!waba) { window.rmToast?.('Pega el WABA ID primero', 'error'); return }
    const meta = getMetaLocal()
    Object.assign(meta, { waba_id: waba, phone_number_id: phoneId })
    setMetaLocal(meta)

    // Persist to server (reuses meta endpoint)
    try {
      const form = readMetaForm()
      form.waba_id = waba
      const r = await fetch('/api/credentials/meta', {
        method: 'POST',
        headers: window.rmApi?.authHeaders() || { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || 'Error guardando')
      }
      window.rmToast?.('✅ WhatsApp configurado', 'success')
      await loadMetaConnection()
      renderHeaderStatus()
    } catch (err) {
      window.rmToast?.('Error: ' + err.message, 'error')
    }
  }

  // ─── Server health (env vars) ─────────────────────────────
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
      { label: 'Google Ads token', ok: !!env.google_ads,    detail: env.google_ads ? 'developer token configurado' : 'falta GOOGLE_ADS_DEVELOPER_TOKEN' },
      { label: 'Google AI',        ok: !!env.google_ai,     detail: env.google_ai ? 'configurada' : 'opcional' },
      { label: 'TikTok app',       ok: !!env.tiktok,        detail: env.tiktok ? 'TIKTOK_APP_ID/SECRET ok' : 'opcional · no integrado todavía' }
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

  function renderResult () {
    const block = $('settings-result-block')
    if (block) block.innerHTML = resultBlockHtml(state.meta.testResult)
  }

  function renderHeaderStatus () {
    const status = $('settings-meta-status')
    if (!status) return
    const s = metaStatus()
    status.textContent = s.label
  }

  // ─── Help modal (kept from old version) ───────────────────
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

  function injectStyles () {
    if ($('rm-settings-styles')) return
    const css = `
      /* Channel overview tiles */
      .rm-channels-overview { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:28px; }
      .rm-channel-tile { display:block; padding:16px 18px; background:var(--rp-surface, #fff); border:1px solid var(--rm-border, #e8e3dc); border-radius:8px; text-decoration:none; color:inherit; transition:transform .15s, box-shadow .15s, border-color .15s; cursor:pointer; }
      .rm-channel-tile:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,0.06); border-color:var(--rp-teal, #40d99d); }
      .rm-channel-tile-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .rm-channel-tile-emoji { font-size:20px; }
      .rm-channel-tile-label { font-size:14px; font-weight:600; color:var(--rm-ink, #0f1410); margin-bottom:2px; }
      .rm-channel-tile-status { font-size:11.5px; color:var(--rm-muted, #7a7e79); font-family:var(--rm-mono); }
      .rm-channel-tile.rm-status-ok    { border-color: rgba(64,217,157,0.4); }
      .rm-channel-tile.rm-status-warn  { border-color: rgba(245,158,11,0.4); }
      .rm-channel-tile.rm-status-off   { border-color: var(--rm-border, #e8e3dc); }

      /* Channel cards on settings page */
      .rm-channel-card { margin-bottom: 18px; }
      .rm-channel-card-cta { padding:14px 16px; background:linear-gradient(135deg, rgba(64,217,157,0.10), rgba(0,108,74,0.04)); border-radius:6px; margin-bottom:14px; }
      .rm-channel-card-body[hidden] { display:none; }

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
    s.id = 'rm-settings-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  // ─── Wire ─────────────────────────────────────────────────
  function wire () {
    $('s-save-btn')?.addEventListener('click', () => saveMeta(true))
    $('s-test-btn')?.addEventListener('click', metaTestOnly)
    $('s-clear-btn')?.addEventListener('click', clearMeta)
    $('s-token-toggle')?.addEventListener('click', toggleMetaToken)
    $('s-help-link')?.addEventListener('click', openHelpModal)
    $('s-toggle-advanced')?.addEventListener('click', () => {
      const body = $('meta-advanced-body')
      if (body) body.hidden = !body.hidden
    })
    $('s-wa-save-btn')?.addEventListener('click', saveWhatsApp)
    // Smooth scroll to channel card on overview tile click
    document.querySelectorAll('[data-jump]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault()
        const target = document.querySelector(`[data-channel="${el.dataset.jump}"]`)
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  async function mount () {
    const slot = document.querySelector('section[data-page="settings"]')
    if (!slot) return
    state.meta.testResult = null
    state.meta.conn = null
    state.google.loaded = false
    state.tiktok.loaded = false

    injectStyles()
    slot.innerHTML = html()
    wire()
    renderHealth()
    renderAccount()

    // Load all four channel statuses in parallel
    Promise.all([
      loadMetaConnection(),
      loadGoogleConnection(),
      loadTikTokConnection()
    ]).then(() => {
      // Re-render tiles + meta header
      const slot2 = document.querySelector('section[data-page="settings"]')
      if (!slot2) return
      const overview = slot2.querySelector('.rm-channels-overview')
      if (overview) overview.outerHTML = overviewRowHtml()
      // Re-wire tile clicks after re-render
      document.querySelectorAll('[data-jump]').forEach(el => {
        el.addEventListener('click', e => {
          e.preventDefault()
          const target = document.querySelector(`[data-channel="${el.dataset.jump}"]`)
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      })
      renderHeaderStatus()
    })
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'settings') mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'studio') === 'settings') mount()
  })
})()
