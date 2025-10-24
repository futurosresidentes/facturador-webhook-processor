/**
 * Servicio de caché para comerciales y productos de Strapi
 * Mantiene en memoria los catálogos para búsqueda rápida
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// Cachés en memoria
let comercialesCache = [];
let productosCache = [];
let lastComercialeFetch = null;
let lastProductoFetch = null;
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
 * Consulta la API de Strapi para obtener el listado de comerciales
 * @returns {Promise<Array>} Array de comerciales
 */
async function fetchComercialesFromAPI() {
  try {
    // Validar que las credenciales estén configuradas
    if (!config.strapi?.url || !config.strapi?.token) {
      logger.warn('[StrapiCache] ⚠️  Variables de entorno no configuradas (STRAPI_URL o STRAPI_TOKEN). Caché de comerciales deshabilitado.');
      return [];
    }

    logger.info('[StrapiCache] Consultando comerciales desde Strapi API...');

    const response = await axios.get(
      `${config.strapi.url}/api/comerciales?pagination[pageSize]=1000`,
      {
        headers: {
          'Authorization': `Bearer ${config.strapi.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data.data) {
      const comerciales = response.data.data.map(c => ({
        id: c.id,
        documentId: c.documentId,
        nombre: c.nombre || c.attributes?.nombre,
        nombreNormalizado: normalizeString(c.nombre || c.attributes?.nombre),
        numero_documento: c.numero_documento || c.attributes?.numero_documento
      }));

      logger.info(`[StrapiCache] ✅ ${comerciales.length} comerciales cargados exitosamente`);
      return comerciales;
    }

    logger.warn('[StrapiCache] Respuesta inesperada de la API comerciales:', response.data);
    return [];

  } catch (error) {
    logger.warn('[StrapiCache] ⚠️  Error consultando comerciales:', error.message);
    return [];
  }
}

/**
 * Consulta la API de Strapi para obtener el listado de productos
 * @returns {Promise<Array>} Array de productos
 */
async function fetchProductosFromAPI() {
  try {
    // Validar que las credenciales estén configuradas
    if (!config.strapi?.url || !config.strapi?.token) {
      logger.warn('[StrapiCache] ⚠️  Variables de entorno no configuradas (STRAPI_URL o STRAPI_TOKEN). Caché de productos deshabilitado.');
      return [];
    }

    logger.info('[StrapiCache] Consultando productos desde Strapi API...');

    const response = await axios.get(
      `${config.strapi.url}/api/productos?pagination[pageSize]=1000`,
      {
        headers: {
          'Authorization': `Bearer ${config.strapi.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data.data) {
      const productos = response.data.data.map(p => ({
        id: p.id,
        documentId: p.documentId,
        nombre: p.nombre || p.attributes?.nombre,
        nombreNormalizado: normalizeString(p.nombre || p.attributes?.nombre),
        sku: p.sku || p.attributes?.sku,
        vigente: p.vigente !== undefined ? p.vigente : p.attributes?.vigente
      }));

      logger.info(`[StrapiCache] ✅ ${productos.length} productos cargados exitosamente`);
      return productos;
    }

    logger.warn('[StrapiCache] Respuesta inesperada de la API productos:', response.data);
    return [];

  } catch (error) {
    logger.warn('[StrapiCache] ⚠️  Error consultando productos:', error.message);
    return [];
  }
}

/**
 * Inicializa o actualiza el caché de comerciales
 * @param {boolean} force - Forzar actualización aunque no haya expirado el caché
 * @returns {Promise<boolean>} true si se actualizó exitosamente
 */
async function refreshComerciales(force = false) {
  const now = Date.now();

  // Verificar si necesita actualización
  if (!force && lastComercialeFetch && (now - lastComercialeFetch) < CACHE_TTL_MS) {
    logger.debug('[StrapiCache] Caché de comerciales vigente');
    return true;
  }

  const comerciales = await fetchComercialesFromAPI();

  if (comerciales.length > 0) {
    comercialesCache = comerciales;
    lastComercialeFetch = now;
    logger.info(`[StrapiCache] ✅ Caché de comerciales actualizado: ${comerciales.length} registros`);
    return true;
  }

  // Si ya tenemos un caché previo, mantenerlo
  if (comercialesCache.length > 0) {
    logger.debug('[StrapiCache] No se pudo actualizar comerciales, manteniendo caché previo');
    return true;
  }

  logger.debug('[StrapiCache] Caché de comerciales vacío');
  return false;
}

/**
 * Inicializa o actualiza el caché de productos
 * @param {boolean} force - Forzar actualización aunque no haya expirado el caché
 * @returns {Promise<boolean>} true si se actualizó exitosamente
 */
async function refreshProductos(force = false) {
  const now = Date.now();

  // Verificar si necesita actualización
  if (!force && lastProductoFetch && (now - lastProductoFetch) < CACHE_TTL_MS) {
    logger.debug('[StrapiCache] Caché de productos vigente');
    return true;
  }

  const productos = await fetchProductosFromAPI();

  if (productos.length > 0) {
    productosCache = productos;
    lastProductoFetch = now;
    logger.info(`[StrapiCache] ✅ Caché de productos actualizado: ${productos.length} registros`);
    return true;
  }

  // Si ya tenemos un caché previo, mantenerlo
  if (productosCache.length > 0) {
    logger.debug('[StrapiCache] No se pudo actualizar productos, manteniendo caché previo');
    return true;
  }

  logger.debug('[StrapiCache] Caché de productos vacío');
  return false;
}

/**
 * Busca un comercial por nombre
 * @param {string} nombreComercial - Nombre del comercial a buscar
 * @returns {Promise<Object|null>} Objeto de comercial encontrado o null
 */
async function findComercialByName(nombreComercial) {
  // Asegurar que el caché esté inicializado
  if (comercialesCache.length === 0) {
    await refreshComerciales();
  }

  if (comercialesCache.length === 0) {
    logger.warn('[StrapiCache] Caché de comerciales vacío, no se puede buscar');
    return null;
  }

  if (!nombreComercial) {
    return null;
  }

  const normalizedSearch = normalizeString(nombreComercial);

  // 1. Búsqueda exacta normalizada
  let found = comercialesCache.find(c => c.nombreNormalizado === normalizedSearch);

  if (found) {
    logger.info(`[StrapiCache] Comercial encontrado (exacto): "${nombreComercial}" → ID ${found.id}`);
    return found;
  }

  // 2. Búsqueda parcial (contiene)
  found = comercialesCache.find(c =>
    c.nombreNormalizado.includes(normalizedSearch) ||
    normalizedSearch.includes(c.nombreNormalizado)
  );

  if (found) {
    logger.info(`[StrapiCache] Comercial encontrado (parcial): "${nombreComercial}" → ID ${found.id}`);
    return found;
  }

  logger.warn(`[StrapiCache] Comercial no encontrado: "${nombreComercial}"`);
  return null;
}

/**
 * Busca un producto por nombre (normalizado, sin "- Cuota N")
 * @param {string} nombreProducto - Nombre del producto a buscar (puede incluir "- Cuota N")
 * @returns {Promise<Object|null>} Objeto de producto encontrado o null
 */
async function findProductoByName(nombreProducto) {
  // Asegurar que el caché esté inicializado
  if (productosCache.length === 0) {
    await refreshProductos();
  }

  if (productosCache.length === 0) {
    logger.warn('[StrapiCache] Caché de productos vacío, no se puede buscar');
    return null;
  }

  if (!nombreProducto) {
    return null;
  }

  // Normalizar el producto (quitar "- Cuota N", "- Cuota N (Mora)", etc.)
  const { getProductBase } = require('../utils/productFilter');
  const productoBase = getProductBase(nombreProducto) || nombreProducto;

  const normalizedSearch = normalizeString(productoBase);

  // 1. Búsqueda exacta normalizada
  let found = productosCache.find(p => p.nombreNormalizado === normalizedSearch);

  if (found) {
    logger.info(`[StrapiCache] Producto encontrado (exacto): "${nombreProducto}" → "${productoBase}" → ID ${found.id}`);
    return found;
  }

  // 2. Búsqueda parcial (contiene)
  found = productosCache.find(p =>
    p.nombreNormalizado.includes(normalizedSearch) ||
    normalizedSearch.includes(p.nombreNormalizado)
  );

  if (found) {
    logger.info(`[StrapiCache] Producto encontrado (parcial): "${nombreProducto}" → "${productoBase}" → ID ${found.id}`);
    return found;
  }

  logger.warn(`[StrapiCache] Producto no encontrado: "${nombreProducto}" (base: "${productoBase}")`);
  return null;
}

/**
 * Obtiene el tamaño del caché de comerciales
 * @returns {number} Cantidad de comerciales en caché
 */
function getComercialCacheSize() {
  return comercialesCache.length;
}

/**
 * Obtiene el tamaño del caché de productos
 * @returns {number} Cantidad de productos en caché
 */
function getProductoCacheSize() {
  return productosCache.length;
}

/**
 * Obtiene información del estado del caché
 * @returns {Object} Estado del caché
 */
function getCacheInfo() {
  return {
    comerciales: {
      size: comercialesCache.length,
      lastFetchTime: lastComercialeFetch ? new Date(lastComercialeFetch).toISOString() : null,
      ageMs: lastComercialeFetch ? Date.now() - lastComercialeFetch : null,
      ttlMs: CACHE_TTL_MS,
      isExpired: lastComercialeFetch ? (Date.now() - lastComercialeFetch) > CACHE_TTL_MS : true
    },
    productos: {
      size: productosCache.length,
      lastFetchTime: lastProductoFetch ? new Date(lastProductoFetch).toISOString() : null,
      ageMs: lastProductoFetch ? Date.now() - lastProductoFetch : null,
      ttlMs: CACHE_TTL_MS,
      isExpired: lastProductoFetch ? (Date.now() - lastProductoFetch) > CACHE_TTL_MS : true
    }
  };
}

// Inicializar cachés al cargar el módulo (después de un pequeño delay)
setTimeout(() => {
  refreshComerciales().catch(err => {
    logger.debug('[StrapiCache] Inicialización de comerciales sin éxito (normal si Strapi no está disponible)');
  });

  refreshProductos().catch(err => {
    logger.debug('[StrapiCache] Inicialización de productos sin éxito (normal si Strapi no está disponible)');
  });
}, 100);

module.exports = {
  refreshComerciales,
  refreshProductos,
  findComercialByName,
  findProductoByName,
  getComercialCacheSize,
  getProductoCacheSize,
  getCacheInfo,
  normalizeString
};
