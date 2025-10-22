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
 * GET /api/webhooks/recent
 * Lista webhooks recientes con sus logs
 * Query params: ?limit=10 (opcional, default: todos)
 * Retorna webhooks ordenados por fecha (más recientes primero) con logs agrupados
 * Requiere: Authorization: Bearer <token>
 */
router.get('/recent', authenticate, webhookController.getRecentWebhooks);

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

/**
 * POST /api/webhooks/:id/clean-logs
 * Limpia logs duplicados de un webhook completado (mantiene solo el último procesamiento)
 * Requiere: Authorization: Bearer <token>
 */
router.post('/:id/clean-logs', authenticate, webhookController.cleanDuplicateLogs);

/**
 * DELETE /api/webhooks/logs/all
 * ⚠️ PELIGROSO: Borra TODOS los logs de la base de datos (inicio fresco)
 * Requiere: Authorization: Bearer <token> + ?confirmation=yes
 * Mantiene los webhooks pero borra todos sus logs
 */
router.delete('/logs/all', authenticate, webhookController.deleteAllLogs);

/**
 * DELETE /api/webhooks/keep-last
 * ⚠️ PELIGROSO: Borra TODOS los webhooks excepto el último completado exitosamente
 * Requiere: Authorization: Bearer <token> + ?confirmation=yes
 * Mantiene solo el webhook más reciente con status="completed"
 */
router.delete('/keep-last', authenticate, webhookController.keepOnlyLastSuccessful);

/**
 * PATCH /api/webhooks/:id/status
 * Actualiza manualmente el estado de un webhook
 * Body: { status, current_stage, last_completed_stage }
 * Requiere: Authorization: Bearer <token>
 */
router.patch('/:id/status', authenticate, webhookController.updateWebhookStatus);

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
