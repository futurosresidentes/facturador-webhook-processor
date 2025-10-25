const strapiCache = require('../services/strapiCache');
const logger = require('../config/logger');

/**
 * GET /api/cache/status
 * Obtiene el estado actual del caché de Strapi (comerciales y productos)
 */
async function getCacheStatus(req, res) {
  try {
    const cacheInfo = strapiCache.getCacheInfo();

    // Formatear la información para mejor legibilidad
    const formattedInfo = {
      comerciales: {
        count: cacheInfo.comerciales.size,
        lastUpdate: cacheInfo.comerciales.lastFetchTime,
        ageInMinutes: cacheInfo.comerciales.ageMs ? Math.floor(cacheInfo.comerciales.ageMs / 60000) : null,
        ttlInHours: Math.floor(cacheInfo.comerciales.ttlMs / 3600000),
        isExpired: cacheInfo.comerciales.isExpired,
        nextRefresh: cacheInfo.comerciales.nextRefreshTime
      },
      productos: {
        count: cacheInfo.productos.size,
        lastUpdate: cacheInfo.productos.lastFetchTime,
        ageInMinutes: cacheInfo.productos.ageMs ? Math.floor(cacheInfo.productos.ageMs / 60000) : null,
        ttlInHours: Math.floor(cacheInfo.productos.ttlMs / 3600000),
        isExpired: cacheInfo.productos.isExpired,
        nextRefresh: cacheInfo.productos.nextRefreshTime
      }
    };

    res.json({
      success: true,
      cache: formattedInfo
    });
  } catch (error) {
    logger.error('[CacheController] Error obteniendo estado del caché:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/cache/refresh
 * Fuerza la actualización del caché de comerciales y productos
 * Query params:
 *   ?type=comerciales - Solo refrescar comerciales
 *   ?type=productos - Solo refrescar productos
 *   (sin type = refrescar ambos)
 */
async function refreshCache(req, res) {
  try {
    const { type } = req.query;

    const results = {
      comerciales: null,
      productos: null
    };

    // Refrescar comerciales
    if (!type || type === 'comerciales') {
      logger.info('[CacheController] Forzando refresh de caché de comerciales...');
      const comercialesSuccess = await strapiCache.refreshComerciales(true);
      results.comerciales = {
        success: comercialesSuccess,
        count: strapiCache.getComercialCacheSize()
      };
    }

    // Refrescar productos
    if (!type || type === 'productos') {
      logger.info('[CacheController] Forzando refresh de caché de productos...');
      const productosSuccess = await strapiCache.refreshProductos(true);
      results.productos = {
        success: productosSuccess,
        count: strapiCache.getProductoCacheSize()
      };
    }

    // Determinar si hubo algún error
    const allSuccess = Object.values(results)
      .filter(r => r !== null)
      .every(r => r.success);

    if (allSuccess) {
      logger.info('[CacheController] Caché refrescado exitosamente');
      res.json({
        success: true,
        message: 'Caché actualizado exitosamente',
        results
      });
    } else {
      logger.warn('[CacheController] Algunos cachés no se pudieron actualizar');
      res.status(500).json({
        success: false,
        message: 'No se pudieron actualizar todos los cachés',
        results
      });
    }
  } catch (error) {
    logger.error('[CacheController] Error refrescando caché:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getCacheStatus,
  refreshCache
};
