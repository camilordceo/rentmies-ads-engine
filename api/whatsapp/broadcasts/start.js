/**
 * POST /api/whatsapp/broadcasts/start
 *   Starts (or resumes) sending of a broadcast draft.
 *
 * BLOQUE 2 STUB.
 */

const { cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  return res.status(501).json({
    error: 'Not Implemented',
    detail: 'Broadcast send orchestration ships in Bloque 2.'
  })
}
