/**
 * Productos permitidos para crear membresías
 */
const PRODUCTOS_PERMITIDOS = [
  'Élite - 6 meses',
  'Élite - 9 meses',
  'Curso Intensivo UDEA 2026'
];

/**
 * Normaliza un producto para corregir problemas de encoding y formato
 * @param {string} producto - Nombre del producto
 * @returns {string} - Producto normalizado
 */
function normalizeProductName(producto) {
  if (!producto) return '';

  let normalized = producto
    // Fix encoding: "Ãlite" → "Élite"
    .replace(/Ãlite/gi, 'Élite')
    // Normalizar "elite" sin acento → "Élite"
    .replace(/\belite\b/gi, 'Élite')
    // Múltiples espacios → un solo espacio
    .replace(/\s+/g, ' ')
    .trim();

  // Agregar guion antes de "Cuota" si falta
  // Ejemplo: "Curso Intensivo UDEA 2026  Cuota 1" → "Curso Intensivo UDEA 2026 - Cuota 1"
  if (/\s+Cuota\s+\d+/i.test(normalized) && !normalized.includes(' - Cuota')) {
    normalized = normalized.replace(/\s+Cuota\s+/i, ' - Cuota ');
  }

  // Agregar guion antes de "(Mora)" si falta
  if (/\s+\(Mora\)/i.test(normalized) && !normalized.includes(' - Cuota')) {
    // Si tiene "Cuota 1(Mora)" sin espacio
    normalized = normalized.replace(/Cuota\s*(\d+)\s*\(Mora\)/i, 'Cuota $1 (Mora)');
  }

  return normalized;
}

/**
 * Verifica si un producto está permitido para crear membresías
 * Solo se permiten:
 * - Producto base (ej: "Élite - 9 meses")
 * - Cuota 1 (ej: "Élite - 9 meses - Cuota 1")
 * - Cuota 1 en mora (ej: "Élite - 9 meses - Cuota 1 (Mora)")
 *
 * @param {string} producto - Nombre del producto
 * @returns {string|null} - Producto base si es permitido, null si no
 */
function getProductBase(producto) {
  if (!producto) {
    return null;
  }

  // Normalizar producto antes de comparar
  const productoNormalizado = normalizeProductName(producto);

  for (const base of PRODUCTOS_PERMITIDOS) {
    if (productoNormalizado === base ||
        productoNormalizado === `${base} - Cuota 1` ||
        productoNormalizado === `${base} - Cuota 1 (Mora)`) {
      return base;
    }
  }

  return null;
}

/**
 * Verifica si un producto requiere creación de membresías
 * @param {string} producto - Nombre del producto
 * @returns {boolean} - true si requiere membresías, false si no
 */
function requiresMemberships(producto) {
  return getProductBase(producto) !== null;
}

module.exports = {
  PRODUCTOS_PERMITIDOS,
  normalizeProductName,
  getProductBase,
  requiresMemberships
};
