/**
 * Utilidades para manejo de fechas en zona horaria colombiana
 * Colombia: UTC-5 (COT - Colombia Time)
 */

/**
 * Convierte una fecha a hora colombiana (UTC-5)
 * @param {Date|string} date - Fecha a convertir (opcional, default = now)
 * @returns {Date} Fecha ajustada a zona horaria colombiana
 */
function toColombiaTime(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Convertir a hora colombiana (UTC-5)
  // getTime() da UTC, le restamos 5 horas (5 * 60 * 60 * 1000 ms)
  const colombiaOffset = -5 * 60 * 60 * 1000;
  return new Date(d.getTime() + colombiaOffset);
}

/**
 * Formatea una fecha en formato ISO con zona horaria colombiana
 * @param {Date|string} date - Fecha a formatear (opcional, default = now)
 * @returns {string} Fecha en formato ISO con zona horaria (ej: "2025-10-21T21:41:44-05:00")
 */
function toColombiaISO(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Obtener componentes en UTC
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');

  // Restar 5 horas para Colombia
  const colombiaDate = new Date(d.getTime() - (5 * 60 * 60 * 1000));

  const colYear = colombiaDate.getUTCFullYear();
  const colMonth = String(colombiaDate.getUTCMonth() + 1).padStart(2, '0');
  const colDay = String(colombiaDate.getUTCDate()).padStart(2, '0');
  const colHours = String(colombiaDate.getUTCHours()).padStart(2, '0');
  const colMinutes = String(colombiaDate.getUTCMinutes()).padStart(2, '0');
  const colSeconds = String(colombiaDate.getUTCSeconds()).padStart(2, '0');
  const colMs = String(colombiaDate.getUTCMilliseconds()).padStart(3, '0');

  return `${colYear}-${colMonth}-${colDay}T${colHours}:${colMinutes}:${colSeconds}.${colMs}-05:00`;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para Colombia
 * @returns {string} Fecha en formato YYYY-MM-DD (ej: "2025-10-21")
 */
function getColombiaDateString() {
  const now = new Date();
  const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));

  const year = colombiaDate.getUTCFullYear();
  const month = String(colombiaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(colombiaDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Obtiene la fecha y hora actual formateada para Colombia
 * @returns {string} Fecha y hora legible (ej: "2025-10-21 21:41:44")
 */
function getColombiaDateTime() {
  const now = new Date();
  const colombiaDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));

  const year = colombiaDate.getUTCFullYear();
  const month = String(colombiaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(colombiaDate.getUTCDate()).padStart(2, '0');
  const hours = String(colombiaDate.getUTCHours()).padStart(2, '0');
  const minutes = String(colombiaDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(colombiaDate.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  toColombiaTime,
  toColombiaISO,
  getColombiaDateString,
  getColombiaDateTime
};
