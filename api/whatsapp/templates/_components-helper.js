/**
 * Shared helper for converting the editor's template shape into
 * Meta Graph's components[] payload (and back).
 *
 *   buildComponents(state)  → array suitable for POST /message_templates
 *   buildVariablesSchema(s) → [{ key, label, example }] for caching
 *
 * Vercel ignores files starting with `_` so this module is internal.
 */

function buildComponents (t) {
  const out = []

  // Header
  if (t.header && t.header.type && t.header.type !== 'NONE') {
    if (t.header.type === 'TEXT') {
      const c = { type: 'HEADER', format: 'TEXT', text: t.header.text || '' }
      const vars = (t.header.text || '').match(/\{\{\d+\}\}/g) || []
      if (vars.length) {
        const examples = (t.header.examples || {})
        c.example = { header_text: Object.keys(examples).sort().map(k => examples[k]) }
      }
      out.push(c)
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header.type)) {
      const c = { type: 'HEADER', format: t.header.type }
      if (t.header.media_handle || t.header.media_url) {
        c.example = { header_handle: [t.header.media_handle || t.header.media_url] }
      }
      out.push(c)
    }
  }

  // Body (always present)
  const bodyVars = (t.body || '').match(/\{\{(\d+)\}\}/g) || []
  const uniqueBodyVars = [...new Set(bodyVars.map(m => m.slice(2, -2)))].sort((a, b) => Number(a) - Number(b))
  const bodyComponent = { type: 'BODY', text: t.body || '' }
  if (uniqueBodyVars.length > 0) {
    const ex = (t.examples || {})
    bodyComponent.example = { body_text: [uniqueBodyVars.map(v => ex[v] || '')] }
  }
  out.push(bodyComponent)

  // Footer
  if (t.footer && t.footer.trim()) {
    out.push({ type: 'FOOTER', text: t.footer })
  }

  // Buttons
  if (Array.isArray(t.buttons) && t.buttons.length > 0) {
    const buttons = t.buttons.map(b => {
      const out = { type: b.type, text: b.text || '' }
      if (b.type === 'URL') {
        out.url = b.url || ''
        if (b.example) out.example = [b.example]
      } else if (b.type === 'PHONE_NUMBER') {
        out.phone_number = b.phone_number || ''
      } else if (b.type === 'COPY_CODE') {
        if (b.example) out.example = [b.example]
      }
      return out
    })
    out.push({ type: 'BUTTONS', buttons })
  }

  return out
}

function buildVariablesSchema (t) {
  const headerVars = ((t.header?.text || '').match(/\{\{(\d+)\}\}/g) || []).map(m => m.slice(2, -2))
  const bodyVars   = ((t.body || '').match(/\{\{(\d+)\}\}/g) || []).map(m => m.slice(2, -2))
  const all = [...new Set([...headerVars, ...bodyVars])].sort((a, b) => Number(a) - Number(b))
  const examples = t.examples || {}
  return all.map(v => ({ key: v, label: '', example: examples[v] || '' }))
}

module.exports = { buildComponents, buildVariablesSchema }
