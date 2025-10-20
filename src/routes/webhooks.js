const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const validateWebhook = require('../middleware/validateWebhook');
const authenticate = require('../middleware/authenticate');

/**
 * POST /api/webhooks
 * Recibe webhooks de ePayco (sin autenticación - validado por ePayco)
 */
router.post('/', validateWebhook, webhookController.receiveWebhook);

/**
 * GET /api/webhooks/stats
 * Obtiene estadísticas generales de webhooks
 * Requiere: Authorization: Bearer <token>
 */
router.get('/stats', authenticate, webhookController.getWebhookStats);

/**
 * GET /api/webhooks/incomplete
 * Lista webhooks que NO están 100% completados
 * Requiere: Authorization: Bearer <token>
 */
router.get('/incomplete', authenticate, webhookController.getIncompleteWebhooks);

/**
 * GET /api/webhooks/stage/:stage
 * Lista webhooks atascados en un stage específico
 * Ejemplo: /api/webhooks/stage/worldoffice_dian
 * Requiere: Authorization: Bearer <token>
 */
router.get('/stage/:stage', authenticate, webhookController.getWebhooksByStage);

/**
 * GET /api/webhooks
 * Lista webhooks con filtros
 * Query params: ?status=pending&current_stage=worldoffice_dian&incomplete=true&limit=50&offset=0
 * Requiere: Authorization: Bearer <token>
 */
router.get('/', authenticate, webhookController.listWebhooks);

/**
 * GET /api/webhooks/:id/logs
 * Obtiene los logs detallados de procesamiento de un webhook
 * Requiere: Authorization: Bearer <token>
 */
router.get('/:id/logs', authenticate, webhookController.getWebhookLogs);

/**
 * GET /api/webhooks/:id
 * Obtiene un webhook específico con sus logs y membresías
 * Requiere: Authorization: Bearer <token>
 */
router.get('/:id', authenticate, webhookController.getWebhook);

/**
 * POST /api/webhooks/:id/reprocess
 * Reprocesa un webhook existente
 * Requiere: Authorization: Bearer <token>
 */
router.post('/:id/reprocess', authenticate, webhookController.reprocessWebhook);

module.exports = router;
