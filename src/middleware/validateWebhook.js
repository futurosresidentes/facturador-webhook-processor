const logger = require('../config/logger');

/**
 * Middleware para validar webhooks de ePayco
 * Verifica que el webhook tenga los campos mínimos requeridos
 */
function validateWebhook(req, res, next) {
  const webhookData = req.body;

  // Log del webhook recibido
  logger.info('[Webhook] Recibiendo webhook:', {
    ref_payco: webhookData.x_ref_payco,
    transaction_id: webhookData.x_transaction_id,
    response: webhookData.x_response
  });

  // Validar campos requeridos
  if (!webhookData.x_ref_payco || !webhookData.x_transaction_id) {
    logger.warn('[Webhook] Webhook inválido: faltan campos requeridos');
    return res.status(400).json({
      success: false,
      error: 'Webhook inválido: faltan campos requeridos (x_ref_payco, x_transaction_id)'
    });
  }

  // TODO: Validar firma de ePayco (si es necesario)
  // const signature = webhookData.x_signature;
  // if (!verifySignature(webhookData, signature)) {
  //   return res.status(401).json({ error: 'Firma inválida' });
  // }

  next();
}

module.exports = validateWebhook;
