const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');
const authenticate = require('../middleware/authenticate');

/**
 * POST /api/migrations/run
 * Ejecuta migraciones SQL pendientes
 * ⚠️ ENDPOINT TEMPORAL - Eliminar después de ejecutar
 * Requiere: Authorization: Bearer <token>
 */
router.post('/run', authenticate, migrationController.runMigrations);

/**
 * GET /api/migrations/status
 * Verifica el estado de las migraciones
 * Requiere: Authorization: Bearer <token>
 */
router.get('/status', authenticate, migrationController.checkMigrationStatus);

module.exports = router;
