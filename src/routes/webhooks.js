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
 *
 * ⚠️ IMPORTANTE: Solo stages críticos tienen checkpoint implementado:
 * - ✅ invoice_extraction
 * - ✅ fr360_query
 * - ✅ callbell_notification (NO duplica WhatsApp)
 * - ✅ membership_creation (NO duplica membresías)
 * - ✅ worldoffice_invoice_creation (NO duplica facturas)
 * - ✅ strapi_facturacion_creation (NO duplica registros)
 * - ⚠️ Otros stages se RE-EJECUTARÁN (CRM, WO customer, accounting, etc.)
 *
 * Body: { force_restart: false, skip_stages: [], max_retries: 3 }
 * Requiere: Authorization: Bearer <token>
 */
router.post('/:id/retry', authenticate, webhookController.retryWebhook);

/**
 * GET /api/webhooks/recent
 * Alias de GET /api/webhooks?limit=100&order=created_at&dir=DESC
 * Retorna los últimos 100 webhooks ordenados por fecha (más reciente primero)
 * Incluye logs resumidos por webhook
 * Requiere: Authorization: Bearer <token>
 */
router.get('/recent', authenticate, (req, res, next) => {
  // Forzar parámetros para "recent"
  req.query.limit = req.query.limit || '100';
  req.query.order = req.query.order || 'created_at';
  req.query.dir = req.query.dir || 'DESC';
  next();
}, webhookController.listWebhooks);

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
