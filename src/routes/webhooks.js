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
 * POST /api/webhooks/:id/retry
 * Reintentar webhook usando checkpoints (no repite stages completados)
 * Body: { force_restart: false, skip_stages: [], max_retries: 3 }
 * Requiere: Authorization: Bearer <token>
 */
router.post('/:id/retry', authenticate, webhookController.retryWebhook);

/**
 * GET /api/webhooks
 * Lista todos los webhooks con logs (o filtra por parámetros)
 * Query params:
 *   ?id=88 - Busca webhook específico con logs detallados
 *   ?limit=10 - Limita cantidad (sin limit trae TODOS)
 *   ?status=pending - Filtra por status
 *   ?current_stage=worldoffice_dian - Filtra por stage
 *   ?incomplete=true - Solo webhooks incompletos
 *   ?offset=0 - Paginación
 * Requiere: Authorization: Bearer <token>
 */
router.get('/', authenticate, webhookController.listWebhooks);

/**
 * PATCH /api/webhooks/:id
 * Edita campos de un webhook existente
 * Body: { product, customer_email, customer_name, etc. }
 * Requiere: Authorization: Bearer <token>
 */
router.patch('/:id', authenticate, webhookController.editWebhook);

/**
 * DELETE /api/webhooks/:id
 * Elimina un webhook por ID (incluye sus logs por CASCADE)
 * Requiere: Authorization: Bearer <token>
 */
router.delete('/:id', authenticate, webhookController.deleteWebhook);

module.exports = router;
