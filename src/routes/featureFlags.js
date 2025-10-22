/**
 * Feature Flags Routes
 * Endpoints para consultar y actualizar switches de configuración
 */

const express = require('express');
const router = express.Router();
const FeatureFlag = require('../models/FeatureFlag');
const logger = require('../config/logger');

/**
 * GET /api/feature-flags
 * Listar todos los feature flags
 */
router.get('/', async (req, res) => {
  try {
    const flags = await FeatureFlag.findAll({
      order: [['key', 'ASC']]
    });

    // Formatear respuesta
    const flagsMap = {};
    flags.forEach(flag => {
      flagsMap[flag.key] = {
        value: flag.value,
        description: flag.description,
        updated_by: flag.updated_by,
        updated_at: flag.updated_at
      };
    });

    res.json({
      success: true,
      flags: flagsMap,
      count: flags.length
    });
  } catch (error) {
    logger.error('[FeatureFlags API] Error listando flags:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo feature flags'
    });
  }
});

/**
 * GET /api/feature-flags/:key
 * Obtener un feature flag específico
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const flag = await FeatureFlag.findOne({ where: { key } });

    if (!flag) {
      return res.status(404).json({
        success: false,
        error: `Feature flag '${key}' no encontrado`
      });
    }

    res.json({
      success: true,
      flag: {
        key: flag.key,
        value: flag.value,
        description: flag.description,
        updated_by: flag.updated_by,
        updated_at: flag.updated_at
      }
    });
  } catch (error) {
    logger.error('[FeatureFlags API] Error obteniendo flag:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo feature flag'
    });
  }
});

/**
 * PUT /api/feature-flags/:key
 * Actualizar un feature flag
 * Body: { value: true/false, updated_by: "nombre" }
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, updated_by } = req.body;

    // Validar que value sea boolean
    if (typeof value !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'El campo "value" debe ser true o false'
      });
    }

    // Actualizar flag
    const result = await FeatureFlag.setFlag(key, value, updated_by || 'api');

    logger.info(`[FeatureFlags API] Flag actualizado: ${key} = ${value} by ${updated_by || 'api'}`);

    res.json({
      success: true,
      message: `Feature flag '${key}' actualizado`,
      flag: {
        key,
        value,
        updated_by: updated_by || 'api',
        created: result.created
      }
    });
  } catch (error) {
    logger.error('[FeatureFlags API] Error actualizando flag:', error);
    res.status(500).json({
      success: false,
      error: 'Error actualizando feature flag'
    });
  }
});

/**
 * POST /api/feature-flags/invalidate-cache
 * Invalidar cache de feature flags (forzar recarga)
 */
router.post('/invalidate-cache', async (req, res) => {
  try {
    FeatureFlag.invalidateCache();

    logger.info('[FeatureFlags API] Cache invalidado');

    res.json({
      success: true,
      message: 'Cache de feature flags invalidado'
    });
  } catch (error) {
    logger.error('[FeatureFlags API] Error invalidando cache:', error);
    res.status(500).json({
      success: false,
      error: 'Error invalidando cache'
    });
  }
});

module.exports = router;
