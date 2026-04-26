/**
 * RENTMIES — WhatsApp API (Meta Graph proxy)
 *
 *   GET /api/whatsapp?action=templates → list message templates for a WABA
 *
 * Credentials priority:
 *   1. Headers x-meta-token / x-waba-id (sent by dashboard from localStorage in demo mode).
 *   2. Env vars META_ACCESS_TOKEN / META_WABA_ID (server-level fallback).
 */

const axios = require('axios')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id, x-meta-token, x-waba-id')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = (req.query.action || '').toString()

  const token = req.headers['x-meta-token'] || process.env.META_ACCESS_TOKEN || ''
  const wabaId = req.headers['x-waba-id'] || process.env.META_WABA_ID || ''

  if (action === 'templates' && req.method === 'GET') {
    if (!token || !wabaId) {
      return res.status(400).json({
        error: 'Faltan credenciales de Meta. Guarda Access Token y WABA ID en ⚙️ Configuración → Meta/Facebook.'
      })
    }
    try {
      const { data } = await axios.get(`${META_GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
        params: {
          access_token: token,
          fields: 'name,status,category,language,quality_score,components',
          limit: 100
        },
        timeout: 15000
      })
      return res.json({ data: data.data || [] })
    } catch (err) {
      const fb = err.response && err.response.data && err.response.data.error
      if (fb) return res.status(400).json({ error: `[${fb.code}] ${fb.message}` })
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: `Acción no válida: '${action}'. Usa templates` })
}
