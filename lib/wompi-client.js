/**
 * Wompi HTTP client + crypto helpers.
 *
 *  fetchAcceptanceTokens()       → { acceptance_token, accept_personal_auth, presigned_*_url }
 *  integritySignature({ ref, amountCents, currency })  → SHA256 hash for Widget txns
 *  verifyWebhook(event)          → boolean
 *  createPaymentSourceCard()     → { id, status, ... }
 *  chargePaymentSource()         → { id, status, ... }
 *  getTransaction(id)            → transaction object
 *  refreshLongLivedToken         → not used (Meta-only concept)
 */

const axios = require('axios')
const crypto = require('crypto')
const cfg = require('./wompi-config')

const TIMEOUT_MS = 15000

function authHeaders(useService = false) {
  const key = useService ? cfg.PRIVATE_KEY : cfg.PUBLIC_KEY
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

/**
 * GET /merchants/:public_key — returns the presigned acceptance + personal data
 * tokens we must include in every transaction / payment source. They expire,
 * so we always re-fetch right before the charge.
 */
async function fetchAcceptanceTokens() {
  if (!cfg.PUBLIC_KEY) throw new Error('WOMPI_PUBLIC_KEY not set')
  const url = `${cfg.BASE_URL}/merchants/${cfg.PUBLIC_KEY}`
  const r = await axios.get(url, { timeout: TIMEOUT_MS })
  const m = r.data && r.data.data
  if (!m) throw new Error('Unexpected /merchants response')
  return {
    acceptance_token: m.presigned_acceptance && m.presigned_acceptance.acceptance_token,
    accept_personal_auth: m.presigned_personal_data_auth && m.presigned_personal_data_auth.acceptance_token,
    presigned_acceptance_url: m.presigned_acceptance && m.presigned_acceptance.permalink,
    presigned_personal_data_auth_url: m.presigned_personal_data_auth && m.presigned_personal_data_auth.permalink
  }
}

/**
 * Integrity signature for Widget / Checkout flow.
 * SHA256(reference + amount_in_cents + currency + integrity_secret)
 * Required when posting to /transactions from the frontend Widget — for
 * server-side direct integration with private key it's not needed.
 */
function integritySignature({ reference, amountCents, currency = 'COP' }) {
  if (!cfg.INTEGRITY_SECRET) throw new Error('WOMPI_INTEGRITY_SECRET not set')
  const concat = `${reference}${amountCents}${currency}${cfg.INTEGRITY_SECRET}`
  return crypto.createHash('sha256').update(concat).digest('hex')
}

/**
 * Webhook signature verification.
 * Wompi posts events with { event, data, sent_at, timestamp, signature: { properties, checksum } }.
 * Reconstruct the string by mapping each property path against `data`, append timestamp,
 * append events_secret, SHA256 → must match checksum.
 *
 * Properties array is dynamic — never hardcode it. Always read from the event itself.
 */
function verifyWebhook(event) {
  if (!cfg.EVENTS_SECRET) {
    console.warn('[wompi] verifyWebhook: WOMPI_EVENTS_SECRET not set')
    return false
  }
  if (!event || !event.signature || !event.signature.properties || !event.signature.checksum) return false

  let str = ''
  for (const prop of event.signature.properties) {
    const path = prop.split('.')
    let val = event.data
    for (const k of path) {
      if (val == null) break
      val = val[k]
    }
    if (val == null) val = ''
    str += String(val)
  }
  str += String(event.timestamp || '')
  str += cfg.EVENTS_SECRET

  const computed = crypto.createHash('sha256').update(str).digest('hex')
  return computed.toLowerCase() === String(event.signature.checksum).toLowerCase()
}

/**
 * POST /payment_sources — register a card token as a reusable payment source.
 * Returns { id, status: 'AVAILABLE'|'PENDING'|'DECLINED'|'ERROR', ... }.
 */
async function createPaymentSourceCard({ token, customerEmail, acceptanceToken, acceptPersonalAuth, sessionId }) {
  if (!cfg.PRIVATE_KEY) throw new Error('WOMPI_PRIVATE_KEY not set')
  const body = {
    type: 'CARD',
    token,
    customer_email: customerEmail,
    acceptance_token: acceptanceToken,
    accept_personal_auth: acceptPersonalAuth
  }
  if (sessionId) body.session_id = sessionId

  const r = await axios.post(`${cfg.BASE_URL}/payment_sources`, body, {
    headers: authHeaders(true),
    timeout: TIMEOUT_MS
  })
  return r.data && r.data.data
}

/**
 * POST /transactions — charge using either a one-time card token (`token`) or
 * a stored payment source (`payment_source_id`). For subscriptions we always
 * use payment_source_id so no user interaction is needed.
 */
async function createTransaction({ amountCents, currency = 'COP', customerEmail, reference, paymentSourceId, token, installments = 1, acceptanceToken, acceptPersonalAuth }) {
  if (!cfg.PRIVATE_KEY) throw new Error('WOMPI_PRIVATE_KEY not set')

  const payment_method = paymentSourceId
    ? { type: 'CARD', payment_source_id: paymentSourceId, installments }
    : { type: 'CARD', token, installments }

  const body = {
    amount_in_cents: amountCents,
    currency,
    customer_email: customerEmail,
    reference,
    payment_method_type: 'CARD',
    payment_method,
    acceptance_token: acceptanceToken
  }
  if (acceptPersonalAuth) body.accept_personal_auth = acceptPersonalAuth

  const r = await axios.post(`${cfg.BASE_URL}/transactions`, body, {
    headers: authHeaders(true),
    timeout: TIMEOUT_MS
  })
  return r.data && r.data.data
}

/**
 * GET /transactions/:id — for status polling and webhook reconciliation.
 */
async function getTransaction(id) {
  if (!cfg.PRIVATE_KEY) throw new Error('WOMPI_PRIVATE_KEY not set')
  const r = await axios.get(`${cfg.BASE_URL}/transactions/${id}`, {
    headers: authHeaders(true),
    timeout: TIMEOUT_MS
  })
  return r.data && r.data.data
}

/**
 * Generate a unique transaction reference. Format:
 *   RM-{plan}-{empresaId8}-{epochMs}
 */
function generateReference({ planCode, empresaId, suffix }) {
  const shortId = String(empresaId || 'anon').replace(/-/g, '').slice(0, 8)
  const tail = suffix || Date.now()
  return `RM-${planCode || 'pay'}-${shortId}-${tail}`
}

module.exports = {
  fetchAcceptanceTokens,
  integritySignature,
  verifyWebhook,
  createPaymentSourceCard,
  createTransaction,
  getTransaction,
  generateReference
}
