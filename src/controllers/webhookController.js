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
      current_stage,
      last_completed_stage,
      incomplete,
      limit = 50,
      offset = 0,
      order = 'created_at',
      dir = 'DESC'
    } = req.query;

    const where = {};

    // Filtro por status
    if (status) {
      where.status = status;
    }

    // Filtro por stage actual
    if (current_stage) {
      where.current_stage = current_stage;
    }

    // Filtro por último stage completado
    if (last_completed_stage) {
      where.last_completed_stage = last_completed_stage;
    }

    // Filtro de incompletos (cualquier status que NO sea 'completed')
    if (incomplete === 'true') {
      const { Op } = require('sequelize');
      where.status = {
        [Op.ne]: 'completed'
      };
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

/**
 * Obtiene los logs detallados de un webhook
 */
async function getWebhookLogs(req, res) {
  try {
    const { id } = req.params;

    const webhook = await Webhook.findByPk(id, {
      include: [
        {
          association: 'logs',
          order: [['created_at', 'ASC']]
        }
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
      webhook_id: webhook.id,
      ref_payco: webhook.ref_payco,
      status: webhook.status,
      logs: webhook.logs
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo logs de webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtiene estadísticas de webhooks
 */
async function getWebhookStats(_req, res) {
  try {
    const { Sequelize, Op } = require('sequelize');

    // Contar webhooks por estado
    const statsByStatus = await Webhook.findAll({
      attributes: [
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    // Contar webhooks por stage actual (solo incompletos)
    const statsByStage = await Webhook.findAll({
      attributes: [
        'current_stage',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: {
        status: { [Op.ne]: 'completed' },
        current_stage: { [Op.ne]: null }
      },
      group: ['current_stage']
    });

    // Obtener últimos webhooks
    const recent = await Webhook.findAll({
      limit: 10,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'ref_payco', 'status', 'invoice_id', 'current_stage', 'last_completed_stage', 'created_at']
    });

    // Contar webhooks incompletos
    const incompleteCount = await Webhook.count({
      where: {
        status: { [Op.ne]: 'completed' }
      }
    });

    res.json({
      success: true,
      stats: {
        byStatus: statsByStatus.reduce((acc, item) => {
          acc[item.status] = parseInt(item.dataValues.count);
          return acc;
        }, {}),
        byStage: statsByStage.reduce((acc, item) => {
          acc[item.current_stage] = parseInt(item.dataValues.count);
          return acc;
        }, {}),
        incomplete: incompleteCount
      },
      recent
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtiene webhooks incompletos (no completados al 100%)
 */
async function getIncompleteWebhooks(req, res) {
  try {
    const { Op } = require('sequelize');
    const {
      limit = 50,
      offset = 0,
      order = 'created_at',
      dir = 'DESC'
    } = req.query;

    const webhooks = await Webhook.findAndCountAll({
      where: {
        status: {
          [Op.ne]: 'completed'
        }
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[order, dir]],
      attributes: [
        'id',
        'ref_payco',
        'invoice_id',
        'customer_email',
        'status',
        'current_stage',
        'last_completed_stage',
        'created_at',
        'updated_at'
      ]
    });

    res.json({
      success: true,
      message: 'Webhooks que no están 100% completados',
      total: webhooks.count,
      webhooks: webhooks.rows
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo webhooks incompletos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtiene webhooks atascados en un stage específico
 */
async function getWebhooksByStage(req, res) {
  try {
    const { stage } = req.params;
    const {
      limit = 50,
      offset = 0
    } = req.query;

    const webhooks = await Webhook.findAndCountAll({
      where: {
        current_stage: stage
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: [
        'id',
        'ref_payco',
        'invoice_id',
        'customer_email',
        'status',
        'current_stage',
        'last_completed_stage',
        'created_at',
        'updated_at'
      ]
    });

    res.json({
      success: true,
      stage,
      total: webhooks.count,
      webhooks: webhooks.rows
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo webhooks por stage:', error);
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
  listWebhooks,
  getWebhookLogs,
  getWebhookStats,
  getIncompleteWebhooks,
  getWebhooksByStage
};
