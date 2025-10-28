/**
 * Feature Flags Routes
 * Endpoints para consultar y actualizar switches de configuración
 */

const express = require('express');
const router = express.Router();
const FeatureFlag = require('../models/FeatureFlag');
const logger = require('../config/logger');
const apiKeyAuth = require('../middleware/apiKeyAuth');

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
 * PUT /api/feature-flags/:key
 * Actualizar un feature flag (REQUIERE API KEY)
 * Headers: Authorization: Bearer YOUR_API_KEY
 * Body: { value: true/false, updated_by: "nombre" }
 */
router.put('/:key', apiKeyAuth, async (req, res) => {
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

module.exports = router;
