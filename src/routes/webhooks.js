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
 * ⚠️ TEMPORALMENTE DESHABILITADO - Sistema de checkpoints incompleto
 * Reintentar webhook usando checkpoints (no repite stages completados)
 * Body: { force_restart: false, skip_stages: [], max_retries: 3 }
 * Requiere: Authorization: Bearer <token>
 */
router.post('/:id/retry', authenticate, (req, res) => {
  res.status(503).json({
    success: false,
    error: 'RETRY TEMPORALMENTE DESHABILITADO',
    reason: 'Sistema de checkpoints incompleto - solo 4 de 10 stages tienen checkpoint',
    risk: 'Usar retry puede causar duplicación de facturas y registros',
    status: 'En desarrollo - agregar checkpoints a stages faltantes',
    eta: 'Disponible después de implementar checkpoints completos'
  });
});

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
