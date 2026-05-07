/* ─────────────────────────────────────────────────────────────
   RENTMIES — Connect Wizard
   /dashboard#connect — guided 6-step Meta onboarding for non-tech
   real-estate agents. Replaces the freeform Settings paste-token
   flow as the first-time experience.

   Architecture:
     - Single state machine (state.step 1..6, completed[], data{})
     - localStorage 'rentmies_wizard_state' so refresh keeps progress
     - Each step renders into the .cw-content container
     - Right .cw-coach panel shows progress dots + italic-serif quote
     - Step 5 calls /api/wizard/validate-token on paste (debounced)
     - Step 6 calls /api/credentials/meta to persist + flips to active
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const STORAGE_KEY = 'rentmies_wizard_state'
  const TOTAL_STEPS = 6

  // Public config — fetched from /api/wizard/config on mount
  let publicConfig = {
    meta_app_id: '',
    calendly_url: 'https://calendly.com/rentmies/onboarding',
    whatsapp_number: '+57 300 000 0000',
    whatsapp_url: 'https://wa.me/573000000000',
    has_app_id: false
  }

  let state = loadState()
  let validateAbortCtrl = null

  // ── Persistence ────────────────────────────────────────────

  function loadState () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed && typeof parsed.step === 'number') {
        return {
          step: clampStep(parsed.step),
          completed: Array.isArray(parsed.completed) ? parsed.completed : new Array(TOTAL_STEPS).fill(false),
          data: parsed.data || {}
        }
      }
    } catch (_) { /* fall through */ }
    return { step: 1, completed: new Array(TOTAL_STEPS).fill(false), data: {} }
  }

  function saveState () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (_) {}
  }

  function clampStep (n) { return Math.max(1, Math.min(TOTAL_STEPS, n | 0)) }

  function advance () {
    state.completed[state.step - 1] = true
    if (state.step < TOTAL_STEPS) state.step++
    saveState()
    render()
  }

  function gotoStep (n) {
    n = clampStep(n)
    // Block jumping forward past the next-uncompleted step
    const firstIncomplete = state.completed.findIndex(c => !c)
    const maxAllowed = firstIncomplete === -1 ? TOTAL_STEPS : firstIncomplete + 1
    if (n > maxAllowed) return
    state.step = n
    saveState()
    render()
  }

  function resetWizard () {
    state = { step: 1, completed: new Array(TOTAL_STEPS).fill(false), data: {} }
    saveState()
  }

  // ── Auth + supabase helpers (same patterns as page-settings.js) ──

  function authToken () { return localStorage.getItem('sb_token') || '' }
  function authHeaders () {
    const t = authToken()
    let empresaId = ''
    try { empresaId = (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || '' } catch (_) {}
    const h = { 'Content-Type': 'application/json' }
    if (t) h.Authorization = 'Bearer ' + t
    else { h.Authorization = 'Bearer demo_local'; h['x-empresa-id'] = empresaId || 'demo' }
    return h
  }

  // ── Tiny utils ─────────────────────────────────────────────

  function $(sel, root) { return (root || document).querySelector(sel) }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)) }
  function escapeHtml (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) }
  function fmtN (n) { if (!n) return '0'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n) }

  function copyToClipboard (text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flashCopied(btn))
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); flashCopied(btn) } catch (_) {}
      ta.remove()
    }
  }
  function flashCopied (btn) {
    if (!btn) return
    const orig = btn.textContent
    btn.textContent = '✓ COPIADO'
    btn.classList.add('copied')
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied') }, 1500)
  }

  // ── Coach panel (right column) ─────────────────────────────

  const COACH_LABELS = [
    'Verificar Business Manager',
    'Instalar Rentmies app',
    'Crear System User',
    'Asignar Página + IG',
    'Generar token',
    '¡Listo para publicar!'
  ]

  const COACH_QUOTES = [
    'Antes de empezar, verifiquemos que tienes lo básico para conectar.',
    'Esta parte es la más confusa de Meta. Sigue el botón — yo te llevo derecho al lugar exacto.',
    'Un robot inofensivo. Solo vive para hablar con Meta en tu nombre, sin contraseña ni cara.',
    'Aquí es donde la gente se equivoca: marca <em>TODOS</em> los permisos, no solo algunos.',
    'El token aparece <em>una sola vez</em>. Cópialo apenas lo veas — yo me encargo del resto.',
    'Increíble. Ya estás conectado. ¿Listos para tu primer post?'
  ]

  const SPARKLE = `<svg viewBox="0 0 24 24"><path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z" fill="currentColor"/></svg>`

  function coachHtml () {
    const stepsHtml = COACH_LABELS.map((label, i) => {
      const num = i + 1
      const cls = state.completed[i] ? 'done' : (state.step === num ? 'current' : '')
      return `
        <button class="cw-coach-step ${cls}" data-go-step="${num}" type="button">
          <span class="cw-coach-dot">${state.completed[i] ? '' : ''}</span>
          <span>${num}. ${escapeHtml(label)}</span>
        </button>
      `
    }).join('')

    const quote = COACH_QUOTES[state.step - 1] || ''

    return `
      <div class="cw-coach-h">
        <div class="cw-coach-icon">${SPARKLE}</div>
        <div>
          <div class="cw-coach-eyebrow">Tu guía de conexión</div>
          <div class="cw-coach-title">Camilo AI</div>
        </div>
      </div>

      <div class="cw-coach-progress">${stepsHtml}</div>

      <div class="cw-coach-quote">${quote}</div>

      <div class="cw-help">
        <div class="cw-help-title">¿Te perdiste? Hablemos.</div>
        <a class="cw-help-link" href="${escapeHtml(publicConfig.calendly_url)}" target="_blank" rel="noopener">
          📅 Agendar llamada (15 min)
        </a>
        <a class="cw-help-link" href="${escapeHtml(publicConfig.whatsapp_url)}" target="_blank" rel="noopener">
          💬 WhatsApp ${escapeHtml(publicConfig.whatsapp_number)}
        </a>
      </div>
    `
  }

  // ── Progress bar header ────────────────────────────────────

  function progressHtml () {
    const segs = Array.from({ length: TOTAL_STEPS }, (_, i) => {
      const cls = state.completed[i] ? 'done' : (state.step === i + 1 ? 'current' : '')
      return `<div class="cw-progress-seg ${cls}"></div>`
    }).join('')
    const stepTitle = COACH_LABELS[state.step - 1] || ''
    return `
      <div class="cw-progress-bar">
        <div class="cw-progress-row">
          <span class="cw-progress-eyebrow">CONECTANDO TU META</span>
          <span class="cw-progress-display">Paso ${state.step} de ${TOTAL_STEPS} · <em>${escapeHtml(stepTitle)}</em></span>
        </div>
        <div class="cw-progress-meter">${segs}</div>
      </div>
    `
  }

  // ── STEP 1 — Verify Business Manager ───────────────────────

  function step1Html () {
    const verifyBm = state.data.bm_verify_path
    return `
      <div class="cw-step-eyebrow">PASO 1 · VERIFICACIÓN INICIAL</div>
      <h1 class="cw-step-display">¿Tienes <em>Business Manager</em>?</h1>
      <p class="cw-step-lede">
        Business Manager es el lugar de Meta donde tu inmobiliaria organiza sus páginas. Si tu Facebook Page la creaste tú mismo,
        probablemente ya lo tienes. Si no, te creamos uno en 30 segundos.
      </p>

      <div class="cw-choice-row">
        <button class="cw-choice" type="button" data-bm-path="have">
          <div class="cw-choice-icon ok">✓</div>
          <div class="cw-choice-title">Sí, ya tengo</div>
          <div class="cw-choice-desc">Pasamos al siguiente paso ahora mismo.</div>
        </button>
        <button class="cw-choice" type="button" data-bm-path="verify">
          <div class="cw-choice-icon help">?</div>
          <div class="cw-choice-title">No estoy seguro</div>
          <div class="cw-choice-desc">Lo verificamos juntos en 1 minuto.</div>
        </button>
      </div>

      ${verifyBm === 'verify' ? `
        <div class="cw-card with-accent" style="margin-top:24px;">
          <h3 class="cw-card-h">📋 Te abrimos Meta en una pestaña nueva</h3>
          <p class="cw-card-body">
            Te llevo a <strong>business.facebook.com/select</strong>. Si ves una lista de negocios, ya tienes Business Manager.
            Si solo ves tu cuenta personal, necesitamos crear uno (te guío en el subflujo).
          </p>
          <a class="cw-open-meta" href="https://business.facebook.com/select/?type=multi" target="_blank" rel="noopener">
            Abrir Meta · Lista de negocios →
          </a>
          <div style="margin-top:18px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <button class="cw-btn-primary" type="button" data-bm-result="found">Veo una lista ✓</button>
            <button class="cw-btn-ghost" type="button" data-bm-result="none">Solo veo personal</button>
          </div>
        </div>
      ` : ''}

      ${verifyBm === 'create-bm' ? `
        <div class="cw-card warning" style="margin-top:24px;">
          <h3 class="cw-card-h">⚙️ Necesitas crear un Business Manager</h3>
          <p class="cw-card-body">
            Es gratis y toma menos de 1 minuto. Te abrimos el formulario de Meta:
          </p>
          <a class="cw-open-meta" href="https://business.facebook.com/overview/" target="_blank" rel="noopener">
            Abrir formulario de Meta →
          </a>
          <div class="cw-steps">
            <div class="cw-stepitem"><div class="cw-stepitem-num">1</div><div class="cw-stepitem-text">Llena el nombre de tu inmobiliaria (tu nombre real funciona).</div></div>
            <div class="cw-stepitem"><div class="cw-stepitem-num">2</div><div class="cw-stepitem-text">Email del negocio — puede ser tu Gmail personal.</div></div>
            <div class="cw-stepitem"><div class="cw-stepitem-num">3</div><div class="cw-stepitem-text">Acepta los términos de Meta.</div></div>
            <div class="cw-stepitem"><div class="cw-stepitem-num">4</div><div class="cw-stepitem-text">Vuelve aquí cuando termines.</div></div>
          </div>
          <div style="margin-top:14px;">
            <button class="cw-btn-primary" type="button" data-bm-confirm-created>Ya creé mi Business Manager →</button>
          </div>
        </div>
      ` : ''}
    `
  }

  function wireStep1 (root) {
    $$('.cw-choice', root).forEach(btn => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.bmPath
        if (path === 'have') {
          state.data.bm = 'confirmed'
          saveState()
          advance()
        } else {
          state.data.bm_verify_path = 'verify'
          saveState()
          render()
        }
      })
    })
    $$('[data-bm-result]', root).forEach(btn => {
      btn.addEventListener('click', () => {
        const r = btn.dataset.bmResult
        if (r === 'found') {
          state.data.bm = 'confirmed'
          delete state.data.bm_verify_path
          saveState()
          advance()
        } else {
          state.data.bm_verify_path = 'create-bm'
          saveState()
          render()
        }
      })
    })
    $$('[data-bm-confirm-created]', root).forEach(btn => {
      btn.addEventListener('click', () => {
        state.data.bm = 'created'
        delete state.data.bm_verify_path
        saveState()
        advance()
      })
    })
  }

  // ── STEP 2 — Install App ───────────────────────────────────

  function step2Html () {
    const appId = publicConfig.meta_app_id
    return `
      <div class="cw-step-eyebrow">PASO 2 · INSTALACIÓN DE APP</div>
      <h1 class="cw-step-display">Instala <em>Rentmies</em> como app en tu negocio</h1>
      <p class="cw-step-lede">
        Para que Rentmies pueda publicar en tu nombre, primero tienes que "instalarla" como una app autorizada dentro de tu Business Manager.
        Es como darle una llave para entrar.
      </p>

      <div class="cw-card with-accent">
        <h3 class="cw-card-h">📋 Pasos exactos</h3>
        <div class="cw-steps">
          <div class="cw-stepitem"><div class="cw-stepitem-num">1</div><div class="cw-stepitem-text">Te abrimos directamente el panel de <strong>Apps</strong> en Meta Business Settings.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">2</div><div class="cw-stepitem-text">Haz clic en <strong>"Connect Apps"</strong> → <strong>"Connect Your App"</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">3</div><div class="cw-stepitem-text">Pega este App ID:</div></div>
        </div>

        <div class="cw-copybox">
          <div class="cw-copybox-value">${appId ? escapeHtml(appId) : '— configurar META_APP_ID en el servidor —'}</div>
          <button class="cw-copy-btn" type="button" data-copy="${escapeHtml(appId)}" ${appId ? '' : 'disabled'}>COPIAR</button>
        </div>
        <div class="cw-copybox-label">App ID de Rentmies — copia y pega este número en Meta</div>

        <div class="cw-steps" style="margin-top:14px;">
          <div class="cw-stepitem"><div class="cw-stepitem-num">4</div><div class="cw-stepitem-text">Vuelve aquí cuando veas <strong>"Rentmies"</strong> en tu lista de apps.</div></div>
        </div>

        <a class="cw-open-meta" href="https://business.facebook.com/settings/apps/" target="_blank" rel="noopener">
          Abrir panel de Apps de Meta →
        </a>
      </div>

      <div class="cw-card warning">
        <h3 class="cw-card-h">⚠️ ¿No ves Rentmies en tu lista?</h3>
        <p class="cw-card-body">
          Espera 2-3 minutos. Meta tarda en propagar la instalación. Refresca la página de Apps.
          Si después de 5 minutos sigue sin aparecer, agenda una llamada — te ayudamos en vivo.
        </p>
      </div>

      <div class="cw-actions">
        <button class="cw-btn-primary" type="button" data-confirm-step>Ya instalé la app →</button>
        <button class="cw-btn-ghost" type="button" data-go-step="1">← Volver al paso 1</button>
      </div>
    `
  }

  // ── STEP 3 — Create System User ────────────────────────────

  function step3Html () {
    return `
      <div class="cw-step-eyebrow">PASO 3 · USUARIO ROBOT</div>
      <h1 class="cw-step-display">Crea un <em>"Rentmies Connection"</em></h1>
      <p class="cw-step-lede">
        Un <strong>System User</strong> es un usuario robot que vive dentro de tu Business Manager. No tiene cara, no tiene contraseña — solo
        existe para que Rentmies pueda hablar con Meta de forma segura.
      </p>

      <div class="cw-card with-accent">
        <h3 class="cw-card-h">🤖 Pasos exactos</h3>
        <div class="cw-steps">
          <div class="cw-stepitem"><div class="cw-stepitem-num">1</div><div class="cw-stepitem-text">Te abrimos directamente la página de <strong>System Users</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">2</div><div class="cw-stepitem-text">Haz clic en <strong>"+ Add"</strong> (esquina superior).</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">3</div><div class="cw-stepitem-text">Como nombre, copia esto exacto:</div></div>
        </div>

        <div class="cw-copybox">
          <div class="cw-copybox-value small">Rentmies Connection</div>
          <button class="cw-copy-btn" type="button" data-copy="Rentmies Connection">COPIAR</button>
        </div>

        <div class="cw-steps" style="margin-top:10px;">
          <div class="cw-stepitem"><div class="cw-stepitem-num">4</div><div class="cw-stepitem-text">Como rol, selecciona <strong>"Admin"</strong> (no Editor — necesita Admin para postear).</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">5</div><div class="cw-stepitem-text">Guarda. Vuelve aquí cuando veas tu nuevo System User en la lista.</div></div>
        </div>

        <a class="cw-open-meta" href="https://business.facebook.com/settings/system-users/" target="_blank" rel="noopener">
          Abrir panel de System Users →
        </a>
      </div>

      <div class="cw-card warning">
        <h3 class="cw-card-h">⚠️ ¿No aparece "System Users" en tu menú?</h3>
        <p class="cw-card-body">
          Necesitas ser <strong>Admin</strong> del Business Manager. Si solo eres Editor, pídele a otro admin que te haga Admin primero.
        </p>
      </div>

      <div class="cw-actions">
        <button class="cw-btn-primary" type="button" data-confirm-step>Ya creé el System User →</button>
        <button class="cw-btn-ghost" type="button" data-go-step="2">← Volver</button>
      </div>
    `
  }

  // ── STEP 4 — Assign Assets ─────────────────────────────────

  function step4Html () {
    return `
      <div class="cw-step-eyebrow">PASO 4 · PERMISOS</div>
      <h1 class="cw-step-display">Dale acceso a tu <em>Página de Facebook</em></h1>
      <p class="cw-step-lede">
        Ahora tienes que decirle al System User <strong>"Rentmies Connection"</strong> que tiene permiso para manejar tu Página de Facebook
        (y tu Instagram, si lo tienes conectado).
      </p>

      <div class="cw-card with-accent">
        <h3 class="cw-card-h">🎯 Pasos exactos</h3>
        <div class="cw-steps">
          <div class="cw-stepitem"><div class="cw-stepitem-num">1</div><div class="cw-stepitem-text">Vuelve a la lista de System Users.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">2</div><div class="cw-stepitem-text">Haz clic en <strong>"Rentmies Connection"</strong> (el que acabaste de crear).</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">3</div><div class="cw-stepitem-text">Haz clic en <strong>"Add Assets"</strong> (o <strong>"Assign Assets"</strong>).</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">4</div><div class="cw-stepitem-text">Selecciona <strong>"Pages"</strong> → tu Página de inmobiliaria.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">5</div><div class="cw-stepitem-text">Si tienes Instagram conectado, repite con <strong>"Instagram accounts"</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">6</div><div class="cw-stepitem-text">En la pantalla de permisos, marca <strong>TODAS</strong> las opciones — incluido <strong>"Manage Page"</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">7</div><div class="cw-stepitem-text">Guarda.</div></div>
        </div>

        <a class="cw-open-meta" href="https://business.facebook.com/settings/system-users/" target="_blank" rel="noopener">
          Abrir System Users de nuevo →
        </a>
      </div>

      <div class="cw-card warning">
        <h3 class="cw-card-h">⚠️ El error más común: solo marcar "View"</h3>
        <p class="cw-card-body">
          Si solo marcas <strong>"View"</strong> o <strong>"Analyze"</strong>, Rentmies podrá leer datos pero <strong>no</strong> publicar.
          Asegúrate de marcar <strong>TODAS las casillas</strong> (Full control / Manage Page).
        </p>
      </div>

      <div class="cw-card">
        <h3 class="cw-card-h">📷 ¿Tu Instagram no aparece en la lista?</h3>
        <p class="cw-card-body">
          Tu cuenta de Instagram debe ser <strong>Business</strong> o <strong>Creator</strong>.
          Conviértela en Instagram → Settings → Account → <em>Switch to Professional</em>.
          Y debe estar vinculada a tu Página de Facebook.
        </p>
      </div>

      <div class="cw-actions">
        <button class="cw-btn-primary" type="button" data-confirm-step>Ya asigné mis assets →</button>
        <button class="cw-btn-ghost" type="button" data-go-step="3">← Volver</button>
      </div>
    `
  }

  // ── STEP 5 — Generate Token + auto-validate ────────────────

  const REQUIRED_PERMS = [
    { name: 'pages_show_list',           why: 'Listar tus páginas' },
    { name: 'pages_manage_posts',        why: 'Publicar en tu página' },
    { name: 'pages_read_engagement',     why: 'Leer tus métricas' },
    { name: 'instagram_basic',           why: 'Conectar tu Instagram' },
    { name: 'instagram_content_publish', why: 'Publicar en Instagram' },
    { name: 'business_management',       why: 'Acceso al negocio' },
    { name: 'public_profile',            why: 'Tu nombre/avatar' }
  ]

  function step5Html () {
    const permList = REQUIRED_PERMS.map(p => `
      <div class="cw-perm">
        <span class="cw-perm-check">✓</span>
        <span class="cw-perm-name">${escapeHtml(p.name)}</span>
        <span class="cw-perm-why">${escapeHtml(p.why)}</span>
      </div>
    `).join('')

    const allPermsString = REQUIRED_PERMS.map(p => p.name).join(', ')
    const tokenValue = state.data.token || ''

    return `
      <div class="cw-step-eyebrow">PASO 5 · LLAVE DE ACCESO</div>
      <h1 class="cw-step-display">Genera tu <em>token</em> y pégalo aquí</h1>
      <p class="cw-step-lede">
        Esta es la llave que Rentmies usa para publicar en tu nombre. Solo aparece <strong>UNA VEZ</strong> — cópiala bien y pégala abajo.
        No la compartas con nadie más que con Rentmies.
      </p>

      <div class="cw-card with-accent">
        <h3 class="cw-card-h">🔑 Pasos exactos</h3>
        <div class="cw-steps">
          <div class="cw-stepitem"><div class="cw-stepitem-num">1</div><div class="cw-stepitem-text">En <strong>"Rentmies Connection"</strong>, busca el botón <strong>"Generate New Token"</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">2</div><div class="cw-stepitem-text">Selecciona la app: <strong>"Rentmies"</strong> (la que instalaste en paso 2).</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">3</div><div class="cw-stepitem-text">Marca <strong>EXACTAMENTE</strong> estos 7 permisos:</div></div>
        </div>

        <div class="cw-perms">${permList}</div>

        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          <button class="cw-copy-btn" type="button" data-copy="${escapeHtml(allPermsString)}" style="padding:10px 16px;">COPIAR LISTA DE PERMISOS</button>
          <span style="font-size:11px; color:var(--rp-muted);">para pegar en un buscador rápido si Meta tiene muchos checkboxes</span>
        </div>

        <div class="cw-steps">
          <div class="cw-stepitem"><div class="cw-stepitem-num">4</div><div class="cw-stepitem-text">Click <strong>"Generate Token"</strong>.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">5</div><div class="cw-stepitem-text">Aparecerá un token largo que empieza con <strong>"EAA..."</strong>. Cópialo INMEDIATAMENTE.</div></div>
          <div class="cw-stepitem"><div class="cw-stepitem-num">6</div><div class="cw-stepitem-text">Si cierras esa ventana sin copiarlo, tendrás que generar uno nuevo (no se puede ver de nuevo).</div></div>
        </div>

        <a class="cw-open-meta" href="https://business.facebook.com/settings/system-users/" target="_blank" rel="noopener">
          Abrir System Users para generar token →
        </a>
      </div>

      <div class="cw-card">
        <h3 class="cw-card-h">📋 Pega tu token</h3>
        <div class="cw-token-field">
          <textarea id="cw-token-input" placeholder="Pega aquí tu token (empieza con EAA...)" autocomplete="off" spellcheck="false">${escapeHtml(tokenValue)}</textarea>
        </div>
        <div class="cw-token-status empty" id="cw-token-status">
          <span class="cw-status-dot"></span>
          <span class="cw-status-text">Esperando tu token...</span>
        </div>
        <div id="cw-page-picker"></div>
      </div>

      <div class="cw-actions">
        <button class="cw-btn-ghost" type="button" data-go-step="4">← Volver</button>
      </div>
    `
  }

  function setTokenStatus (kind, text) {
    const el = document.getElementById('cw-token-status')
    if (!el) return
    el.classList.remove('empty', 'short', 'checking', 'valid', 'error')
    el.classList.add(kind)
    const t = el.querySelector('.cw-status-text')
    if (t) t.textContent = text
  }

  let validateDebounce = null
  function wireStep5 (root) {
    const ta = document.getElementById('cw-token-input')
    if (!ta) return

    function handleInput () {
      const v = ta.value.trim()
      state.data.token = v
      saveState()

      if (validateAbortCtrl) { validateAbortCtrl.abort(); validateAbortCtrl = null }
      clearTimeout(validateDebounce)

      const picker = document.getElementById('cw-page-picker')
      if (picker) picker.innerHTML = ''

      if (!v) { setTokenStatus('empty', 'Esperando tu token...'); return }
      if (!v.startsWith('EAA')) { setTokenStatus('short', 'Un token de Meta empieza con "EAA". Revisa que copiaste el correcto.'); return }
      if (v.length < 100) { setTokenStatus('short', 'Token muy corto, ¿lo copiaste completo?'); return }

      setTokenStatus('checking', 'Se ve bien — verificando con Meta...')
      validateDebounce = setTimeout(() => validateToken(v), 800)
    }

    ta.addEventListener('input', handleInput)
    ta.addEventListener('paste', () => setTimeout(handleInput, 50))

    // Auto-trigger if we already have a token in state (returning to step)
    if (ta.value.trim()) handleInput()
  }

  async function validateToken (token) {
    validateAbortCtrl = new AbortController()
    try {
      const r = await fetch('/api/wizard/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: validateAbortCtrl.signal
      })
      const j = await r.json()
      if (!j.valid) {
        setTokenStatus('error', j.message || 'Token inválido. Vuelve al paso 5.')
        return
      }

      // Found pages
      if (j.pages.length === 1) {
        const p = j.pages[0]
        state.data.validated = { me_name: j.me_name, page: p }
        saveState()
        setTokenStatus('valid', `✓ Conectado a "${p.name}". Avanzando...`)
        setTimeout(() => advance(), 700)
      } else {
        setTokenStatus('valid', `✓ Token válido — ${j.pages.length} páginas encontradas. Elige cuál usar:`)
        renderPagePicker(j.pages, j.me_name)
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setTokenStatus('error', 'Error de red. Revisa tu conexión y vuelve a intentar.')
    }
  }

  function renderPagePicker (pages, meName) {
    const el = document.getElementById('cw-page-picker')
    if (!el) return
    el.innerHTML = `
      <div class="cw-page-picker">
        ${pages.map((p, i) => `
          <button class="cw-page-pick" type="button" data-page-idx="${i}">
            <span class="cw-page-pick-pic" ${p.picture ? `style="background-image:url('${escapeHtml(p.picture)}')"` : ''}></span>
            <span class="cw-page-pick-body">
              <span class="cw-page-pick-name">${escapeHtml(p.name)}</span>
              <span class="cw-page-pick-meta">${fmtN(p.followers)} seguidores${p.ig_id ? ' · IG vinculado' : ''}</span>
            </span>
          </button>
        `).join('')}
      </div>
    `
    el.querySelectorAll('[data-page-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.pageIdx
        const p = pages[i]
        state.data.validated = { me_name: meName, page: p }
        saveState()
        advance()
      })
    })
  }

  // ── STEP 6 — Success + persist ─────────────────────────────

  function step6Html () {
    const v = state.data.validated || {}
    const page = v.page || {}
    const ig = page.instagram

    return `
      <div class="cw-celebrate">
        <div class="cw-confetti" aria-hidden="true">
          ${'<span></span>'.repeat(10)}
        </div>
        <div class="cw-celebrate-eyebrow">CONEXIÓN EXITOSA</div>
        <h1 class="cw-celebrate-title">¡Listo! Tu cuenta <em>está conectada</em>.</h1>
        <p class="cw-celebrate-sub">"Felicitaciones — ya estás listo. Tu primer post está a 60 segundos. ¿Quieres que escribamos uno juntos?"</p>

        <div class="cw-asset-summary">
          <div class="cw-asset-row">
            <span class="cw-asset-emoji">📘</span>
            <strong>Facebook Page:</strong>
            <span>${escapeHtml(page.name || 'tu Página')}${page.followers ? ' · ' + fmtN(page.followers) + ' seguidores' : ''}</span>
          </div>
          ${ig ? `
            <div class="cw-asset-row">
              <span class="cw-asset-emoji">📷</span>
              <strong>Instagram:</strong>
              <span>@${escapeHtml(ig.username || '')}${ig.followers ? ' · ' + fmtN(ig.followers) + ' seguidores' : ''}</span>
            </div>
          ` : `
            <div class="cw-asset-row muted">
              <span class="cw-asset-emoji">📷</span>
              <span>Instagram no detectado · puedes agregarlo después en Settings.</span>
            </div>
          `}
        </div>

        <div class="cw-celebrate-cta">
          <a class="cw-cta primary" href="#quickpost" data-cw-finish>✦ Publicar mi primer post</a>
          <a class="cw-cta secondary" href="#inmuebles" data-cw-finish>Ver mi inventario</a>
          <a class="cw-cta tertiary" href="#dashboard" data-cw-finish>Ir al Dashboard</a>
        </div>

        <p style="font-size:12px; color:var(--rp-muted); margin-top:14px;">
          Token guardado de forma segura. Puedes editarlo o reconectar desde
          <a href="#settings" data-cw-finish style="color:var(--rp-green-deep); text-decoration:underline;">Settings</a> en cualquier momento.
        </p>
      </div>

      <div id="cw-save-status" style="margin-top:24px;"></div>
    `
  }

  async function persistConnection () {
    const v = state.data.validated
    if (!v || !v.page) return
    const status = document.getElementById('cw-save-status')
    if (status) status.innerHTML = '<div style="font-size:12px; color:var(--rp-muted);">Guardando credenciales…</div>'

    try {
      // 1. Save creds via /api/credentials/meta (creates/updates meta_connections row)
      const saveRes = await fetch('/api/credentials/meta', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          access_token: state.data.token,
          page_id: v.page.id,
          instagram_id: (v.page.instagram && v.page.instagram.id) || ''
        })
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        throw new Error(err.error || 'No pude guardar las credenciales.')
      }

      // 2. Run the test endpoint to validate + persist page_access_token + flip status='active'
      await fetch('/api/credentials/meta/test', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          access_token: state.data.token,
          page_id: v.page.id,
          instagram_id: (v.page.instagram && v.page.instagram.id) || ''
        })
      })

      // 3. Mirror to localStorage so legacy /app + /dashboard quickpost flows keep working
      const meta = (() => { try { return JSON.parse(localStorage.getItem('meta_creds') || '{}') } catch (_) { return {} } })()
      Object.assign(meta, {
        access_token: state.data.token,
        page_id: v.page.id,
        ig_user_id: (v.page.instagram && v.page.instagram.id) || ''
      })
      localStorage.setItem('meta_creds', JSON.stringify(meta))
      localStorage.setItem('wa_access_token', state.data.token)

      if (status) status.innerHTML = '<div style="font-size:12px; color:var(--rp-green-deep);">✓ Credenciales guardadas en el servidor.</div>'
      window.rmToast?.('✅ Conectado a ' + v.page.name, 'success')

      // Mark all completed
      state.completed = state.completed.map(() => true)
      saveState()

      // Tell the rest of the app the connection is live (hides the banner)
      document.dispatchEvent(new CustomEvent('rm-meta-connected', { detail: { page: v.page } }))
    } catch (err) {
      if (status) status.innerHTML = `<div style="font-size:12px; color:var(--rp-red);">⚠ ${escapeHtml(err.message)}. Te lleva a Settings para terminar manualmente.</div>`
      window.rmToast?.('No pude guardar: ' + err.message, 'error')
    }
  }

  function wireStep6 (root) {
    persistConnection()
    $$('[data-cw-finish]', root).forEach(el => {
      el.addEventListener('click', () => {
        // Wipe wizard state so next visit starts fresh from #connect (in case they reconnect)
        // But keep credentials in place — they're stored on the server now.
        try { localStorage.removeItem(STORAGE_KEY) } catch (_) {}
      })
    })
  }

  // ── Master render ──────────────────────────────────────────

  function render () {
    const slot = document.querySelector('section[data-page="connect"]')
    if (!slot) return

    let stepHtml = ''
    if (state.step === 1) stepHtml = step1Html()
    else if (state.step === 2) stepHtml = step2Html()
    else if (state.step === 3) stepHtml = step3Html()
    else if (state.step === 4) stepHtml = step4Html()
    else if (state.step === 5) stepHtml = step5Html()
    else if (state.step === 6) stepHtml = step6Html()

    slot.innerHTML = `
      <div class="cw-shell">
        ${progressHtml()}
        <div class="cw-grid">
          <div class="cw-content">${stepHtml}</div>
          <aside class="cw-coach">${coachHtml()}</aside>
        </div>
      </div>
    `

    // Wire common interactions
    const root = slot
    $$('[data-copy]', root).forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy, btn))
    })
    $$('[data-confirm-step]', root).forEach(btn => {
      btn.addEventListener('click', () => advance())
    })
    $$('[data-go-step]', root).forEach(btn => {
      btn.addEventListener('click', () => gotoStep(+btn.dataset.goStep))
    })

    // Step-specific wiring
    if (state.step === 1) wireStep1(root)
    if (state.step === 5) wireStep5(root)
    if (state.step === 6) wireStep6(root)
  }

  // ── Mount + lifecycle ──────────────────────────────────────

  let mounted = false

  async function loadConfig () {
    try {
      const r = await fetch('/api/wizard/config')
      const j = await r.json()
      if (j) Object.assign(publicConfig, j)
    } catch (_) { /* keep defaults */ }
  }

  async function mount () {
    // If user already connected, redirect to settings
    if (await alreadyConnected()) {
      if (window.rmRouter) window.rmRouter.goTo('settings')
      else location.hash = '#settings'
      return
    }
    mounted = true
    await loadConfig()
    render()
  }

  async function alreadyConnected () {
    try {
      const r = await fetch('/api/credentials/meta', { headers: authHeaders() })
      if (!r.ok) return false
      const j = await r.json()
      return !!(j && j.connected && j.status === 'active')
    } catch (_) { return false }
  }

  // Public API for banner & dropdown
  window.rmConnectWizard = {
    reset: resetWizard,
    isComplete: () => state.completed.every(Boolean),
    state: () => ({ ...state })
  }

  document.addEventListener('rm-page-change', e => {
    document.body.classList.toggle('cw-active', e.detail.page === 'connect')
    if (e.detail.page === 'connect') mount()
  })
  document.addEventListener('DOMContentLoaded', () => {
    const cur = window.rmRouter?.currentPage() || ''
    document.body.classList.toggle('cw-active', cur === 'connect')
    if (cur === 'connect') mount()
  })
})()
