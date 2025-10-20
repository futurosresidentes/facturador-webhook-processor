const { Webhook } = require('../models');
const webhookProcessor = require('../services/webhookProcessor');
const logger = require('../config/logger');

/**
 * Recibe un webhook de ePayco
 */
async function receiveWebhook(req, res) {
  try {
    const webhookData = req.body;

    logger.info(`[Controller] Recibiendo webhook: ${webhookData.x_ref_payco}`);

    // 1. Guardar webhook en BD
    const webhook = await Webhook.create({
      ref_payco: webhookData.x_ref_payco,
      transaction_id: webhookData.x_transaction_id,
      invoice_id: webhookData.x_id_invoice,
      customer_email: webhookData.x_customer_email,
      customer_name: `${webhookData.x_customer_name || ''} ${webhookData.x_customer_lastname || ''}`.trim(),
      product: webhookData.x_description,
      amount: webhookData.x_amount,
      currency: webhookData.x_currency_code,
      response: webhookData.x_response,
      status: 'pending',
      raw_data: webhookData
    });

    logger.info(`[Controller] Webhook guardado con ID: ${webhook.id}`);

    // 2. Procesar solo si la respuesta es "Aceptada"
    if (webhookData.x_response === 'Aceptada') {
      // Procesar en background (no esperar respuesta)
      webhookProcessor.processWebhook(webhook.id)
        .catch(err => {
          logger.error(`[Controller] Error procesando webhook ${webhook.id} en background:`, err);
        });

      logger.info(`[Controller] Webhook ${webhook.id} encolado para procesamiento`);
    } else {
      logger.info(`[Controller] Webhook ${webhook.id} no procesado (x_response: ${webhookData.x_response})`);
      await webhook.update({ status: 'not_processed' });
    }

    // 3. Responder inmediatamente a ePayco
    res.status(200).json({
      success: true,
      message: 'Webhook recibido correctamente',
      ref: webhook.ref_payco,
      id: webhook.id
    });

  } catch (error) {
    logger.error('[Controller] Error recibiendo webhook:', error);

    // Si el error es por duplicado, responder OK igual
    if (error.name === 'SequelizeUniqueConstraintError') {
      logger.warn('[Controller] Webhook duplicado detectado');
      return res.status(200).json({
        success: true,
        message: 'Webhook ya fue recibido previamente'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Reprocesa un webhook existente
 */
async function reprocessWebhook(req, res) {
  try {
    const { id } = req.params;

    logger.info(`[Controller] Solicitando reprocesamiento de webhook ${id}`);

    const webhook = await Webhook.findByPk(id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Resetear estado
    await webhook.update({ status: 'pending', updated_at: new Date() });

    // Procesar
    webhookProcessor.processWebhook(webhook.id)
      .then(() => {
        logger.info(`[Controller] Reprocesamiento completado para webhook ${id}`);
      })
      .catch(err => {
        logger.error(`[Controller] Error en reprocesamiento de webhook ${id}:`, err);
      });

    res.json({
      success: true,
      message: 'Reprocesamiento iniciado',
      webhook_id: webhook.id
    });

  } catch (error) {
    logger.error('[Controller] Error reprocesando webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtiene un webhook por ID
 */
async function getWebhook(req, res) {
  try {
    const { id } = req.params;

    const webhook = await Webhook.findByPk(id, {
      include: [
        { association: 'logs', order: [['created_at', 'ASC']] },
        { association: 'memberships' }
      ]
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    res.json({
      success: true,
      webhook
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Lista webhooks con filtros
 */
async function listWebhooks(req, res) {
  try {
    const {
      status,
      limit = 50,
      offset = 0,
      order = 'created_at',
      dir = 'DESC'
    } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const webhooks = await Webhook.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[order, dir]]
    });

    res.json({
      success: true,
      total: webhooks.count,
      webhooks: webhooks.rows
    });

  } catch (error) {
    logger.error('[Controller] Error listando webhooks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  receiveWebhook,
  reprocessWebhook,
  getWebhook,
  listWebhooks
};
