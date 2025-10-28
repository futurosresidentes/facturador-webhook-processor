const express = require('express');
const router = express.Router();
const cacheController = require('../controllers/cacheController');
const authenticate = require('../middleware/authenticate');

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
