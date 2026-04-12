/**
 * Utilidades de normalización — ciudad y texto colombiano
 */

function normalizeCity(ciudad) {
  return (ciudad || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

module.exports = { normalizeCity }
