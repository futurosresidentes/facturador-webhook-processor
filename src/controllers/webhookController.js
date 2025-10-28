const { Webhook, WebhookLog } = require('../models');
const { Op } = require('sequelize');
const webhookProcessor = require('../services/webhookProcessor');
const logger = require('../config/logger');
const { normalizeProductName } = require('../utils/productFilter');

/**
 * Recibe un webhook de ePayco
 */
async function receiveWebhook(req, res) {
  try {
    const webhookData = req.body;

    logger.info(`[Controller] Recibiendo webhook: ${webhookData.x_ref_payco}`);

    // Normalizar ciudad y dirección ("N/A" -> null)
    const normalizeValue = (value) => {
      if (!value || value === 'N/A' || value.trim() === '') {
        return null;
      }
      return value.trim();
    };

    // 1. Guardar webhook en BD
    const webhook = await Webhook.create({
      ref_payco: webhookData.x_ref_payco,
      transaction_id: webhookData.x_transaction_id,
      invoice_id: webhookData.x_id_invoice,
      customer_email: webhookData.x_customer_email,
      customer_name: `${webhookData.x_customer_name || ''} ${webhookData.x_customer_lastname || ''}`.trim(),
      customer_city: normalizeValue(webhookData.x_customer_city),
      customer_address: normalizeValue(webhookData.x_customer_address),
      product: normalizeProductName(webhookData.x_description),  // Normalizar producto
      amount: webhookData.x_amount,
      currency: webhookData.x_currency_code,
      response: webhookData.x_response,
      status: 'pending',
      raw_data: webhookData
    });

    logger.info(`[Controller] Webhook guardado con ID: ${webhook.id}`);

    // 2. Procesar solo si la respuesta es "Aceptada"
    if (webhookData.x_response === 'Aceptada') {
      // Verificar que no esté ya en procesamiento
      const existingProcessing = await Webhook.findOne({
        where: {
          ref_payco: webhook.ref_payco,
          status: 'processing'
        }
      });

      if (existingProcessing && existingProcessing.id !== webhook.id) {
        logger.warn(`[Controller] Webhook ${webhook.ref_payco} ya está siendo procesado (ID: ${existingProcessing.id})`);
        await webhook.update({ status: 'duplicate' });
        return res.status(200).json({
          success: true,
          message: 'Webhook duplicado - ya está en procesamiento',
          ref: webhook.ref_payco,
          id: webhook.id,
          original_id: existingProcessing.id
        });
      }

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
async function retryWebhook(req, res) {
  try {
    const { id } = req.params;
    const {
      force_restart = false,
      start_from_stage = null,
      skip_stages = [],
      max_retries = 3
    } = req.body;

    logger.info(`[Controller] Solicitando retry de webhook ${id} (force_restart: ${force_restart})`);

    const webhook = await Webhook.findByPk(id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Validar retriabilidad antes de procesar
    if (!webhook.is_retriable && !force_restart) {
      return res.status(400).json({
        success: false,
        error: `Webhook ${id} tiene un error fatal y no puede ser reprocesado automáticamente`,
        failed_stage: webhook.failed_stage,
        error_details: webhook.processing_context?.[webhook.failed_stage]?.error,
        suggestion: 'Usa force_restart=true para intentar desde cero o corrige el error manualmente'
      });
    }

    // Procesar en background
    webhookProcessor.retryWebhook(id, {
      force_restart,
      start_from_stage,
      skip_stages,
      max_retries
    })
    .then(() => {
      logger.info(`[Controller] Retry exitoso para webhook ${id}`);
    })
    .catch(err => {
      logger.error(`[Controller] Error en retry de webhook ${id}:`, err);
    });

    res.json({
      success: true,
      message: 'Webhook en cola para reprocesamiento inteligente',
      webhook_id: parseInt(id),
      retry_config: {
        force_restart,
        start_from_stage: start_from_stage || webhook.failed_stage,
        skip_stages,
        max_retries,
        current_retry_count: webhook.retry_count,
        completed_stages: webhook.completed_stages || [],
        failed_stage: webhook.failed_stage
      }
    });

  } catch (error) {
    logger.error('[Controller] Error en retry de webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Limpia logs duplicados de un webhook completado
 * Mantiene solo los logs del último procesamiento exitoso
 */
async function editWebhook(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    logger.info(`[Controller] Editando webhook ${id}`);

    // Buscar webhook
    const webhook = await Webhook.findByPk(id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Campos editables
    const allowedFields = [
      'ref_payco',
      'transaction_id',
      'invoice_id',
      'customer_email',
      'customer_name',
      'customer_city',
      'customer_address',
      'product',
      'amount',
      'currency',
      'response',
      'status',
      'current_stage',
      'last_completed_stage'
    ];

    // Filtrar solo campos permitidos
    const fieldsToUpdate = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fieldsToUpdate[field] = updates[field];
      }
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron campos válidos para actualizar',
        allowed_fields: allowedFields
      });
    }

    // Aplicar normalización de producto si se está actualizando
    if (fieldsToUpdate.product) {
      fieldsToUpdate.product = normalizeProductName(fieldsToUpdate.product);
    }

    // Actualizar webhook
    await webhook.update(fieldsToUpdate);

    logger.info(`[Controller] Webhook ${id} actualizado. Campos: ${Object.keys(fieldsToUpdate).join(', ')}`);

    // Obtener webhook actualizado con logs
    const updatedWebhook = await Webhook.findByPk(id, {
      include: [{
        model: WebhookLog,
        as: 'logs',
        attributes: ['id', 'stage', 'status', 'details', 'created_at']
      }]
    });

    res.json({
      success: true,
      message: 'Webhook actualizado exitosamente',
      updated_fields: Object.keys(fieldsToUpdate),
      webhook: updatedWebhook
    });

  } catch (error) {
    logger.error('[Controller] Error editando webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Elimina un webhook por ID
 * También elimina todos sus logs asociados (cascade)
 */
async function deleteWebhook(req, res) {
  try {
    const { id } = req.params;

    logger.info(`[Controller] Intentando eliminar webhook ${id}`);

    // Buscar webhook con sus logs
    const webhook = await Webhook.findByPk(id, {
      include: [{
        model: WebhookLog,
        as: 'logs'
      }]
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Guardar info antes de eliminar
    const webhookInfo = {
      id: webhook.id,
      ref_payco: webhook.ref_payco,
      product: webhook.product,
      customer_email: webhook.customer_email,
      status: webhook.status,
      logs_count: webhook.logs ? webhook.logs.length : 0
    };

    // Eliminar webhook (los logs se eliminan automáticamente por CASCADE)
    await webhook.destroy();

    logger.info(`[Controller] Webhook ${id} eliminado exitosamente (${webhookInfo.logs_count} logs eliminados)`);

    res.json({
      success: true,
      message: 'Webhook eliminado exitosamente',
      deleted_webhook: webhookInfo
    });

  } catch (error) {
    logger.error('[Controller] Error eliminando webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtiene un webhook por ID
 */
async function listWebhooks(req, res) {
  try {
    const {
      id,
      status,
      current_stage,
      last_completed_stage,
      incomplete,
      limit,
      offset = 0,
      order = 'created_at',
      dir = 'DESC'
    } = req.query;

    // Si se proporciona ID, buscar ese webhook específico con logs
    if (id) {
      const webhook = await Webhook.findByPk(parseInt(id), {
        include: [{
          model: WebhookLog,
          as: 'logs',
          attributes: ['id', 'stage', 'status', 'details', 'request_payload', 'response_data', 'error_message', 'created_at'],
          required: false
        }],
        order: [
          [{ model: WebhookLog, as: 'logs' }, 'created_at', 'ASC']
        ]
      });

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: `Webhook con ID ${id} no encontrado`
        });
      }

      // Formatear con logs agrupados
      const webhookData = webhook.toJSON();
      const logs = webhookData.logs || [];

      const logsByStatus = {
        success: [],
        error: [],
        info: []
      };

      logs.forEach(log => {
        if (logsByStatus[log.status]) {
          logsByStatus[log.status].push({
            stage: log.stage,
            details: log.details,
            request_payload: log.request_payload,
            response_data: log.response_data,
            error_message: log.error_message,
            timestamp: log.created_at
          });
        }
      });

      return res.json({
        success: true,
        webhook: {
          ...webhookData,
          logs: {
            total: logs.length,
            by_status: logsByStatus,
            all: logs
          }
        }
      });
    }

    // Búsqueda general con filtros
    const where = {};

    if (status) {
      where.status = status;
    }

    if (current_stage) {
      where.current_stage = current_stage;
    }

    if (last_completed_stage) {
      where.last_completed_stage = last_completed_stage;
    }

    if (incomplete === 'true') {
      where.status = {
        [Op.ne]: 'completed'
      };
    }

    // Query options
    const queryOptions = {
      where,
      include: [{
        model: WebhookLog,
        as: 'logs',
        attributes: ['id', 'stage', 'status', 'details', 'created_at'],
        required: false
      }],
      order: [
        [order, dir],
        [{ model: WebhookLog, as: 'logs' }, 'created_at', 'ASC']
      ],
      offset: parseInt(offset)
    };

    // Solo agregar limit si se especifica
    if (limit) {
      queryOptions.limit = parseInt(limit);
    }

    const webhooks = await Webhook.findAndCountAll(queryOptions);

    // Formatear webhooks con logs agrupados
    const formattedWebhooks = webhooks.rows.map(webhook => {
      const webhookData = webhook.toJSON();
      const logs = webhookData.logs || [];

      const logsByStatus = {
        success: [],
        error: [],
        info: []
      };

      logs.forEach(log => {
        if (logsByStatus[log.status]) {
          logsByStatus[log.status].push({
            stage: log.stage,
            details: log.details,
            timestamp: log.created_at
          });
        }
      });

      return {
        id: webhookData.id,
        ref_payco: webhookData.ref_payco,
        transaction_id: webhookData.transaction_id,
        invoice_id: webhookData.invoice_id,
        customer: {
          email: webhookData.customer_email,
          name: webhookData.customer_name
        },
        product: webhookData.product,
        amount: webhookData.amount,
        currency: webhookData.currency,
        response: webhookData.response,
        status: webhookData.status,
        current_stage: webhookData.current_stage,
        last_completed_stage: webhookData.last_completed_stage,
        created_at: webhookData.created_at,
        updated_at: webhookData.updated_at,
        logs: {
          total: logs.length,
          by_status: logsByStatus,
          all: logs
        }
      };
    });

    res.json({
      success: true,
      total: webhooks.count,
      count: formattedWebhooks.length,
      webhooks: formattedWebhooks
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
  retryWebhook,
  editWebhook,
  deleteWebhook,
  listWebhooks
};
