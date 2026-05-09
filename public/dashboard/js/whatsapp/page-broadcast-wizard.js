/* ─────────────────────────────────────────────────────────────
   WhatsApp Broadcast Wizard (Step 18)
   /dashboard#whatsapp/broadcasts/new

   4 steps with progress indicator:
     1. TEMPLATE   — grid of approved templates, one selectable
     2. AUDIENCE   — drop CSV (max 10MB / 50K rows), preview top 10,
                     E.164 validation
     3. VARIABLES  — map template variables to CSV columns + upload
                     media if template has IMAGE/VIDEO/DOC header
     4. SCHEDULE   — now / later, sending speed, opt-in attestation,
                     duplicate detection, summary card

   Submits to POST /api/whatsapp/broadcasts/create. The server
   parses + persists the CSV into whatsapp_broadcast_recipients and
   sets broadcast.status='scheduled' (or 'sending' if "now").
   Actual sending is done by the cron processor (Step 19).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_ID = 'wa-broadcast-new'
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')

  // ─── State ───────────────────────────────────────────────
  function defaultState () {
    return {
      step: 1,
      loading: false,
      submitting: false,
      // Step 1
      templates: [],
      templatesLoaded: false,
      template: null,
      // Step 2
      csv: null,                 // { headers, rows, filename, fullRows }
      csvError: null,
      // Step 3
      variableMapping: {},       // { '1': 'csv_column_name' }
      mediaUrl: null,
      mediaFilename: null,
      // Step 4
      name: '',
      schedule: 'now',
      scheduledAt: '',
      sendingSpeed: 5,
      optInAttested: false,
      duplicateWarning: null,
      qualityRating: 'GREEN',     // assumed; overridden if API gives it
      tierLimit: 1000             // 1000 / 24h default
    }
  }

  let state = defaultState()

  const E164_RE = /^\+?[1-9]\d{6,14}$/
  function normalizePhone (raw) {
    const digits = String(raw || '').replace(/[^\d+]/g, '')
    if (!digits) return null
    if (digits.startsWith('+')) return digits
    // Colombia default if 10 digits starting with 3
    if (digits.length === 10 && digits.startsWith('3')) return '+57' + digits
    if (digits.length === 12 && digits.startsWith('57')) return '+' + digits
    return '+' + digits
  }

  // ─── CSV parsing ─────────────────────────────────────────
  function parseCSV (text) {
    const rows = []
    let cur = []
    let val = ''
    let inQuote = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQuote) {
        if (ch === '"') {
          if (text[i+1] === '"') { val += '"'; i++ }
          else inQuote = false
        } else val += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { cur.push(val); val = '' }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { cur.push(val); rows.push(cur); cur = []; val = '' }
        else val += ch
      }
    }
    if (val !== '' || cur.length) { cur.push(val); rows.push(cur) }
    if (rows.length === 0) return { headers: [], rows: [] }
    const headers = rows[0].map(h => String(h || '').trim())
    const data = rows.slice(1).filter(r => r.length === headers.length || r.length === 1)
      .map(r => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = (r[i] || '').trim() })
        return obj
      })
    return { headers, rows: data }
  }

  // ─── Step renderers ──────────────────────────────────────
  function progressHtml () {
    const steps = [
      { n: 1, label: 'TEMPLATE' },
      { n: 2, label: 'AUDIENCIA' },
      { n: 3, label: 'VARIABLES' },
      { n: 4, label: 'PROGRAMACIÓN' }
    ]
    return `
      <div class="wa-bcw-progress">
        ${steps.map(s => `
          <div class="wa-bcw-progress-step ${state.step === s.n ? 'is-active' : state.step > s.n ? 'is-done' : ''}">
            <span class="wa-bcw-progress-num">${state.step > s.n ? '✓' : s.n}</span>
            <span class="wa-bcw-progress-label">${esc(s.label)}</span>
          </div>
        `).join('')}
      </div>
    `
  }

  function step1Html () {
    if (!state.templatesLoaded) return `<div class="rmc-skel"><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div><div class="rmc-skel-row"></div></div>`
    const approved = state.templates.filter(t => (t.status || '').toUpperCase() === 'APPROVED')
    if (approved.length === 0) {
      return `
        ${window.rmc?.emptyState ? window.rmc.emptyState({
          icon: '📋',
          eyebrow: 'NO HAY TEMPLATES APROBADAS',
          title: 'Crea y aprueba un template primero',
          body: 'WhatsApp solo permite enviar broadcasts con templates aprobadas por Meta. Toma ~3 min crear una y entre 30 min y 48h en aprobarse.',
          ctaLabel: '+ Nueva plantilla',
          ctaHref: '#whatsapp/templates/new'
        }) : ''}
      `
    }
    return `
      <h2 class="wa-bcw-title">Selecciona la plantilla</h2>
      <p class="wa-bcw-sub">Solo puedes usar templates aprobadas por Meta. Para usar una distinta, créala primero.</p>
      <div class="wa-bcw-tpl-grid">
        ${approved.map(t => `
          <button type="button" class="wa-bcw-tpl-card ${state.template?.id === t.id ? 'is-selected' : ''}" data-tpl-id="${esc(t.id)}">
            <div class="wa-bcw-tpl-card-h">
              <span class="wa-cat-badge wa-cat-${t.category === 'MARKETING' ? 'mkt' : t.category === 'AUTHENTICATION' ? 'auth' : 'util'}">${esc(t.category)}</span>
              <span class="wa-lang">${esc((t.language || '').toUpperCase())}</span>
            </div>
            <div class="wa-bcw-tpl-card-name">${esc(t.name)}</div>
            <div class="wa-bcw-tpl-card-body">${esc(extractBody(t).slice(0, 120))}${extractBody(t).length > 120 ? '…' : ''}</div>
            <div class="wa-bcw-tpl-card-vars">${countVars(t)} variable${countVars(t) === 1 ? '' : 's'}</div>
          </button>
        `).join('')}
      </div>
    `
  }

  function extractBody (t) {
    const cs = t.components || []
    const body = cs.find(c => c.type === 'BODY')
    return body?.text || ''
  }
  function countVars (t) {
    const body = extractBody(t)
    const set = new Set((body.match(/\{\{\d+\}\}/g) || []))
    return set.size
  }
  function templateVariables (t) {
    const body = extractBody(t)
    const vars = body.match(/\{\{(\d+)\}\}/g) || []
    return [...new Set(vars.map(m => m.slice(2,-2)))].sort((a,b) => Number(a) - Number(b))
  }

  function step2Html () {
    return `
      <h2 class="wa-bcw-title">Sube tu lista de contactos</h2>
      <p class="wa-bcw-sub">CSV con encabezado en la primera fila. Mínimo: una columna con teléfonos. Max 10MB / 50,000 filas.</p>

      ${!state.csv ? `
        <div class="wa-bcw-drop" id="wa-bcw-drop">
          <div class="wa-bcw-drop-icon">📥</div>
          <div class="wa-bcw-drop-title">Arrastra tu CSV aquí</div>
          <div class="wa-bcw-drop-sub">o haz click para seleccionar</div>
          <input type="file" id="wa-bcw-file" accept=".csv,text/csv" hidden>
          <button type="button" class="ae-btn-ghost" id="wa-bcw-pick">Seleccionar archivo</button>
        </div>
        <details class="ae-optional" style="margin-top:18px;">
          <summary>¿Cómo debe verse el CSV? <span style="margin-left:auto; color:var(--rm-muted); font-weight:500;">ejemplo</span></summary>
          <div class="ae-optional-body">
            <pre class="wa-bcw-example">phone,nombre,inmueble,fecha,hora
+573001234567,Carolina,Penthouse Calle 93,sábado 14,10:00am
+573009876543,Felipe,Castelo Medellín,domingo 15,3:00pm</pre>
            <p style="font-size:12.5px; color:var(--rm-ink-2); margin-top:10px;">Los teléfonos pueden venir con o sin <code>+57</code>; los normalizamos automáticamente. Filas inválidas se marcan en el preview pero no bloquean la subida.</p>
          </div>
        </details>
      ` : `
        <div class="wa-bcw-csv-summary">
          <div>
            <div class="wa-bcw-csv-filename">📄 ${esc(state.csv.filename)}</div>
            <div class="wa-bcw-csv-meta">${state.csv.rows.length.toLocaleString('es-CO')} filas · ${state.csv.headers.length} columnas · ${state.csv.validCount.toLocaleString('es-CO')} teléfonos válidos${state.csv.invalidCount ? ' · ' + state.csv.invalidCount + ' inválidos' : ''}</div>
          </div>
          <button type="button" class="ae-btn-ghost" id="wa-bcw-csv-clear">Cambiar archivo</button>
        </div>

        ${state.csv.invalidCount > 0 ? `
          <div class="ae-help warn" style="margin-top:14px; font-size:12.5px;">
            <strong>${state.csv.invalidCount} filas con teléfonos inválidos</strong> serán saltadas. Tip: usa formato E.164 (<code>+573001234567</code>).
          </div>
        ` : ''}

        <h3 class="wa-bcw-sub-h">Preview · primeras ${Math.min(10, state.csv.rows.length)} filas</h3>
        <div class="wa-bcw-csv-preview">
          <table>
            <thead><tr>${state.csv.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${state.csv.rows.slice(0, 10).map(r => `
                <tr>${state.csv.headers.map(h => `<td>${esc(r[h] || '')}</td>`).join('')}</tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `
  }

  function step3Html () {
    if (!state.template) return ''
    const vars = templateVariables(state.template)
    const headerComp = (state.template.components || []).find(c => c.type === 'HEADER')
    const headerNeedsMedia = headerComp && ['IMAGE','VIDEO','DOCUMENT'].includes(headerComp.format)
    const csvHeaders = state.csv?.headers || []

    return `
      <h2 class="wa-bcw-title">Mapea las variables</h2>
      <p class="wa-bcw-sub">Cada variable de la plantilla se llena con un valor de tu CSV. El preview muestra cómo verá el primer mensaje un destinatario.</p>

      ${vars.length === 0 ? `
        <div class="ae-help" style="font-size:13px;">
          ✓ Esta plantilla no tiene variables — saltamos al siguiente paso.
        </div>
      ` : `
        <div class="wa-bcw-vars-block">
          ${vars.map(v => `
            <div class="wa-bcw-var-map">
              <div class="wa-bcw-var-key">{{${esc(v)}}}</div>
              <select class="ae-input" data-var-map="${esc(v)}">
                <option value="">— elige columna —</option>
                ${csvHeaders.map(h => `<option value="${escAttr(h)}" ${state.variableMapping[v] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}
                <option value="__static__" ${state.variableMapping[v] === '__static__' ? 'selected' : ''}>Valor estático…</option>
              </select>
              ${state.variableMapping[v] === '__static__' ? `
                <input type="text" class="ae-input" data-var-static="${esc(v)}"
                       placeholder="ej: Equipo Rentmies"
                       value="${escAttr(state.variableStatics?.[v] || '')}" />
              ` : ''}
            </div>
          `).join('')}
        </div>

        ${state.csv && state.csv.rows.length ? `
          <h3 class="wa-bcw-sub-h">Preview del primer mensaje</h3>
          <div class="wa-bcw-msg-preview">${renderFirstPreview()}</div>
        ` : ''}
      `}

      ${headerNeedsMedia ? `
        <h3 class="wa-bcw-sub-h">Sube el ${headerComp.format.toLowerCase()} del header</h3>
        ${state.mediaUrl ? `
          <div class="wa-bcw-media-preview">
            ${headerComp.format === 'IMAGE' ? `<img src="${escAttr(state.mediaUrl)}" alt="">` : `<div class="wa-bcw-media-filename">📁 ${esc(state.mediaFilename || 'archivo')}</div>`}
            <button type="button" class="ae-btn-ghost" id="wa-bcw-media-clear">Cambiar</button>
          </div>
        ` : `
          <input type="file" id="wa-bcw-media-file" accept="${headerComp.format === 'IMAGE' ? 'image/*' : headerComp.format === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx'}" hidden>
          <button type="button" class="ae-btn-ghost" id="wa-bcw-media-pick">+ Subir ${headerComp.format.toLowerCase()}</button>
        `}
      ` : ''}
    `
  }

  function renderFirstPreview () {
    if (!state.csv || !state.csv.rows.length) return ''
    const row = state.csv.rows[0]
    const body = extractBody(state.template).replace(/\{\{(\d+)\}\}/g, (m, k) => {
      const col = state.variableMapping[k]
      if (col === '__static__') return esc(state.variableStatics?.[k] || '___')
      const v = col ? row[col] : null
      return v ? esc(v) : `<span class="wa-tpl-var-placeholder">${esc(m)}</span>`
    })
    return `
      <div class="wa-tpl-bubble" style="max-width:340px;">
        <div class="wa-tpl-bubble-body">${body.replace(/\n/g, '<br>')}</div>
        <div class="wa-tpl-bubble-time">${new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})} ✓✓</div>
      </div>
    `
  }

  function step4Html () {
    const validRecipients = state.csv?.validCount || 0
    const tierLimit = state.tierLimit
    const overTier = validRecipients > tierLimit
    const sendingMinutes = Math.ceil(validRecipients / Math.max(1, state.sendingSpeed * 60))
    const qualityIsBad = state.qualityRating === 'LOW'

    return `
      <h2 class="wa-bcw-title">Programa el envío</h2>
      <p class="wa-bcw-sub">Decide cuándo y a qué velocidad enviar.</p>

      <div class="ae-field">
        <label class="ae-field-label" for="wa-bcw-name">Nombre del broadcast</label>
        <input id="wa-bcw-name" class="ae-input" type="text" placeholder="Recordatorio visitas - Mayo"
               value="${escAttr(state.name)}" />
        <div class="ae-field-hint">Solo lo verás tú en la lista de broadcasts.</div>
      </div>

      <div class="wa-bcw-radio-block">
        <label class="wa-bcw-radio-tile ${state.schedule === 'now' ? 'is-active' : ''}">
          <input type="radio" name="wa-bcw-sched" value="now" ${state.schedule === 'now' ? 'checked' : ''}>
          <div>
            <div class="wa-bcw-radio-tile-title">Enviar ahora</div>
            <div class="wa-bcw-radio-tile-sub">El cron procesa la cola cada minuto. Tarda ${sendingMinutes} min en completar.</div>
          </div>
        </label>
        <label class="wa-bcw-radio-tile ${state.schedule === 'later' ? 'is-active' : ''}">
          <input type="radio" name="wa-bcw-sched" value="later" ${state.schedule === 'later' ? 'checked' : ''}>
          <div>
            <div class="wa-bcw-radio-tile-title">Programar fecha</div>
            <div class="wa-bcw-radio-tile-sub">Útil si quieres enviar en horario pico o desde otra zona horaria.</div>
            ${state.schedule === 'later' ? `
              <input type="datetime-local" id="wa-bcw-sched-at" class="ae-input"
                     style="margin-top:8px; max-width:240px;"
                     value="${escAttr(state.scheduledAt)}" min="${new Date().toISOString().slice(0, 16)}" />
            ` : ''}
          </div>
        </label>
      </div>

      <div class="ae-field">
        <label class="ae-field-label">Velocidad de envío</label>
        <div class="wa-bcw-speed">
          ${[1, 5, 10].map(s => `
            <label class="wa-bcw-radio ${state.sendingSpeed === s ? 'is-active' : ''}">
              <input type="radio" name="wa-bcw-speed" value="${s}" ${state.sendingSpeed === s ? 'checked' : ''}>
              <span>${s} msg/seg</span>
            </label>
          `).join('')}
        </div>
        <div class="ae-field-hint">Más lento = mejor quality rating, menos riesgo de bloqueo. WhatsApp recomienda no más de 10/seg.</div>
      </div>

      <!-- Capacity check -->
      <div class="wa-bcw-capacity ${overTier ? 'is-over' : ''}">
        <div class="wa-bcw-capacity-h">
          <span class="wa-bcw-capacity-icon">${overTier ? '⚠' : '✓'}</span>
          <strong>Vas a enviar ${validRecipients.toLocaleString('es-CO')} mensajes.</strong>
          <span style="margin-left:auto; font-family:var(--rm-mono); font-size:11px; color:var(--rm-muted);">Tier: ${tierLimit.toLocaleString('es-CO')} / 24h</span>
        </div>
        ${overTier ? `
          <div class="wa-bcw-capacity-msg">
            Tu límite es ${tierLimit.toLocaleString('es-CO')} / 24h. Vas ${(validRecipients - tierLimit).toLocaleString('es-CO')} mensajes encima del tier.
            Te sugiero programar para mañana o partir el broadcast.
          </div>
        ` : ''}
      </div>

      ${qualityIsBad ? `
        <div class="ae-help warn" style="margin-top:14px;">
          <strong>⚠ Tu quality rating es LOW.</strong> Meta puede bajar tu tier si envías ahora. Espera 24h o reduce a 1 msg/seg.
        </div>
      ` : ''}

      ${state.duplicateWarning ? `
        <div class="ae-help warn" style="margin-top:14px;">
          <strong>⚠ Posible duplicado:</strong> ${esc(state.duplicateWarning)}
        </div>
      ` : ''}

      <!-- Opt-in attestation -->
      <div class="wa-bcw-attest">
        <label class="wa-bcw-attest-label">
          <input type="checkbox" id="wa-bcw-attest" ${state.optInAttested ? 'checked' : ''}>
          <span>
            <strong>Confirmo que tengo opt-in explícito</strong> de cada destinatario en este CSV.
            Entiendo que enviar mensajes sin consentimiento puede resultar en bloqueo permanente de mi WABA por parte de Meta.
          </span>
        </label>
      </div>

      <!-- Summary -->
      <div class="wa-bcw-summary">
        <div class="wa-bcw-summary-row"><strong>Plantilla</strong><span>${esc(state.template?.name)}</span></div>
        <div class="wa-bcw-summary-row"><strong>Categoría</strong><span>${esc(state.template?.category)}</span></div>
        <div class="wa-bcw-summary-row"><strong>Destinatarios</strong><span>${validRecipients.toLocaleString('es-CO')}</span></div>
        <div class="wa-bcw-summary-row"><strong>Cuándo</strong><span>${state.schedule === 'now' ? 'Inmediato' : esc(state.scheduledAt || 'sin fecha')}</span></div>
        <div class="wa-bcw-summary-row"><strong>Velocidad</strong><span>${state.sendingSpeed} msg/seg</span></div>
        <div class="wa-bcw-summary-row"><strong>Tiempo estimado</strong><span>~${sendingMinutes} min</span></div>
      </div>
    `
  }

  // ─── Page wrapper ────────────────────────────────────────
  function html () {
    const stepHtml = state.step === 1 ? step1Html()
                   : state.step === 2 ? step2Html()
                   : state.step === 3 ? step3Html()
                   : step4Html()

    const canContinue = canAdvance()
    const isLast = state.step === 4

    return `
      <section class="rp-page rp-rise">
        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px;">
          <div>
            <span class="rp-eyebrow">WHATSAPP · NUEVO BROADCAST</span>
            <h1 class="rp-display">Crear <em>broadcast</em></h1>
          </div>
          <a href="#whatsapp/broadcasts" class="ae-btn-ghost">← Volver a broadcasts</a>
        </div>

        ${progressHtml()}

        <div class="wa-bcw-step-body">
          ${stepHtml}
        </div>

        <div class="wa-bcw-actions">
          ${state.step > 1 ? `<button type="button" class="ae-btn-ghost" id="wa-bcw-back">← Atrás</button>` : '<div></div>'}
          ${isLast
            ? `<button type="button" class="ae-btn-primary" id="wa-bcw-submit" ${canContinue && !state.submitting ? '' : 'disabled'}>
                 ${state.submitting ? 'Creando…' : (state.schedule === 'now' ? 'Crear y enviar ahora' : 'Crear y programar')}
               </button>`
            : `<button type="button" class="ae-btn-primary" id="wa-bcw-next" ${canContinue ? '' : 'disabled'}>Continuar →</button>`}
        </div>
      </section>
    `
  }

  function canAdvance () {
    if (state.step === 1) return !!state.template
    if (state.step === 2) return state.csv && state.csv.validCount > 0
    if (state.step === 3) {
      const vars = state.template ? templateVariables(state.template) : []
      const headerComp = (state.template?.components || []).find(c => c.type === 'HEADER')
      const headerNeedsMedia = headerComp && ['IMAGE','VIDEO','DOCUMENT'].includes(headerComp.format)
      if (headerNeedsMedia && !state.mediaUrl) return false
      // All variables must be mapped
      for (const v of vars) {
        const m = state.variableMapping[v]
        if (!m) return false
        if (m === '__static__' && !(state.variableStatics?.[v] || '').trim()) return false
      }
      return true
    }
    if (state.step === 4) {
      if (!state.name.trim()) return false
      if (!state.optInAttested) return false
      if (state.schedule === 'later' && !state.scheduledAt) return false
      return true
    }
    return false
  }

  // ─── Wiring ──────────────────────────────────────────────
  function wire () {
    document.getElementById('wa-bcw-next')?.addEventListener('click', () => {
      if (!canAdvance()) return
      state.step++
      render()
    })
    document.getElementById('wa-bcw-back')?.addEventListener('click', () => {
      state.step = Math.max(1, state.step - 1)
      render()
    })
    document.getElementById('wa-bcw-submit')?.addEventListener('click', submit)

    // Step 1
    document.querySelectorAll('[data-tpl-id]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.tplId
        state.template = state.templates.find(t => t.id === id) || null
        state.variableMapping = {}
        state.variableStatics = {}
        render()
      })
    })

    // Step 2 — CSV
    document.getElementById('wa-bcw-pick')?.addEventListener('click', () => document.getElementById('wa-bcw-file')?.click())
    const drop = document.getElementById('wa-bcw-drop')
    if (drop) {
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-dragging') })
      drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'))
      drop.addEventListener('drop', e => {
        e.preventDefault()
        drop.classList.remove('is-dragging')
        const file = e.dataTransfer.files?.[0]
        if (file) handleCsvFile(file)
      })
    }
    document.getElementById('wa-bcw-file')?.addEventListener('change', e => {
      const file = e.target.files?.[0]
      if (file) handleCsvFile(file)
    })
    document.getElementById('wa-bcw-csv-clear')?.addEventListener('click', () => {
      state.csv = null
      render()
    })

    // Step 3 — variable mapping
    document.querySelectorAll('[data-var-map]').forEach(sel => {
      sel.addEventListener('change', e => {
        const v = sel.dataset.varMap
        state.variableMapping[v] = e.target.value
        render()   // re-render to show static input if needed
      })
    })
    document.querySelectorAll('[data-var-static]').forEach(inp => {
      inp.addEventListener('input', e => {
        const v = inp.dataset.varStatic
        state.variableStatics = state.variableStatics || {}
        state.variableStatics[v] = e.target.value
        // Don't full re-render — just refresh preview
        const slot = document.querySelector('.wa-bcw-msg-preview')
        if (slot) slot.innerHTML = renderFirstPreview()
        const next = document.getElementById('wa-bcw-next')
        if (next) next.disabled = !canAdvance()
      })
    })
    document.getElementById('wa-bcw-media-pick')?.addEventListener('click', () => document.getElementById('wa-bcw-media-file')?.click())
    document.getElementById('wa-bcw-media-file')?.addEventListener('change', e => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        state.mediaUrl = ev.target.result
        state.mediaFilename = file.name
        render()
      }
      reader.readAsDataURL(file)
    })
    document.getElementById('wa-bcw-media-clear')?.addEventListener('click', () => {
      state.mediaUrl = null
      state.mediaFilename = null
      render()
    })

    // Step 4
    document.getElementById('wa-bcw-name')?.addEventListener('input', e => {
      state.name = e.target.value
      const submit = document.getElementById('wa-bcw-submit')
      if (submit) submit.disabled = !canAdvance() || state.submitting
    })
    document.querySelectorAll('input[name="wa-bcw-sched"]').forEach(r => {
      r.addEventListener('change', e => { state.schedule = e.target.value; render() })
    })
    document.getElementById('wa-bcw-sched-at')?.addEventListener('input', e => {
      state.scheduledAt = e.target.value
      const submit = document.getElementById('wa-bcw-submit')
      if (submit) submit.disabled = !canAdvance() || state.submitting
    })
    document.querySelectorAll('input[name="wa-bcw-speed"]').forEach(r => {
      r.addEventListener('change', e => { state.sendingSpeed = parseInt(e.target.value, 10); render() })
    })
    document.getElementById('wa-bcw-attest')?.addEventListener('change', e => {
      state.optInAttested = e.target.checked
      const submit = document.getElementById('wa-bcw-submit')
      if (submit) submit.disabled = !canAdvance() || state.submitting
    })
  }

  function handleCsvFile (file) {
    if (file.size > 10 * 1024 * 1024) {
      window.rmToast?.('Archivo demasiado grande (max 10MB)', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(String(ev.target.result || ''))
      if (parsed.rows.length > 50_000) {
        window.rmToast?.(`CSV tiene ${parsed.rows.length} filas; máximo 50,000`, 'error')
        return
      }
      // Detect phone column heuristically
      const phoneCol = parsed.headers.find(h => /tel|phone|whats|num/i.test(h)) || parsed.headers[0]
      // Validate phones
      let validCount = 0, invalidCount = 0
      const fullRows = parsed.rows.map(r => {
        const norm = normalizePhone(r[phoneCol])
        const valid = !!norm && E164_RE.test(norm)
        if (valid) validCount++
        else invalidCount++
        return { ...r, _phone_e164: norm, _valid: valid }
      })
      state.csv = {
        filename: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        fullRows,
        phoneCol,
        validCount,
        invalidCount
      }
      render()
    }
    reader.readAsText(file, 'utf-8')
  }

  // ─── Network ────────────────────────────────────────────
  async function loadTemplates () {
    state.templatesLoaded = false
    render()
    try {
      const r = await window.rmApi.get('/api/whatsapp/templates/list?source=db')
      state.templates = r.templates || []
    } catch (err) {
      window.rmToast?.(`Error cargando templates: ${err.message}`, 'error')
    } finally {
      state.templatesLoaded = true
      render()
    }
  }

  async function submit () {
    if (!canAdvance() || state.submitting) return
    state.submitting = true
    render()

    // Build the payload
    const recipients = state.csv.fullRows
      .filter(r => r._valid)
      .map(r => {
        const variables = {}
        const vars = templateVariables(state.template)
        for (const v of vars) {
          const map = state.variableMapping[v]
          if (map === '__static__') variables[v] = state.variableStatics?.[v] || ''
          else if (map) variables[v] = r[map] || ''
        }
        return { phone_e164: r._phone_e164, variables }
      })

    const payload = {
      name: state.name,
      template_id: state.template.id,
      template_name: state.template.name,
      template_language: state.template.language,
      schedule: state.schedule,
      scheduled_at: state.schedule === 'later' ? new Date(state.scheduledAt).toISOString() : null,
      sending_speed: state.sendingSpeed,
      opt_in_attested: state.optInAttested,
      media_url: state.mediaUrl,
      source_csv_filename: state.csv.filename,
      recipients
    }

    try {
      const r = await window.rmApi.post('/api/whatsapp/broadcasts/create', payload)
      window.rmToast?.(`✓ Broadcast "${state.name}" creado · ${r.queued} mensajes en cola`, 'success')
      // Bounce to broadcasts list
      setTimeout(() => window.rmRouter?.goTo('wa-broadcasts'), 600)
    } catch (err) {
      window.rmToast?.(`✗ ${err.message}`, 'error')
      state.submitting = false
      render()
    }
  }

  // ─── Render entry ───────────────────────────────────────
  function render () {
    const slot = document.querySelector(`section[data-page="${PAGE_ID}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  function injectStylesOnce () {
    if (document.getElementById('wa-bcw-styles')) return
    const css = `
      .wa-bcw-progress { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 28px; counter-reset: bcw-step; }
      .wa-bcw-progress-step { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; opacity: 0.55; transition: opacity .18s, border-color .18s; }
      .wa-bcw-progress-step.is-active { opacity: 1; border-color: var(--rp-teal, #40d99d); box-shadow: 0 1px 4px rgba(64,217,157,.15); }
      .wa-bcw-progress-step.is-done { opacity: 1; }
      .wa-bcw-progress-step.is-done .wa-bcw-progress-num { background: var(--rp-teal, #40d99d); color: var(--rm-green-deep, #004d35); border-color: var(--rp-teal, #40d99d); }
      .wa-bcw-progress-num { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--rm-border, #e8e3dc); display: flex; align-items: center; justify-content: center; font-family: var(--rm-mono); font-size: 12px; font-weight: 700; color: var(--rm-ink-2, #3a3f3b); }
      .wa-bcw-progress-step.is-active .wa-bcw-progress-num { border-color: var(--rp-teal, #40d99d); color: var(--rp-teal-deep, #004d35); }
      .wa-bcw-progress-label { font-family: var(--rm-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; }

      .wa-bcw-step-body { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; padding: 24px 28px; min-height: 320px; margin-bottom: 18px; }
      .wa-bcw-title { font-family: var(--rp-font); font-weight: 800; font-size: 24px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 6px; color: var(--rp-ink, #1c1b1b); }
      .wa-bcw-sub { font-size: 13.5px; color: var(--rm-ink-2, #3a3f3b); line-height: 1.55; margin: 0 0 22px; max-width: 600px; }
      .wa-bcw-sub-h { font-family: var(--rm-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); text-transform: uppercase; margin: 22px 0 10px; }

      /* Step 1 */
      .wa-bcw-tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
      .wa-bcw-tpl-card { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; padding: 14px 16px; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s, box-shadow .15s; }
      .wa-bcw-tpl-card:hover { transform: translateY(-2px); border-color: var(--rp-teal, #40d99d); }
      .wa-bcw-tpl-card.is-selected { border-color: var(--rp-teal, #40d99d); box-shadow: 0 0 0 3px rgba(64,217,157,.18); }
      .wa-bcw-tpl-card-h { display: flex; gap: 8px; margin-bottom: 8px; }
      .wa-bcw-tpl-card-name { font-family: var(--rm-mono); font-size: 12px; font-weight: 700; color: var(--rm-ink, #0f1410); margin-bottom: 6px; }
      .wa-bcw-tpl-card-body { font-size: 12px; color: var(--rm-ink-2, #3a3f3b); line-height: 1.5; margin-bottom: 8px; }
      .wa-bcw-tpl-card-vars { font-family: var(--rm-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; color: var(--rm-muted, #7a7e79); text-transform: uppercase; }

      /* Step 2 — drop zone */
      .wa-bcw-drop { border: 2px dashed var(--rm-border, #e8e3dc); border-radius: 8px; padding: 48px 24px; text-align: center; transition: background .15s, border-color .15s; }
      .wa-bcw-drop.is-dragging { background: rgba(64,217,157,0.08); border-color: var(--rp-teal, #40d99d); }
      .wa-bcw-drop-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.85; }
      .wa-bcw-drop-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
      .wa-bcw-drop-sub { font-size: 12.5px; color: var(--rm-muted, #7a7e79); margin-bottom: 16px; }
      .wa-bcw-example { background: #0c0d0c; color: #d6e2dc; padding: 14px; border-radius: 6px; font-family: var(--rm-mono); font-size: 11.5px; line-height: 1.6; overflow-x: auto; }

      .wa-bcw-csv-summary { display: flex; gap: 18px; align-items: center; padding: 14px 16px; background: rgba(64,217,157,0.06); border: 1px solid rgba(64,217,157,0.25); border-radius: 6px; }
      .wa-bcw-csv-filename { font-size: 13.5px; font-weight: 600; }
      .wa-bcw-csv-meta { font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); margin-top: 2px; }

      .wa-bcw-csv-preview { overflow-x: auto; background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; }
      .wa-bcw-csv-preview table { width: 100%; border-collapse: collapse; font-family: var(--rm-mono); font-size: 11.5px; }
      .wa-bcw-csv-preview thead th { padding: 8px 12px; background: var(--rp-surface-raised, #f6f3ee); font-weight: 700; text-align: left; border-bottom: 1px solid var(--rm-border, #e8e3dc); white-space: nowrap; }
      .wa-bcw-csv-preview tbody td { padding: 8px 12px; border-bottom: 1px solid var(--rm-border, #e8e3dc); white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

      /* Step 3 */
      .wa-bcw-vars-block { display: flex; flex-direction: column; gap: 12px; margin-bottom: 22px; }
      .wa-bcw-var-map { display: grid; grid-template-columns: 80px 1fr; gap: 10px; align-items: center; }
      .wa-bcw-var-key { font-family: var(--rm-mono); font-weight: 700; color: var(--rp-teal-deep, var(--rm-green-deep, #004d35)); padding: 8px 10px; background: rgba(64,217,157,0.08); border-radius: 4px; text-align: center; }
      .wa-bcw-var-map[data-has-static] { grid-template-columns: 80px 1fr 1fr; }
      .wa-bcw-msg-preview { display: flex; justify-content: center; padding: 18px; background: #ECE5DD; border-radius: 8px; }
      .wa-bcw-media-preview { display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; }
      .wa-bcw-media-preview img { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; }
      .wa-bcw-media-filename { font-size: 13px; font-family: var(--rm-mono); }

      /* Step 4 */
      .wa-bcw-radio-block { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 14px 0 18px; }
      .wa-bcw-radio-tile { display: flex; gap: 12px; padding: 14px 16px; background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; cursor: pointer; transition: border-color .15s; }
      .wa-bcw-radio-tile.is-active { border-color: var(--rp-teal, #40d99d); box-shadow: 0 0 0 2px rgba(64,217,157,.15); }
      .wa-bcw-radio-tile-title { font-size: 13.5px; font-weight: 600; margin-bottom: 4px; }
      .wa-bcw-radio-tile-sub { font-size: 12px; color: var(--rm-muted, #7a7e79); line-height: 1.45; }

      .wa-bcw-speed { display: flex; gap: 8px; margin-top: 6px; }
      .wa-bcw-radio { display: inline-flex; align-items: center; padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; color: var(--rm-muted, #7a7e79); border: 1px solid var(--rm-border, #e8e3dc); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
      .wa-bcw-radio.is-active { background: var(--rm-ink, #0f1410); color: #fff; border-color: var(--rm-ink, #0f1410); }
      .wa-bcw-radio input { display: none; }

      .wa-bcw-capacity { padding: 14px 16px; background: rgba(64,217,157,0.06); border: 1px solid rgba(64,217,157,0.25); border-radius: 6px; margin-top: 14px; }
      .wa-bcw-capacity.is-over { background: #fffaeb; border-color: #fcd34d; }
      .wa-bcw-capacity-h { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
      .wa-bcw-capacity-msg { margin-top: 6px; font-size: 12.5px; color: #92400e; }

      .wa-bcw-attest { padding: 14px 16px; margin-top: 18px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; }
      .wa-bcw-attest-label { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; cursor: pointer; }
      .wa-bcw-attest-label input { margin-top: 3px; }

      .wa-bcw-summary { background: var(--rm-ink, #0f1410); color: #d6e2dc; border-radius: 6px; padding: 16px 18px; margin-top: 22px; font-family: var(--rm-mono); font-size: 12px; }
      .wa-bcw-summary-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
      .wa-bcw-summary-row:last-child { border-bottom: none; }
      .wa-bcw-summary-row strong { color: rgba(255,255,255,.6); font-weight: 600; }
      .wa-bcw-summary-row span { color: #fff; }

      .wa-bcw-actions { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-top: 20px; }
    `
    const s = document.createElement('style')
    s.id = 'wa-bcw-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  async function mount () {
    state = defaultState()

    // Pre-fill from query string if `?template=<id>`
    const hash = location.hash || ''
    const qi = hash.indexOf('?')
    if (qi !== -1) {
      const params = new URLSearchParams(hash.slice(qi + 1))
      const tplId = params.get('template')
      if (tplId) state._presetTemplateId = tplId
    }

    render()
    await loadTemplates()
    if (state._presetTemplateId) {
      const t = state.templates.find(x => x.id === state._presetTemplateId)
      if (t && (t.status || '').toUpperCase() === 'APPROVED') {
        state.template = t
      }
    }
    render()
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === PAGE_ID) mount() })
  document.addEventListener('DOMContentLoaded', () => {
    if (window.rmRouter?.currentPage() === PAGE_ID) mount()
  })
})()
