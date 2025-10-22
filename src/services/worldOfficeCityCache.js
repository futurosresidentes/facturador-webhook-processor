/**
 * Servicio de caché para ciudades de World Office
 * Mantiene en memoria el listado de ciudades para búsqueda rápida
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// Caché en memoria
let citiesCache = [];
let lastFetchTime = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Normaliza un string para comparación (sin acentos, mayúsculas, sin espacios extra)
 * @param {string} str - String a normalizar
 * @returns {string} String normalizado
 */
function normalizeString(str) {
  if (!str) return '';

  return str
    .toString()
    .trim()
    .toUpperCase()
    .normalize('NFD') // Descomponer caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // Eliminar marcas diacríticas (acentos)
    .replace(/\s+/g, ' '); // Normalizar espacios múltiples
}

/**
 * Consulta la API de World Office para obtener el listado de ciudades
 * @returns {Promise<Array>} Array de ciudades
 */
async function fetchCitiesFromAPI() {
  try {
    // Validar que las credenciales estén configuradas
    if (!config.worldOffice?.apiUrl || !config.worldOffice?.apiToken) {
      logger.warn('[WO-CityCache] ⚠️  Variables de entorno no configuradas (WORLDOFFICE_API_URL o WORLDOFFICE_API_TOKEN). Caché de ciudades deshabilitado.');
      return [];
    }

    logger.info('[WO-CityCache] Consultando ciudades desde World Office API...');

    const response = await axios.post(
      `${config.worldOffice.apiUrl}/api/v1/ciudad/listarCiudades`,
      {
        columnaOrdenar: 'id',
        pagina: 0,
        registrosPorPagina: 2000,
        orden: 'ASC',
        registroInicial: 0
      },
      {
        headers: {
          'Authorization': config.worldOffice.apiToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data.status === 'OK' && response.data.data?.content) {
      const cities = response.data.data.content.map(city => ({
        id: city.id,
        nombre: city.nombre,
        nombreNormalizado: normalizeString(city.nombre),
        codigo: city.codigo,
        departamento: city.ubicacionDepartamento?.nombre,
        departamentoId: city.ubicacionDepartamento?.id
      }));

      logger.info(`[WO-CityCache] ${cities.length} ciudades cargadas exitosamente`);
      return cities;
    }

    logger.warn('[WO-CityCache] Respuesta inesperada de la API:', response.data);
    return [];

  } catch (error) {
    // Si es un error de configuración, no es crítico (se usará Medellín por defecto)
    if (error.code === 'ENOTFOUND' || error.message.includes('timeout')) {
      logger.warn('[WO-CityCache] ⚠️  No se pudo conectar con World Office API (se usará Medellín por defecto)');
    } else {
      logger.warn('[WO-CityCache] ⚠️  Error consultando ciudades:', error.message);
    }
    return [];
  }
}

/**
 * Inicializa o actualiza el caché de ciudades
 * @param {boolean} force - Forzar actualización aunque no haya expirado el caché
 * @returns {Promise<boolean>} true si se actualizó exitosamente
 */
async function refreshCache(force = false) {
  const now = Date.now();

  // Verificar si necesita actualización
  if (!force && lastFetchTime && (now - lastFetchTime) < CACHE_TTL_MS) {
    logger.debug('[WO-CityCache] Caché vigente, no se requiere actualización');
    return true;
  }

  const cities = await fetchCitiesFromAPI();

  if (cities.length > 0) {
    citiesCache = cities;
    lastFetchTime = now;
    logger.info(`[WO-CityCache] ✅ Caché actualizado con ${cities.length} ciudades`);
    return true;
  }

  // Si ya tenemos un caché previo, mantenerlo
  if (citiesCache.length > 0) {
    logger.debug('[WO-CityCache] No se pudo actualizar, pero se mantiene caché previo');
    return true;
  }

  logger.debug('[WO-CityCache] Caché vacío (se usará Medellín por defecto)');
  return false;
}

/**
 * Busca una ciudad por nombre (con normalización y fuzzy matching)
 * @param {string} cityName - Nombre de la ciudad a buscar
 * @returns {Promise<Object|null>} Objeto de ciudad encontrada o null
 */
async function findCityByName(cityName) {
  // Asegurar que el caché esté inicializado
  if (citiesCache.length === 0) {
    await refreshCache();
  }

  if (citiesCache.length === 0) {
    logger.warn('[WO-CityCache] Caché vacío, no se puede buscar ciudad');
    return null;
  }

  if (!cityName || cityName === 'N/A') {
    return null;
  }

  const normalizedSearch = normalizeString(cityName);

  // 1. Búsqueda exacta normalizada
  let found = citiesCache.find(city => city.nombreNormalizado === normalizedSearch);

  if (found) {
    logger.info(`[WO-CityCache] Ciudad encontrada (exacta): "${cityName}" → ID ${found.id} (${found.nombre})`);
    return found;
  }

  // 2. Búsqueda parcial (contiene)
  found = citiesCache.find(city =>
    city.nombreNormalizado.includes(normalizedSearch) ||
    normalizedSearch.includes(city.nombreNormalizado)
  );

  if (found) {
    logger.info(`[WO-CityCache] Ciudad encontrada (parcial): "${cityName}" → ID ${found.id} (${found.nombre})`);
    return found;
  }

  logger.warn(`[WO-CityCache] Ciudad no encontrada: "${cityName}"`);
  return null;
}

/**
 * Obtiene una ciudad por ID
 * @param {number} cityId - ID de la ciudad
 * @returns {Promise<Object|null>} Objeto de ciudad o null
 */
async function findCityById(cityId) {
  // Asegurar que el caché esté inicializado
  if (citiesCache.length === 0) {
    await refreshCache();
  }

  const found = citiesCache.find(city => city.id === cityId);
  return found || null;
}

/**
 * Obtiene el tamaño del caché
 * @returns {number} Cantidad de ciudades en caché
 */
function getCacheSize() {
  return citiesCache.length;
}

/**
 * Obtiene información del estado del caché
 * @returns {Object} Estado del caché
 */
function getCacheInfo() {
  return {
    size: citiesCache.length,
    lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    ageMs: lastFetchTime ? Date.now() - lastFetchTime : null,
    ttlMs: CACHE_TTL_MS,
    isExpired: lastFetchTime ? (Date.now() - lastFetchTime) > CACHE_TTL_MS : true
  };
}

// Inicializar caché al cargar el módulo (después de un pequeño delay para que logger esté listo)
// Los errores de inicialización no son críticos, se usa Medellín por defecto
setTimeout(() => {
  refreshCache().catch(err => {
    logger.debug('[WO-CityCache] Inicialización automática sin éxito (normal si WO API no está disponible)');
  });
}, 100);

module.exports = {
  refreshCache,
  findCityByName,
  findCityById,
  getCacheSize,
  getCacheInfo,
  normalizeString
};
