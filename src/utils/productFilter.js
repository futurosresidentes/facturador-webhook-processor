/**
 * Productos permitidos para crear membresías
 */
const PRODUCTOS_PERMITIDOS = [
  'Élite - 6 meses',
  'Élite - 9 meses'
];

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

  for (const base of PRODUCTOS_PERMITIDOS) {
    if (producto === base ||
        producto === `${base} - Cuota 1` ||
        producto === `${base} - Cuota 1 (Mora)`) {
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
  getProductBase,
  requiresMemberships
};
