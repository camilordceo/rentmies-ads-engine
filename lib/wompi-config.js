/**
 * Wompi configuration — single source of truth for env, base URL, keys.
 *
 * Required env vars (set in Vercel for sandbox first):
 *   WOMPI_ENV               'sandbox' | 'production'  (default: 'sandbox')
 *   WOMPI_PUBLIC_KEY        pub_test_xxx  (sandbox) | pub_prod_xxx (production)
 *   WOMPI_PRIVATE_KEY       prv_test_xxx | prv_prod_xxx  — backend ONLY, never expose
 *   WOMPI_EVENTS_SECRET     test_events_xxx | prod_events_xxx — verify webhooks
 *   WOMPI_INTEGRITY_SECRET  test_integrity_xxx | prod_integrity_xxx — sign Widget txns
 *
 * Rule: sandbox keys → sandbox URL, prod keys → prod URL. Never mix.
 */

const ENV = (process.env.WOMPI_ENV || 'sandbox').toLowerCase()
const IS_PROD = ENV === 'production' || ENV === 'prod'

const PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || ''
const PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || ''
const EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || ''
const INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || ''

const BASE_URL = IS_PROD
  ? 'https://production.wompi.co/v1'
  : 'https://sandbox.wompi.co/v1'

const JS_LIB_URL = 'https://cdn.wompi.co/libs/js/v1.js'

function isConfigured() {
  return !!(PUBLIC_KEY && PRIVATE_KEY && EVENTS_SECRET && INTEGRITY_SECRET)
}

function missingEnvVars() {
  const missing = []
  if (!PUBLIC_KEY) missing.push('WOMPI_PUBLIC_KEY')
  if (!PRIVATE_KEY) missing.push('WOMPI_PRIVATE_KEY')
  if (!EVENTS_SECRET) missing.push('WOMPI_EVENTS_SECRET')
  if (!INTEGRITY_SECRET) missing.push('WOMPI_INTEGRITY_SECRET')
  return missing
}

function keyPrefixesValid() {
  if (IS_PROD) {
    return PUBLIC_KEY.startsWith('pub_prod_') && PRIVATE_KEY.startsWith('prv_prod_')
  }
  return PUBLIC_KEY.startsWith('pub_test_') && PRIVATE_KEY.startsWith('prv_test_')
}

module.exports = {
  ENV,
  IS_PROD,
  PUBLIC_KEY,
  PRIVATE_KEY,
  EVENTS_SECRET,
  INTEGRITY_SECRET,
  BASE_URL,
  JS_LIB_URL,
  isConfigured,
  missingEnvVars,
  keyPrefixesValid
}
