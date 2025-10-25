const express = require('express');
const router = express.Router();
const cacheController = require('../controllers/cacheController');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/cache/status
 * Obtiene el estado actual del caché (comerciales y productos de Strapi)
 *
 * Response:
 * {
 *   "success": true,
 *   "cache": {
 *     "comerciales": {
 *       "count": 15,
 *       "lastUpdate": "2025-10-25T12:00:00.000Z",
 *       "ageInMinutes": 45,
 *       "ttlInHours": 24,
 *       "isExpired": false,
 *       "nextRefresh": "2025-10-26T12:00:00.000Z"
 *     },
 *     "productos": { ... }
 *   }
 * }
 */
router.get('/status', authenticate, cacheController.getCacheStatus);

/**
 * POST /api/cache/refresh
 * Fuerza la actualización del caché
 *
 * Query params:
 *   ?type=comerciales - Solo refrescar comerciales
 *   ?type=productos - Solo refrescar productos
 *   (sin type = refrescar ambos)
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Caché actualizado exitosamente",
 *   "results": {
 *     "comerciales": { "success": true, "count": 15 },
 *     "productos": { "success": true, "count": 350 }
 *   }
 * }
 */
router.post('/refresh', authenticate, cacheController.refreshCache);

module.exports = router;
