/* ─────────────────────────────────────────────────────────────
   WhatsApp Template Validation (Step 15)
   Pure functions used by the editor + by the submit endpoint
   client-side preflight. Reflects the rules Meta enforces:

     1. Variables must be sequential: {{1}}, {{2}}, {{3}} — gaps
        are rejected.
     2. Body cannot start or end with a variable.
     3. Adjacent variables ({{1}}{{2}}) are not allowed.
     4. Every variable in body must have an example value.
     5. Footer cannot contain any variables.
     6. Header text variables may only have one variable per header.
     7. Quick-reply buttons: max 3.
     8. Call-to-action buttons: max 2 (URL + Phone).

   API:
     window.rmTplValidation.run(template) → { ok, errors: [...], warnings: [...] }
     window.rmTplValidation.extractVariables(text) → ['1','2',...]
     window.rmTplValidation.validateName(name) → { ok, error? }
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VAR_RE = /\{\{(\d+)\}\}/g
  const NAME_RE = /^[a-z0-9_]{3,512}$/

  function extractVariables (text) {
    if (!text) return []
    const out = []
    let m
    VAR_RE.lastIndex = 0
    while ((m = VAR_RE.exec(text))) out.push(m[1])
    return out
  }

  function validateName (name) {
    if (!name) return { ok: false, error: 'Necesitas un nombre' }
    if (!NAME_RE.test(name)) return { ok: false, error: 'Solo lowercase, números y _ (3-512 chars)' }
    return { ok: true }
  }

  // Returns array of error strings, empty if no errors
  function validateBody (body, examples) {
    const errors = []
    const warnings = []

    if (!body || !body.trim()) {
      errors.push('El BODY es obligatorio')
      return { errors, warnings }
    }
    if (body.length > 1024) {
      errors.push(`BODY tiene ${body.length} chars; máximo 1024`)
    }

    const vars = extractVariables(body)

    if (vars.length === 0) return { errors, warnings }

    // Rule 1: sequential
    const sorted = [...new Set(vars.map(Number))].sort((a, b) => a - b)
    if (sorted[0] !== 1) errors.push(`Las variables deben empezar en {{1}} — encontré {{${sorted[0]}}}`)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i-1] + 1) {
        errors.push(`Las variables deben ser secuenciales: falta {{${sorted[i-1]+1}}} entre {{${sorted[i-1]}}} y {{${sorted[i]}}}`)
      }
    }

    // Rule 2: cannot start or end with a variable
    if (/^\s*\{\{\d+\}\}/.test(body))    errors.push('El BODY no puede empezar con una variable')
    if (/\{\{\d+\}\}\s*$/.test(body))    errors.push('El BODY no puede terminar con una variable')

    // Rule 3: no adjacent variables
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) {
      errors.push('Dos variables no pueden estar pegadas — escribe texto entre ellas')
    }

    // Rule 4: each unique var has an example
    const uniqueVars = [...new Set(vars)]
    for (const v of uniqueVars) {
      const ex = examples && examples[v]
      if (!ex || !String(ex).trim()) {
        errors.push(`Falta valor de ejemplo para {{${v}}}`)
      }
    }

    // Style warnings (don't block submit)
    if (body.length < 30) warnings.push('Tu mensaje es muy corto. Meta a veces rechaza por falta de contexto.')
    if (/!{2,}/.test(body)) warnings.push('Evita "!!" o "!!!" — Meta lo marca como promocional agresivo.')
    if (/(GRATIS|GANA|OFERTA|DESCUENTO)/.test(body)) warnings.push('Palabras como "GRATIS", "GANA" o "DESCUENTO" disparan el filtro promocional de Meta.')

    return { errors, warnings }
  }

  function validateFooter (footer) {
    const errors = []
    if (!footer) return { errors }
    if (footer.length > 60) errors.push(`FOOTER tiene ${footer.length} chars; máximo 60`)
    if (extractVariables(footer).length > 0) errors.push('El FOOTER no puede tener variables')
    return { errors }
  }

  function validateHeader (header) {
    const errors = []
    if (!header || header.type === 'NONE') return { errors }
    if (header.type === 'TEXT') {
      if (!header.text || !header.text.trim()) errors.push('Header TEXT vacío')
      if (header.text && header.text.length > 60) errors.push('Header TEXT máximo 60 chars')
      const vars = extractVariables(header.text || '')
      if (vars.length > 1) errors.push('Header TEXT solo permite UNA variable')
      if (vars.length === 1) {
        const v = vars[0]
        if (!header.examples || !header.examples[v] || !String(header.examples[v]).trim()) {
          errors.push(`Falta ejemplo para variable {{${v}}} del header`)
        }
      }
    }
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.type) && !header.media_url) {
      errors.push(`Header ${header.type} requiere subir un archivo`)
    }
    return { errors }
  }

  function validateButtons (buttons) {
    const errors = []
    const warnings = []
    if (!buttons || buttons.length === 0) return { errors, warnings }
    if (buttons.length > 10) errors.push('Máximo 10 botones')

    const qr = buttons.filter(b => b.type === 'QUICK_REPLY')
    const cta = buttons.filter(b => b.type !== 'QUICK_REPLY')

    if (qr.length > 3) errors.push('Máximo 3 botones de Quick Reply')
    if (cta.length > 2) errors.push('Máximo 2 botones de Call to Action (URL + Phone)')

    if (qr.length > 0 && cta.length > 0) warnings.push('Mezclar Quick Reply con CTA limita la flexibilidad — Meta los renderiza distinto.')

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]
      if (!b.text || !b.text.trim()) errors.push(`Botón ${i+1} sin texto`)
      if (b.text && b.text.length > 25) errors.push(`Botón ${i+1}: máximo 25 chars (tiene ${b.text.length})`)
      if (b.type === 'URL' && !b.url) errors.push(`Botón ${i+1}: URL requerida`)
      if (b.type === 'URL' && b.url && !/^https?:\/\//.test(b.url)) errors.push(`Botón ${i+1}: URL debe empezar con http:// o https://`)
      if (b.type === 'PHONE_NUMBER' && !b.phone_number) errors.push(`Botón ${i+1}: número telefónico requerido`)
      if (b.type === 'COPY_CODE' && !b.example) warnings.push(`Botón ${i+1}: agrega un ejemplo del código`)
    }
    return { errors, warnings }
  }

  function run (template) {
    const errors = []
    const warnings = []

    const nameCheck = validateName(template.name)
    if (!nameCheck.ok) errors.push(nameCheck.error)

    if (!template.category) errors.push('Selecciona una categoría')
    if (!template.language) errors.push('Selecciona un idioma')

    const headerR = validateHeader(template.header)
    errors.push(...headerR.errors)

    const bodyR = validateBody(template.body, template.examples || {})
    errors.push(...bodyR.errors)
    warnings.push(...bodyR.warnings)

    const footerR = validateFooter(template.footer)
    errors.push(...footerR.errors)

    const buttonsR = validateButtons(template.buttons || [])
    errors.push(...buttonsR.errors)
    warnings.push(...buttonsR.warnings)

    return { ok: errors.length === 0, errors, warnings }
  }

  window.rmTplValidation = { run, extractVariables, validateName, validateBody, validateFooter, validateHeader, validateButtons }
})()
