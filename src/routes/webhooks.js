const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const validateWebhook = require('../middleware/validateWebhook');

/**
 * POST /api/webhooks
 * Recibe webhooks de ePayco
 */
router.post('/', validateWebhook, webhookController.receiveWebhook);

/**
 * GET /api/webhooks
 * Lista webhooks con filtros
 */
router.get('/', webhookController.listWebhooks);

/**
 * GET /api/webhooks/:id
 * Obtiene un webhook específico con sus logs y membresías
 */
router.get('/:id', webhookController.getWebhook);

/**
 * POST /api/webhooks/:id/reprocess
 * Reprocesa un webhook existente
 */
router.post('/:id/reprocess', webhookController.reprocessWebhook);

module.exports = router;
