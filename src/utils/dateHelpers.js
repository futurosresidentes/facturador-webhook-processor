/**
 * Convierte una fecha a formato ISO UTC
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} - Fecha en formato ISO UTC
 */
function toISOString(date) {
  if (!date) {
    return new Date().toISOString();
  }

  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toISOString();
}

/**
 * Agrega días a una fecha
 * @param {Date} date - Fecha base
 * @param {number} days - Días a agregar
 * @returns {Date} - Nueva fecha
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Formatea fecha para la API de FR360
 * @param {Date} date - Fecha a formatear
 * @returns {string} - Fecha formateada en UTC
 */
function formatForFR360(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Verifica si una fecha es válida
 * @param {Date|string} date - Fecha a validar
 * @returns {boolean} - true si es válida
 */
function isValidDate(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  return !isNaN(dateObj.getTime());
}

/**
 * Obtiene la fecha de hoy a medianoche UTC
 * @returns {Date} - Fecha de hoy
 */
function getToday() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

module.exports = {
  toISOString,
  addDays,
  formatForFR360,
  isValidDate,
  getToday
};
