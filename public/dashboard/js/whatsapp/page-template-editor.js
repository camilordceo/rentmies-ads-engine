/* ─────────────────────────────────────────────────────────────
   WhatsApp Template Editor (Steps 14-16)
   /dashboard#whatsapp/templates/new   — create
   /dashboard#whatsapp/templates/edit  — edit (id in sessionStorage)

   Two-column layout: collapsible form on the left, live phone
   preview on the right. Variables {{n}} render with their example
   values in the preview. Validation runs on every input via
   window.rmTplValidation. Submit flow includes a confirm modal
   summarizing the template before posting to /api/whatsapp/templates/submit.

   The form re-renders only the affected sections (header/buttons/
   preview) on input — body textarea keeps its focus + cursor.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_IDS = ['wa-template-new', 'wa-template-edit']
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')

  // ─── Default state ───────────────────────────────────────
  function defaultTemplate () {
    return {
      name: '',
      category: 'UTILITY',
      language: 'es_CO',
      header: { type: 'NONE' },
      body: '',
      footer: '',
      buttons: [],
      examples: {}
    }
  }

  let state = {
    pageId: null,
    loading: false,
    editingId: null,
    template: defaultTemplate(),
    validation: { ok: true, errors: [], warnings: [] },
    submitting: false,
    saving: false
  }

  // ─── Phone preview ───────────────────────────────────────
  function substituteVariables (text, examples) {
    if (!text) return ''
    return text.replace(/\{\{(\d+)\}\}/g, (m, k) => {
      const v = examples && examples[k]
      return v ? esc(v) : `<span class="wa-tpl-var-placeholder">${esc(m)}</span>`
    })
  }

  function previewHtml () {
    const t = state.template
    const headerHtml = (() => {
      if (!t.header || t.header.type === 'NONE') return ''
      if (t.header.type === 'TEXT') return `<div class="wa-tpl-bubble-header">${substituteVariables(t.header.text || '', t.header.examples || {})}</div>`
      if (t.header.type === 'IMAGE') return `<div class="wa-tpl-bubble-media wa-tpl-bubble-image" style="${t.header.media_url ? `background-image:url('${escAttr(t.header.media_url)}');` : ''}">${!t.header.media_url ? '<span>📷 Imagen</span>' : ''}</div>`
      if (t.header.type === 'VIDEO') return `<div class="wa-tpl-bubble-media wa-tpl-bubble-video"><span>▶ Video</span></div>`
      if (t.header.type === 'DOCUMENT') return `<div class="wa-tpl-bubble-doc"><span class="wa-tpl-bubble-doc-icon">📄</span><div><div style="font-weight:600;">documento.pdf</div><div style="font-size:11px; opacity:.7;">PDF · 240 KB</div></div></div>`
      return ''
    })()

    const bodyHtml = t.body
      ? `<div class="wa-tpl-bubble-body">${substituteVariables(t.body, t.examples).replace(/\n/g, '<br>')}</div>`
      : `<div class="wa-tpl-bubble-body wa-tpl-bubble-empty">El cuerpo del mensaje irá aquí…</div>`

    const footerHtml = t.footer ? `<div class="wa-tpl-bubble-footer">${esc(t.footer)}</div>` : ''

    const ts = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const timeRow = `<div class="wa-tpl-bubble-time">${esc(ts)} ✓✓</div>`

    const qrButtons = (t.buttons || []).filter(b => b.type === 'QUICK_REPLY')
    const ctaButtons = (t.buttons || []).filter(b => b.type !== 'QUICK_REPLY')

    const qrRow = qrButtons.length ? `
      <div class="wa-tpl-bubble-qr-row">
        ${qrButtons.map(b => `<div class="wa-tpl-bubble-qr">${esc(b.text || 'Quick Reply')}</div>`).join('')}
      </div>
    ` : ''

    const ctaRow = ctaButtons.length ? `
      <div class="wa-tpl-bubble-cta-stack">
        ${ctaButtons.map(b => {
          const icon = b.type === 'URL' ? '🔗' : b.type === 'PHONE_NUMBER' ? '📞' : '⎘'
          return `<div class="wa-tpl-bubble-cta">${esc(icon)} ${esc(b.text || 'Botón')}</div>`
        }).join('')}
      </div>
    ` : ''

    return `
      <div class="wa-tpl-phone">
        <div class="wa-tpl-phone-frame">
          <div class="wa-tpl-phone-bar">
            <div class="wa-tpl-phone-avatar">RM</div>
            <div>
              <div class="wa-tpl-phone-name">Rentmies</div>
              <div class="wa-tpl-phone-sub">en línea</div>
            </div>
          </div>
          <div class="wa-tpl-phone-screen">
            <div class="wa-tpl-bubble">
              ${headerHtml}
              ${bodyHtml}
              ${footerHtml}
              ${timeRow}
            </div>
            ${qrRow}
            ${ctaRow}
          </div>
        </div>
      </div>
    `
  }

  // ─── Form sections ───────────────────────────────────────
  function identitySection () {
    const nameOk = state.template.name === '' || (window.rmTplValidation?.validateName(state.template.name).ok ?? true)
    return `
      <details class="wa-tpl-section" open>
        <summary><span class="wa-tpl-step-num">01</span><span class="wa-tpl-step-label">Identidad</span></summary>
        <div class="wa-tpl-section-body">
          <div class="ae-field">
            <label class="ae-field-label" for="wa-tpl-name">Nombre interno</label>
            <input id="wa-tpl-name" class="ae-input ${!nameOk ? 'is-invalid' : ''}" type="text"
                   placeholder="recordatorio_pago_arriendo" value="${escAttr(state.template.name)}"
                   spellcheck="false" autocomplete="off" />
            <div class="ae-field-hint">snake_case · 3-512 chars · solo lowercase, números y _</div>
          </div>
          <div class="ae-grid-2">
            <div class="ae-field">
              <label class="ae-field-label" for="wa-tpl-category">Categoría</label>
              <select id="wa-tpl-category" class="ae-input">
                <option value="UTILITY"        ${state.template.category === 'UTILITY'        ? 'selected' : ''}>Utility · transaccional</option>
                <option value="MARKETING"      ${state.template.category === 'MARKETING'      ? 'selected' : ''}>Marketing · promocional</option>
                <option value="AUTHENTICATION" ${state.template.category === 'AUTHENTICATION' ? 'selected' : ''}>Authentication · OTP</option>
              </select>
              <div class="ae-field-hint">Utility se aprueba más rápido. Marketing requiere opt-in claro.</div>
            </div>
            <div class="ae-field">
              <label class="ae-field-label" for="wa-tpl-language">Idioma</label>
              <select id="wa-tpl-language" class="ae-input">
                <option value="es_CO" ${state.template.language === 'es_CO' ? 'selected' : ''}>Español (Colombia)</option>
                <option value="es_MX" ${state.template.language === 'es_MX' ? 'selected' : ''}>Español (México)</option>
                <option value="es_ES" ${state.template.language === 'es_ES' ? 'selected' : ''}>Español (España)</option>
                <option value="en_US" ${state.template.language === 'en_US' ? 'selected' : ''}>English (US)</option>
                <option value="pt_BR" ${state.template.language === 'pt_BR' ? 'selected' : ''}>Português (Brasil)</option>
              </select>
            </div>
          </div>
        </div>
      </details>
    `
  }

  function headerSection () {
    const h = state.template.header || { type: 'NONE' }
    const showText  = h.type === 'TEXT'
    const showMedia = ['IMAGE','VIDEO','DOCUMENT'].includes(h.type)
    return `
      <details class="wa-tpl-section" open>
        <summary><span class="wa-tpl-step-num">02</span><span class="wa-tpl-step-label">Header <span class="wa-tpl-opt">opcional</span></span></summary>
        <div class="wa-tpl-section-body" id="wa-tpl-header-body">
          <div class="wa-tpl-radio-row">
            ${['NONE','TEXT','IMAGE','VIDEO','DOCUMENT'].map(typ => `
              <label class="wa-tpl-radio ${h.type === typ ? 'is-active' : ''}">
                <input type="radio" name="wa-tpl-header-type" value="${typ}" ${h.type === typ ? 'checked' : ''}>
                <span>${typ === 'NONE' ? 'Sin header' : typ}</span>
              </label>
            `).join('')}
          </div>

          ${showText ? `
            <div class="ae-field" style="margin-top:12px;">
              <label class="ae-field-label" for="wa-tpl-header-text">Texto del header (max 60 chars)</label>
              <input id="wa-tpl-header-text" class="ae-input" type="text"
                     placeholder="Visita confirmada · {{1}}"
                     value="${escAttr(h.text || '')}" maxlength="60" />
              <div class="ae-field-hint">Solo se permite UNA variable en el header.</div>
            </div>
          ` : ''}

          ${showMedia ? `
            <div class="ae-field" style="margin-top:12px;">
              <label class="ae-field-label">Subir ${h.type.toLowerCase()}</label>
              <div class="wa-tpl-upload">
                ${h.media_url ? `
                  <div class="wa-tpl-upload-preview">
                    ${h.type === 'IMAGE' ? `<img src="${escAttr(h.media_url)}" alt="">` : `<div class="wa-tpl-upload-filename">${esc(h.media_url.split('/').pop())}</div>`}
                    <button type="button" class="ae-btn-ghost" id="wa-tpl-header-clear-media">Cambiar</button>
                  </div>
                ` : `
                  <input type="file" id="wa-tpl-header-file" accept="${h.type === 'IMAGE' ? 'image/*' : h.type === 'VIDEO' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx'}" hidden>
                  <button type="button" class="ae-btn-ghost" id="wa-tpl-header-pick">+ Subir archivo</button>
                  <span style="font-size:11px; color:var(--rm-muted); margin-left:8px;">Max ${h.type === 'IMAGE' ? '5MB' : h.type === 'VIDEO' ? '16MB' : '100MB'}</span>
                `}
              </div>
            </div>
          ` : ''}
        </div>
      </details>
    `
  }

  function bodySection () {
    const t = state.template
    const vars = window.rmTplValidation?.extractVariables(t.body) || []
    const uniqueVars = [...new Set(vars)]
    return `
      <details class="wa-tpl-section" open>
        <summary><span class="wa-tpl-step-num">03</span><span class="wa-tpl-step-label">Body <span class="wa-tpl-req">requerido</span></span></summary>
        <div class="wa-tpl-section-body">
          <div class="ae-field">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
              <label class="ae-field-label" for="wa-tpl-body" style="margin:0;">Cuerpo del mensaje</label>
              <div class="wa-tpl-body-tools">
                <button type="button" class="wa-tpl-toolbtn" data-act="insert-var">Insertar {{${uniqueVars.length + 1}}}</button>
                <span class="wa-tpl-counter ${t.body.length > 1024 ? 'is-over' : ''}">${t.body.length} / 1024</span>
              </div>
            </div>
            <textarea id="wa-tpl-body" class="ae-input wa-tpl-textarea" rows="6"
                      placeholder="Hola {{1}}, confirmamos tu visita al inmueble {{2}} el {{3}} a las {{4}}.">${esc(t.body)}</textarea>
            <div class="ae-field-hint">Las variables deben ser secuenciales {{1}}, {{2}}, {{3}}…  ·  ni inicio ni fin pueden ser variable  ·  no pueden estar pegadas</div>
          </div>

          ${uniqueVars.length ? `
            <div class="wa-tpl-vars-block">
              <div class="wa-tpl-vars-title">Valores de ejemplo <span style="color:var(--rm-muted); font-weight:400;">(Meta los exige)</span></div>
              ${uniqueVars.map(v => `
                <div class="wa-tpl-var-row">
                  <span class="wa-tpl-var-key">{{${esc(v)}}}</span>
                  <input class="ae-input wa-tpl-var-input" type="text"
                         data-var-key="${esc(v)}"
                         placeholder="ej: Carolina"
                         value="${escAttr(t.examples?.[v] || '')}" />
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </details>
    `
  }

  function footerSection () {
    const t = state.template
    return `
      <details class="wa-tpl-section">
        <summary><span class="wa-tpl-step-num">04</span><span class="wa-tpl-step-label">Footer <span class="wa-tpl-opt">opcional</span></span></summary>
        <div class="wa-tpl-section-body">
          <div class="ae-field">
            <label class="ae-field-label" for="wa-tpl-footer">Texto del footer (max 60 chars, sin variables)</label>
            <input id="wa-tpl-footer" class="ae-input" type="text"
                   placeholder="Equipo Rentmies"
                   value="${escAttr(t.footer || '')}" maxlength="60" />
            <div class="ae-field-hint">Aparece pequeño debajo del mensaje. Útil para "DAR DE BAJA" o branding.</div>
          </div>
        </div>
      </details>
    `
  }

  function buttonsSection () {
    const buttons = state.template.buttons || []
    return `
      <details class="wa-tpl-section">
        <summary><span class="wa-tpl-step-num">05</span><span class="wa-tpl-step-label">Buttons <span class="wa-tpl-opt">opcional · max 10</span></span></summary>
        <div class="wa-tpl-section-body" id="wa-tpl-buttons-body">
          ${buttons.length === 0 ? `
            <div class="wa-tpl-empty-mini">No hay botones todavía.</div>
          ` : ''}
          <div class="wa-tpl-buttons-list">
            ${buttons.map((b, i) => buttonRowHtml(b, i)).join('')}
          </div>
          <div class="wa-tpl-add-buttons">
            <button type="button" class="ae-btn-ghost" data-add-btn="QUICK_REPLY"  ${buttons.filter(b => b.type === 'QUICK_REPLY').length >= 3 ? 'disabled' : ''}>+ Quick Reply</button>
            <button type="button" class="ae-btn-ghost" data-add-btn="URL"          ${buttons.filter(b => b.type === 'URL').length >= 2 ? 'disabled' : ''}>+ URL</button>
            <button type="button" class="ae-btn-ghost" data-add-btn="PHONE_NUMBER" ${buttons.filter(b => b.type === 'PHONE_NUMBER').length >= 1 ? 'disabled' : ''}>+ Llamar</button>
            <button type="button" class="ae-btn-ghost" data-add-btn="COPY_CODE">+ Copiar código</button>
          </div>
        </div>
      </details>
    `
  }

  function buttonRowHtml (b, i) {
    const typeLabel = b.type === 'QUICK_REPLY' ? 'Quick Reply' : b.type === 'URL' ? 'URL' : b.type === 'PHONE_NUMBER' ? 'Llamar' : 'Copiar código'
    return `
      <div class="wa-tpl-button-row" data-btn-i="${i}">
        <div class="wa-tpl-button-row-h">
          <span class="wa-tpl-button-type">${esc(typeLabel)}</span>
          <button type="button" class="wa-tpl-button-remove" data-btn-remove="${i}" title="Eliminar">×</button>
        </div>
        <div class="ae-grid-2">
          <div class="ae-field">
            <label class="ae-field-label">Texto (max 25)</label>
            <input class="ae-input" type="text" maxlength="25"
                   data-btn-field="text" data-btn-i="${i}"
                   placeholder="Confirmar visita"
                   value="${escAttr(b.text || '')}" />
          </div>
          ${b.type === 'URL' ? `
            <div class="ae-field">
              <label class="ae-field-label">URL</label>
              <input class="ae-input" type="url"
                     data-btn-field="url" data-btn-i="${i}"
                     placeholder="https://rentmies.com/..."
                     value="${escAttr(b.url || '')}" />
            </div>
          ` : ''}
          ${b.type === 'PHONE_NUMBER' ? `
            <div class="ae-field">
              <label class="ae-field-label">Número (E.164)</label>
              <input class="ae-input" type="tel"
                     data-btn-field="phone_number" data-btn-i="${i}"
                     placeholder="+573001234567"
                     value="${escAttr(b.phone_number || '')}" />
            </div>
          ` : ''}
          ${b.type === 'COPY_CODE' ? `
            <div class="ae-field">
              <label class="ae-field-label">Ejemplo de código</label>
              <input class="ae-input" type="text"
                     data-btn-field="example" data-btn-i="${i}"
                     placeholder="RENT2026"
                     value="${escAttr(b.example || '')}" />
            </div>
          ` : ''}
        </div>
      </div>
    `
  }

  function presetsHtml () {
    const list = window.rmTplPresets?.PRESETS || []
    return `
      <div class="wa-tpl-presets-card">
        <div class="wa-tpl-presets-h">
          <div>
            <span class="rp-eyebrow">PRESETS · INMOBILIARIAS</span>
            <h3 class="wa-tpl-presets-title">¿Quieres empezar desde un template pre-armado?</h3>
          </div>
          <button type="button" class="ae-btn-ghost" id="wa-tpl-skip-presets">Empezar de cero →</button>
        </div>
        <div class="wa-tpl-presets-grid">
          ${list.map(p => `
            <button type="button" class="wa-tpl-preset" data-preset="${esc(p.key)}">
              <div class="wa-tpl-preset-cat">${esc(p.category_label || p.template.category)}</div>
              <div class="wa-tpl-preset-title">${esc(p.title)}</div>
              <div class="wa-tpl-preset-preview">${esc(p.preview)}</div>
              <div class="wa-tpl-preset-cta">Usar este →</div>
            </button>
          `).join('')}
        </div>
      </div>
    `
  }

  function validationBlock () {
    const v = state.validation
    if (v.errors.length === 0 && v.warnings.length === 0) return ''
    return `
      <div class="wa-tpl-validation">
        ${v.errors.length ? `
          <div class="wa-tpl-validation-block wa-tpl-validation-errors">
            <div class="wa-tpl-validation-title">${v.errors.length} error${v.errors.length === 1 ? '' : 'es'} a corregir</div>
            <ul>${v.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${v.warnings.length ? `
          <div class="wa-tpl-validation-block wa-tpl-validation-warnings">
            <div class="wa-tpl-validation-title">${v.warnings.length} sugerencia${v.warnings.length === 1 ? '' : 's'}</div>
            <ul>${v.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
          </div>
        ` : ''}
      </div>
    `
  }

  function pageHtml () {
    const isEditing = !!state.editingId
    const showPresets = !isEditing && !state.template.body && !state.template.name
    return `
      <section class="rp-page rp-rise">
        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
          <div>
            <span class="rp-eyebrow">WHATSAPP TEMPLATES · ${isEditing ? 'EDITANDO' : 'NUEVA'}</span>
            <h1 class="rp-display">${isEditing ? `Editar plantilla` : 'Nueva plantilla'}</h1>
            <p class="rp-subhead">Camilo te ayuda a redactarla para pasar revisión Meta a la primera. Tiempo estimado: ~3 minutos.</p>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <a href="#whatsapp/templates" class="ae-btn-ghost">← Volver a templates</a>
          </div>
        </div>

        ${showPresets ? presetsHtml() : ''}

        <div class="wa-tpl-editor">
          <!-- LEFT: form -->
          <div class="wa-tpl-form-col">
            <div id="wa-tpl-form-sections">
              ${identitySection()}
              ${headerSection()}
              ${bodySection()}
              ${footerSection()}
              ${buttonsSection()}
            </div>

            <div id="wa-tpl-validation-slot">${validationBlock()}</div>

            <div class="wa-tpl-actions">
              <button type="button" class="ae-btn-ghost" id="wa-tpl-save-draft" ${state.saving ? 'disabled' : ''}>
                ${state.saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button type="button" class="ae-btn-primary" id="wa-tpl-submit" ${state.submitting || !state.validation.ok ? 'disabled' : ''}>
                ${state.submitting ? 'Enviando a Meta…' : 'Enviar a Meta para revisión'}
              </button>
            </div>
          </div>

          <!-- RIGHT: preview -->
          <div class="wa-tpl-preview-col">
            <div class="wa-tpl-preview-eyebrow">Preview en vivo</div>
            <div id="wa-tpl-preview-slot">${previewHtml()}</div>
            <div class="wa-tpl-preview-meta">
              ${state.template.category ? `<span class="wa-cat-badge wa-cat-${state.template.category === 'MARKETING' ? 'mkt' : state.template.category === 'AUTHENTICATION' ? 'auth' : 'util'}">${esc(state.template.category)}</span>` : ''}
              <span class="wa-lang">${esc(state.template.language || 'es_CO')}</span>
            </div>
          </div>
        </div>
      </section>
    `
  }

  // ─── Re-render helpers (preserve focus) ──────────────────
  function refreshPreview () {
    const slot = document.getElementById('wa-tpl-preview-slot')
    if (slot) slot.innerHTML = previewHtml()
  }
  function refreshHeader () {
    const slot = document.getElementById('wa-tpl-header-body')
    if (!slot) return
    const wrap = slot.parentElement
    wrap.outerHTML = headerSection()
    wireHeader()
  }
  function refreshButtons () {
    const slot = document.getElementById('wa-tpl-buttons-body')
    if (!slot) return
    const wrap = slot.parentElement
    wrap.outerHTML = buttonsSection()
    wireButtons()
  }
  function refreshValidation () {
    const v = window.rmTplValidation?.run(state.template) || { ok: true, errors: [], warnings: [] }
    state.validation = v
    const slot = document.getElementById('wa-tpl-validation-slot')
    if (slot) slot.innerHTML = validationBlock()
    const submitBtn = document.getElementById('wa-tpl-submit')
    if (submitBtn) submitBtn.disabled = !v.ok || state.submitting
  }
  function refreshAll () {
    state.validation = window.rmTplValidation?.run(state.template) || state.validation
    render()
  }

  // ─── Wiring ──────────────────────────────────────────────
  function onInputChange () {
    refreshPreview()
    refreshValidation()
  }

  function wireIdentity () {
    const name = document.getElementById('wa-tpl-name')
    const cat  = document.getElementById('wa-tpl-category')
    const lang = document.getElementById('wa-tpl-language')
    name?.addEventListener('input', e => {
      state.template.name = e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
      e.target.value = state.template.name
      refreshValidation()
    })
    cat?.addEventListener('change', e => { state.template.category = e.target.value; refreshValidation() })
    lang?.addEventListener('change', e => { state.template.language = e.target.value; refreshValidation() })
  }

  function wireHeader () {
    document.querySelectorAll('input[name="wa-tpl-header-type"]').forEach(r => {
      r.addEventListener('change', e => {
        state.template.header = { type: e.target.value }
        refreshHeader()
        refreshPreview()
        refreshValidation()
      })
    })
    document.getElementById('wa-tpl-header-text')?.addEventListener('input', e => {
      state.template.header.text = e.target.value
      const v = window.rmTplValidation?.extractVariables(e.target.value) || []
      state.template.header.examples = state.template.header.examples || {}
      // Drop examples for variables no longer present
      Object.keys(state.template.header.examples).forEach(k => { if (!v.includes(k)) delete state.template.header.examples[k] })
      // Add empty example placeholder for new variables
      v.forEach(k => { if (!state.template.header.examples[k]) state.template.header.examples[k] = '' })
      refreshPreview()
      refreshValidation()
    })
    document.getElementById('wa-tpl-header-pick')?.addEventListener('click', () => document.getElementById('wa-tpl-header-file')?.click())
    document.getElementById('wa-tpl-header-file')?.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      // Local preview only — uploading to Supabase + meta_handle is a Bloque 2 follow-up
      const reader = new FileReader()
      reader.onload = ev => {
        state.template.header.media_url = ev.target.result
        state.template.header.media_kind = state.template.header.type.toLowerCase()
        state.template.header.media_filename = file.name
        refreshHeader()
        refreshPreview()
        refreshValidation()
      }
      reader.readAsDataURL(file)
    })
    document.getElementById('wa-tpl-header-clear-media')?.addEventListener('click', () => {
      state.template.header.media_url = null
      state.template.header.media_kind = null
      state.template.header.media_filename = null
      refreshHeader()
      refreshPreview()
      refreshValidation()
    })
  }

  function wireBody () {
    const body = document.getElementById('wa-tpl-body')
    body?.addEventListener('input', e => {
      state.template.body = e.target.value
      const vars = [...new Set(window.rmTplValidation?.extractVariables(e.target.value) || [])]
      state.template.examples = state.template.examples || {}
      Object.keys(state.template.examples).forEach(k => {
        // Only drop if not used in body OR header
        const usedInHeader = (state.template.header?.text || '').includes(`{{${k}}}`)
        if (!vars.includes(k) && !usedInHeader) delete state.template.examples[k]
      })
      vars.forEach(k => { if (!state.template.examples[k]) state.template.examples[k] = '' })
      // Update counter inline
      const counter = document.querySelector('.wa-tpl-counter')
      if (counter) {
        counter.textContent = e.target.value.length + ' / 1024'
        counter.classList.toggle('is-over', e.target.value.length > 1024)
      }
      // Re-render the variables block (and body section) if vars changed
      const renderedVars = document.querySelectorAll('.wa-tpl-var-row')
      if (renderedVars.length !== vars.length) {
        // Need to re-render the body section's vars block
        rerenderBodySectionVars()
      }
      refreshPreview()
      refreshValidation()
    })

    document.querySelector('[data-act="insert-var"]')?.addEventListener('click', () => {
      const ta = document.getElementById('wa-tpl-body')
      if (!ta) return
      const vars = window.rmTplValidation?.extractVariables(state.template.body) || []
      const next = (vars.length ? Math.max(...vars.map(Number)) + 1 : 1)
      const insertion = `{{${next}}}`
      const start = ta.selectionStart || ta.value.length
      const end = ta.selectionEnd || ta.value.length
      ta.value = ta.value.slice(0, start) + insertion + ta.value.slice(end)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
      ta.setSelectionRange(start + insertion.length, start + insertion.length)
    })

    // Wire variable example inputs
    document.querySelectorAll('.wa-tpl-var-input').forEach(inp => {
      inp.addEventListener('input', e => {
        const k = inp.dataset.varKey
        state.template.examples = state.template.examples || {}
        state.template.examples[k] = e.target.value
        refreshPreview()
        refreshValidation()
      })
    })
  }

  function rerenderBodySectionVars () {
    const body = state.template.body
    const ta = document.getElementById('wa-tpl-body')
    const cursor = ta ? { start: ta.selectionStart, end: ta.selectionEnd, focus: document.activeElement === ta } : null

    // Re-render only the body section's content
    const bodySectionEl = document.getElementById('wa-tpl-body')?.closest('details.wa-tpl-section')
    if (!bodySectionEl) return
    bodySectionEl.outerHTML = bodySection()
    wireBody()

    // Restore cursor + focus
    if (cursor && cursor.focus) {
      const newTa = document.getElementById('wa-tpl-body')
      if (newTa) {
        newTa.focus()
        newTa.setSelectionRange(cursor.start, cursor.end)
      }
    }
  }

  function wireFooter () {
    document.getElementById('wa-tpl-footer')?.addEventListener('input', e => {
      state.template.footer = e.target.value
      refreshPreview()
      refreshValidation()
    })
  }

  function wireButtons () {
    document.querySelectorAll('[data-add-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.addBtn
        const buttons = state.template.buttons = state.template.buttons || []
        if (buttons.length >= 10) return
        const newBtn = { type, text: '' }
        if (type === 'URL')          newBtn.url = ''
        if (type === 'PHONE_NUMBER') newBtn.phone_number = ''
        if (type === 'COPY_CODE')    newBtn.example = ''
        buttons.push(newBtn)
        refreshButtons()
        refreshPreview()
        refreshValidation()
      })
    })
    document.querySelectorAll('[data-btn-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.btnRemove, 10)
        state.template.buttons.splice(i, 1)
        refreshButtons()
        refreshPreview()
        refreshValidation()
      })
    })
    document.querySelectorAll('[data-btn-field]').forEach(input => {
      input.addEventListener('input', e => {
        const i = parseInt(input.dataset.btnI, 10)
        const f = input.dataset.btnField
        if (state.template.buttons[i]) {
          state.template.buttons[i][f] = e.target.value
          refreshPreview()
          refreshValidation()
        }
      })
    })
  }

  function wirePresets () {
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset
        const preset = (window.rmTplPresets?.PRESETS || []).find(p => p.key === key)
        if (!preset) return
        state.template = JSON.parse(JSON.stringify(preset.template))
        // Ensure deep-copied examples is real obj
        state.template.examples = state.template.examples || {}
        refreshAll()
        window.rmToast?.(`✓ Preset "${preset.title}" cargado — edita lo que necesites`, 'success')
      })
    })
    document.getElementById('wa-tpl-skip-presets')?.addEventListener('click', () => {
      state.template.body = ' '   // forces presets card to hide
      state.template.body = ''
      // Trigger render without preset card
      // Easiest: set name to a single space then clear
      state.template.name = '_'
      refreshAll()
      state.template.name = ''
      const nameInput = document.getElementById('wa-tpl-name')
      if (nameInput) nameInput.value = ''
    })
  }

  function wireActions () {
    document.getElementById('wa-tpl-save-draft')?.addEventListener('click', saveDraft)
    document.getElementById('wa-tpl-submit')?.addEventListener('click', openSubmitConfirm)
  }

  // ─── Backend calls ───────────────────────────────────────
  async function saveDraft () {
    state.saving = true
    refreshAll()
    try {
      const payload = {
        ...state.template,
        id: state.editingId || undefined,
        status: 'DRAFT'
      }
      const r = await window.rmApi.post('/api/whatsapp/templates/save', payload)
      if (r.id) state.editingId = r.id
      window.rmToast?.('✓ Borrador guardado', 'success')
    } catch (err) {
      window.rmToast?.(`✗ ${err.message}`, 'error')
    } finally {
      state.saving = false
      refreshAll()
    }
  }

  function openSubmitConfirm () {
    const v = window.rmTplValidation?.run(state.template) || { ok: false, errors: ['Validation not loaded'], warnings: [] }
    if (!v.ok) {
      window.rmToast?.('Hay errores que arreglar antes de enviar', 'error')
      return
    }
    if (document.getElementById('wa-tpl-submit-modal')) return
    const root = document.createElement('div')
    root.id = 'wa-tpl-submit-modal'
    root.innerHTML = `
      <div class="wa-tpl-modal-overlay"></div>
      <div class="wa-tpl-modal">
        <header class="wa-tpl-modal-h">
          <span class="ae-eyebrow">CONFIRMAR · ENVÍO A META</span>
          <h2 class="wa-tpl-modal-title">¿Enviamos <em>"${esc(state.template.name)}"</em> a Meta?</h2>
        </header>
        <div class="wa-tpl-modal-body">
          <ul class="wa-tpl-modal-summary">
            <li><strong>Nombre</strong> <span>${esc(state.template.name)}</span></li>
            <li><strong>Categoría</strong> <span>${esc(state.template.category)}</span></li>
            <li><strong>Idioma</strong> <span>${esc(state.template.language)}</span></li>
            <li><strong>Header</strong> <span>${esc(state.template.header?.type || 'NONE')}</span></li>
            <li><strong>Variables</strong> <span>${(window.rmTplValidation?.extractVariables(state.template.body) || []).length}</span></li>
            <li><strong>Botones</strong> <span>${(state.template.buttons || []).length}</span></li>
          </ul>
          <div class="wa-tpl-modal-info">
            <div class="wa-tpl-modal-info-row">⏱ Tiempo de revisión: <strong>30 min – 48 horas</strong></div>
            <div class="wa-tpl-modal-info-row">⚠️ Una vez enviada, no podrás editar componentes principales</div>
            <div class="wa-tpl-modal-info-row">💡 Templates con tono promocional excesivo se rechazan</div>
          </div>
          ${v.warnings.length ? `
            <div class="wa-tpl-modal-warnings">
              <strong>Sugerencias antes de enviar:</strong>
              <ul>${v.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
            </div>
          ` : ''}
        </div>
        <footer class="wa-tpl-modal-foot">
          <button type="button" class="ae-btn-ghost" id="wa-tpl-cancel-submit">Cancelar</button>
          <button type="button" class="ae-btn-primary" id="wa-tpl-confirm-submit">Sí, enviar a Meta →</button>
        </footer>
      </div>
    `
    document.body.appendChild(root)
    requestAnimationFrame(() => root.classList.add('open'))
    document.getElementById('wa-tpl-cancel-submit').addEventListener('click', closeSubmitConfirm)
    root.querySelector('.wa-tpl-modal-overlay').addEventListener('click', closeSubmitConfirm)
    document.getElementById('wa-tpl-confirm-submit').addEventListener('click', doSubmit)
  }

  function closeSubmitConfirm () {
    const root = document.getElementById('wa-tpl-submit-modal')
    if (!root) return
    root.classList.remove('open')
    setTimeout(() => root.remove(), 200)
  }

  async function doSubmit () {
    closeSubmitConfirm()
    state.submitting = true
    refreshAll()
    try {
      const r = await window.rmApi.post('/api/whatsapp/templates/submit', state.template)
      if (r.id) state.editingId = r.id
      window.rmToast?.('✓ Plantilla enviada a Meta — revisión en curso', 'success')
      // Bounce back to list
      setTimeout(() => window.rmRouter?.goTo('whatsapp'), 800)
    } catch (err) {
      const detail = err.body?.detail || err.body?.error || ''
      window.rmToast?.(`✗ ${err.message}${detail ? ' — ' + detail : ''}`, 'error')
    } finally {
      state.submitting = false
      refreshAll()
    }
  }

  // ─── Mount + load existing ───────────────────────────────
  async function loadExisting (id) {
    state.loading = true
    render()
    try {
      const r = await window.rmApi.get('/api/whatsapp/templates/list?source=db')
      const found = (r.templates || []).find(t => t.id === id)
      if (!found) {
        window.rmToast?.('Plantilla no encontrada', 'error')
        window.rmRouter?.goTo('whatsapp')
        return
      }
      // Reconstruct the editor's template shape from the DB row
      state.template = reconstructTemplateFromComponents(found)
      state.editingId = id
    } catch (err) {
      window.rmToast?.(`Error: ${err.message}`, 'error')
    } finally {
      state.loading = false
      refreshAll()
    }
  }

  // Convert the canonical components[] back to the editor's shape
  function reconstructTemplateFromComponents (row) {
    const t = defaultTemplate()
    t.name = row.name
    t.category = row.category
    t.language = row.language
    const cs = row.components || []
    for (const c of cs) {
      if (c.type === 'HEADER') {
        if (c.format === 'TEXT') {
          t.header = { type: 'TEXT', text: c.text || '', examples: examplesFromArray(c.example?.header_text) }
        } else if (['IMAGE','VIDEO','DOCUMENT'].includes(c.format)) {
          t.header = { type: c.format, media_url: c.example?.header_handle?.[0] || '', media_kind: c.format.toLowerCase() }
        }
      } else if (c.type === 'BODY') {
        t.body = c.text || ''
        const ex = c.example?.body_text?.[0] || []
        ex.forEach((v, i) => { t.examples[String(i+1)] = v })
      } else if (c.type === 'FOOTER') {
        t.footer = c.text || ''
      } else if (c.type === 'BUTTONS') {
        t.buttons = (c.buttons || []).map(b => ({
          type: b.type,
          text: b.text || '',
          url: b.url,
          phone_number: b.phone_number,
          example: b.example?.[0]
        }))
      }
    }
    return t
  }

  function examplesFromArray (arr) {
    const out = {}
    if (!Array.isArray(arr)) return out
    arr.forEach((v, i) => { out[String(i+1)] = v })
    return out
  }

  // ─── Render entry ───────────────────────────────────────
  function render () {
    const slot = document.querySelector(`section[data-page="${state.pageId}"]`)
    if (!slot) return
    injectStylesOnce()
    state.validation = window.rmTplValidation?.run(state.template) || state.validation
    slot.innerHTML = pageHtml()
    wireAll()
  }

  function wireAll () {
    wirePresets()
    wireIdentity()
    wireHeader()
    wireBody()
    wireFooter()
    wireButtons()
    wireActions()
  }

  function injectStylesOnce () {
    if (document.getElementById('wa-tpl-editor-styles')) return
    const css = `
      .wa-tpl-editor { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.85fr); gap: 28px; align-items:start; }
      @media (max-width: 1024px) { .wa-tpl-editor { grid-template-columns: 1fr; } .wa-tpl-preview-col { position:static; } }

      .wa-tpl-form-col { min-width: 0; }
      .wa-tpl-preview-col { position: sticky; top: 16px; }
      .wa-tpl-preview-eyebrow { font-family: var(--rm-mono); font-size: 9.5px; font-weight:700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); text-transform:uppercase; margin-bottom:10px; }
      .wa-tpl-preview-meta { display:flex; gap:8px; margin-top:14px; align-items:center; }

      .wa-tpl-section { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
      .wa-tpl-section[open] { box-shadow: 0 1px 3px rgba(0,0,0,.04); }
      .wa-tpl-section > summary { display:flex; align-items:center; gap:14px; padding: 16px 22px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; color: var(--rm-ink, #0f1410); list-style: none; }
      .wa-tpl-section > summary::-webkit-details-marker { display: none; }
      .wa-tpl-section > summary::after { content: "▾"; margin-left: auto; color: var(--rm-muted, #7a7e79); transition: transform .18s; font-size: 12px; }
      .wa-tpl-section[open] > summary::after { transform: rotate(180deg); }
      .wa-tpl-step-num { font-family: var(--rm-mono); font-size: 11px; color: var(--rp-teal, #40d99d); font-weight: 700; }
      .wa-tpl-step-label { display:flex; align-items:center; gap:8px; }
      .wa-tpl-opt { font-family: var(--rm-mono); font-size: 9.5px; font-weight:700; letter-spacing: 0.1em; color: var(--rm-muted, #7a7e79); text-transform:uppercase; padding: 2px 7px; border-radius: 3px; background: var(--rp-surface-raised, #f6f3ee); }
      .wa-tpl-req { font-family: var(--rm-mono); font-size: 9.5px; font-weight:700; letter-spacing: 0.1em; color: var(--rm-red, #c0392b); text-transform:uppercase; padding: 2px 7px; border-radius: 3px; background: rgba(192,57,43,0.10); }
      .wa-tpl-section-body { padding: 4px 22px 22px; }

      .wa-tpl-radio-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .wa-tpl-radio { display: inline-flex; align-items: center; padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; color: var(--rm-muted, #7a7e79); border: 1px solid var(--rm-border, #e8e3dc); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
      .wa-tpl-radio.is-active { background: var(--rm-ink, #0f1410); color: #fff; border-color: var(--rm-ink, #0f1410); }
      .wa-tpl-radio input { display: none; }

      .wa-tpl-textarea { font-family: var(--rm-mono, 'JetBrains Mono', monospace); font-size: 13px; line-height: 1.55; resize: vertical; }
      .wa-tpl-body-tools { display: flex; align-items: center; gap: 10px; }
      .wa-tpl-toolbtn { background: var(--rp-surface-raised, #f6f3ee); border: 1px solid var(--rm-border, #e8e3dc); padding: 4px 10px; border-radius: 4px; font-family: var(--rm-mono); font-size: 10.5px; font-weight: 700; color: var(--rm-ink-2, #3a3f3b); cursor: pointer; }
      .wa-tpl-toolbtn:hover { background: var(--rp-surface, #fff); border-color: var(--rp-teal, #40d99d); color: var(--rm-ink, #0f1410); }
      .wa-tpl-counter { font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); }
      .wa-tpl-counter.is-over { color: var(--rm-red, #c0392b); font-weight: 700; }

      .wa-tpl-vars-block { margin-top: 14px; padding: 12px 14px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; }
      .wa-tpl-vars-title { font-size: 11.5px; font-weight: 600; margin-bottom: 8px; color: var(--rm-ink, #0f1410); }
      .wa-tpl-var-row { display: grid; grid-template-columns: 60px 1fr; gap: 10px; margin-bottom: 6px; align-items: center; }
      .wa-tpl-var-key { font-family: var(--rm-mono); font-size: 11.5px; font-weight: 700; color: var(--rp-teal-deep, var(--rm-green-deep, #004d35)); text-align: center; padding: 4px 8px; background: var(--rp-surface, #fff); border-radius: 4px; }

      .wa-tpl-empty-mini { font-size: 12.5px; color: var(--rm-muted, #7a7e79); padding: 12px 0; }
      .wa-tpl-buttons-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
      .wa-tpl-button-row { padding: 12px 14px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; }
      .wa-tpl-button-row-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .wa-tpl-button-type { font-family: var(--rm-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; color: var(--rm-ink-2, #3a3f3b); text-transform: uppercase; }
      .wa-tpl-button-remove { background: none; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: var(--rm-muted, #7a7e79); padding: 0 6px; }
      .wa-tpl-button-remove:hover { color: var(--rm-red, #c0392b); }
      .wa-tpl-add-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      .wa-tpl-add-buttons .ae-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

      .wa-tpl-actions { display: flex; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--rm-border, #e8e3dc); justify-content: flex-end; }

      .wa-tpl-validation { margin: 18px 0; }
      .wa-tpl-validation-block { padding: 14px 16px; border-radius: 6px; margin-bottom: 10px; }
      .wa-tpl-validation-block ul { margin: 6px 0 0; padding-left: 22px; font-size: 12.5px; line-height: 1.55; }
      .wa-tpl-validation-title { font-size: 13px; font-weight: 600; }
      .wa-tpl-validation-errors { background: rgba(192,57,43,0.06); border: 1px solid rgba(192,57,43,0.25); color: var(--rm-red, #c0392b); }
      .wa-tpl-validation-warnings { background: #fffaeb; border: 1px solid #fcd34d; color: #92400e; }

      /* Presets card */
      .wa-tpl-presets-card { background: linear-gradient(135deg, rgba(64,217,157,0.08), rgba(0,108,74,0.04)); border: 1px solid rgba(64,217,157,0.25); border-radius: 8px; padding: 22px 24px; margin-bottom: 24px; }
      .wa-tpl-presets-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
      .wa-tpl-presets-title { font-family: var(--rp-font); font-weight: 800; font-size: 22px; line-height: 1.2; letter-spacing: -0.02em; margin: 4px 0 0; color: var(--rp-ink, #1c1b1b); }
      .wa-tpl-presets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .wa-tpl-preset { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 6px; padding: 14px 16px; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s, box-shadow .15s; }
      .wa-tpl-preset:hover { transform: translateY(-2px); border-color: var(--rp-teal, #40d99d); box-shadow: 0 6px 16px rgba(0,0,0,.05); }
      .wa-tpl-preset-cat { font-family: var(--rm-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--rm-muted, #7a7e79); text-transform: uppercase; margin-bottom: 5px; }
      .wa-tpl-preset-title { font-size: 14px; font-weight: 700; color: var(--rm-ink, #0f1410); margin-bottom: 6px; }
      .wa-tpl-preset-preview { font-size: 11.5px; color: var(--rm-ink-2, #3a3f3b); line-height: 1.5; margin-bottom: 10px; }
      .wa-tpl-preset-cta { font-family: var(--rm-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--rm-green-deep, #004d35); text-transform: uppercase; }

      /* Phone preview */
      .wa-tpl-phone { display: flex; justify-content: center; }
      .wa-tpl-phone-frame { width: 320px; max-width: 100%; border-radius: 26px; background: #075e54; padding: 0; box-shadow: 0 14px 40px rgba(0,0,0,.18); overflow: hidden; }
      .wa-tpl-phone-bar { padding: 14px 16px; display: flex; align-items: center; gap: 10px; background: #075e54; color: #fff; }
      .wa-tpl-phone-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
      .wa-tpl-phone-name { font-size: 13.5px; font-weight: 600; }
      .wa-tpl-phone-sub { font-size: 11px; opacity: .8; }
      .wa-tpl-phone-screen { background: #ECE5DD; min-height: 360px; padding: 18px 14px; background-image: linear-gradient(135deg, rgba(255,255,255,.05) 25%, transparent 25%), linear-gradient(225deg, rgba(255,255,255,.05) 25%, transparent 25%); background-size: 24px 24px; }
      .wa-tpl-bubble { background: #fff; border-radius: 8px; padding: 8px 10px 6px; max-width: 92%; box-shadow: 0 1px 1px rgba(0,0,0,.10); position: relative; }
      .wa-tpl-bubble::before { content: ""; position: absolute; top: 0; left: -8px; width: 0; height: 0; border-style: solid; border-width: 0 8px 8px 0; border-color: transparent #fff transparent transparent; }
      .wa-tpl-bubble-header { font-weight: 700; font-size: 13.5px; color: #1c1c1c; margin-bottom: 6px; }
      .wa-tpl-bubble-media { width: 100%; height: 160px; background-size: cover; background-position: center; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; color: rgba(0,0,0,.4); font-size: 13px; background-color: #f0ede5; }
      .wa-tpl-bubble-video { background: #1c1c1c; color: rgba(255,255,255,.7); }
      .wa-tpl-bubble-doc { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f3ee; border-radius: 6px; margin-bottom: 8px; font-size: 12.5px; }
      .wa-tpl-bubble-doc-icon { font-size: 24px; }
      .wa-tpl-bubble-body { font-size: 13.5px; line-height: 1.5; color: #1c1c1c; word-wrap: break-word; }
      .wa-tpl-bubble-empty { color: rgba(0,0,0,.35); font-style: italic; }
      .wa-tpl-bubble-footer { font-size: 11.5px; color: rgba(0,0,0,.45); margin-top: 6px; }
      .wa-tpl-bubble-time { font-size: 10.5px; color: rgba(0,0,0,.45); text-align: right; margin-top: 4px; }
      .wa-tpl-var-placeholder { background: rgba(64,217,157,0.15); padding: 1px 5px; border-radius: 3px; color: var(--rm-green-deep, #004d35); font-weight: 600; font-family: var(--rm-mono); font-size: 12px; }
      .wa-tpl-bubble-qr-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
      .wa-tpl-bubble-qr { background: #fff; padding: 8px 14px; border-radius: 999px; font-size: 12.5px; color: #075e54; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
      .wa-tpl-bubble-cta-stack { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
      .wa-tpl-bubble-cta { background: #fff; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #075e54; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,.08); text-align: center; }

      /* Submit confirm modal */
      #wa-tpl-submit-modal { position: fixed; inset: 0; z-index: 2100; opacity: 0; transition: opacity .2s; }
      #wa-tpl-submit-modal.open { opacity: 1; }
      .wa-tpl-modal-overlay { position: absolute; inset: 0; background: rgba(15,20,16,0.58); backdrop-filter: blur(2px); }
      .wa-tpl-modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.98); transition: transform .2s; max-width: 540px; width: calc(100% - 32px); max-height: 88vh; overflow: auto; background: var(--rm-bg, #f6f3ee); border-radius: 8px; box-shadow: 0 24px 60px rgba(0,0,0,.20); display: flex; flex-direction: column; }
      #wa-tpl-submit-modal.open .wa-tpl-modal { transform: translate(-50%,-50%) scale(1); }
      .wa-tpl-modal-h { padding: 24px 28px 14px; }
      .wa-tpl-modal-title { font-family: var(--rp-font); font-weight: 800; font-size: 22px; line-height: 1.25; letter-spacing: -0.02em; margin: 4px 0 0; color: var(--rp-ink, #1c1b1b); }
      .wa-tpl-modal-title em { color: var(--rp-teal, #40d99d); font-style: normal; }
      .wa-tpl-modal-body { padding: 0 28px 18px; }
      .wa-tpl-modal-summary { list-style: none; padding: 0; margin: 0 0 14px; background: var(--rp-surface, #fff); border-radius: 6px; border: 1px solid var(--rm-border, #e8e3dc); }
      .wa-tpl-modal-summary li { display: flex; justify-content: space-between; padding: 9px 14px; font-size: 12.5px; border-bottom: 1px solid var(--rm-border, #e8e3dc); }
      .wa-tpl-modal-summary li:last-child { border-bottom: none; }
      .wa-tpl-modal-summary li strong { font-weight: 600; color: var(--rm-ink-2, #3a3f3b); }
      .wa-tpl-modal-summary li span { font-family: var(--rm-mono); color: var(--rm-ink, #0f1410); }
      .wa-tpl-modal-info { background: var(--rp-surface-raised, #f6f3ee); border-radius: 6px; padding: 12px 14px; }
      .wa-tpl-modal-info-row { font-size: 12.5px; padding: 4px 0; color: var(--rm-ink-2, #3a3f3b); }
      .wa-tpl-modal-warnings { margin-top: 12px; padding: 12px 14px; background: #fffaeb; border: 1px solid #fcd34d; border-radius: 6px; font-size: 12.5px; color: #92400e; }
      .wa-tpl-modal-warnings ul { margin: 6px 0 0; padding-left: 22px; }
      .wa-tpl-modal-foot { display: flex; gap: 10px; padding: 18px 28px; border-top: 1px solid var(--rm-border, #e8e3dc); justify-content: flex-end; background: var(--rp-surface, #fff); border-radius: 0 0 8px 8px; }
    `
    const s = document.createElement('style')
    s.id = 'wa-tpl-editor-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  async function mount (pageId) {
    state.pageId = pageId
    state.template = defaultTemplate()
    state.editingId = null
    state.submitting = false
    state.saving = false

    if (pageId === 'wa-template-edit') {
      let id = null
      try { id = sessionStorage.getItem('wa_template_edit_id') } catch (_) {}
      if (!id) {
        window.rmRouter?.goTo('whatsapp')
        return
      }
      await loadExisting(id)
      return
    }
    render()
  }

  document.addEventListener('rm-page-change', e => {
    if (PAGE_IDS.includes(e.detail.page)) mount(e.detail.page)
  })
  document.addEventListener('DOMContentLoaded', () => {
    const cur = window.rmRouter?.currentPage()
    if (PAGE_IDS.includes(cur)) mount(cur)
  })
})()
