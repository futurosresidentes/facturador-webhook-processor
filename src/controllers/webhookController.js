const { Webhook, WebhookLog } = require('../models');
const { Op } = require('sequelize');
const webhookProcessor = require('../services/webhookProcessor');
const logger = require('../config/logger');

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

    // ELIMINAR TODOS LOS LOGS ANTERIORES para evitar duplicados
    const deletedCount = await WebhookLog.destroy({
      where: { webhook_id: id }
    });

    logger.info(`[Controller] Eliminados ${deletedCount} logs anteriores del webhook ${id}`);

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
      webhook_id: webhook.id,
      previous_logs_deleted: deletedCount
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
 * Limpia logs duplicados de un webhook completado
 * Mantiene solo los logs del último procesamiento exitoso
 */
async function cleanDuplicateLogs(req, res) {
  try {
    const { id } = req.params;

    logger.info(`[Controller] Limpiando logs duplicados del webhook ${id}`);

    const webhook = await Webhook.findByPk(id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Solo limpiar webhooks completados
    if (webhook.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden limpiar logs de webhooks completados'
      });
    }

    // Obtener todos los logs del webhook
    const allLogs = await WebhookLog.findAll({
      where: { webhook_id: id },
      order: [['created_at', 'DESC']]
    });

    if (allLogs.length === 0) {
      return res.json({
        success: true,
        message: 'No hay logs para limpiar',
        deleted: 0
      });
    }

    // Encontrar el último "started" (inicio del último procesamiento)
    const lastStartedIndex = allLogs.findIndex(log => log.stage === 'started');

    if (lastStartedIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'No se encontró inicio de procesamiento'
      });
    }

    // Los logs del último procesamiento son desde el inicio hasta el final
    const logsToKeep = allLogs.slice(0, lastStartedIndex + 1).map(log => log.id);

    // Borrar todos los logs EXCEPTO los del último procesamiento
    const deletedCount = await WebhookLog.destroy({
      where: {
        webhook_id: id,
        id: { [Op.notIn]: logsToKeep }
      }
    });

    logger.info(`[Controller] Eliminados ${deletedCount} logs duplicados del webhook ${id}. Mantenidos: ${logsToKeep.length}`);

    res.json({
      success: true,
      message: `Logs duplicados eliminados exitosamente`,
      deleted: deletedCount,
      kept: logsToKeep.length
    });

  } catch (error) {
    logger.error('[Controller] Error limpiando logs duplicados:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Borra TODOS los logs de la base de datos (inicio fresco)
 * ADVERTENCIA: Esta operación NO se puede deshacer
 * Mantiene los registros de webhooks pero borra todos sus logs
 */
async function deleteAllLogs(req, res) {
  try {
    logger.warn(`[Controller] ⚠️ SOLICITANDO BORRADO DE TODOS LOS LOGS`);

    // Contar logs antes de borrar
    const totalLogs = await WebhookLog.count();

    if (totalLogs === 0) {
      return res.json({
        success: true,
        message: 'No hay logs para borrar',
        deleted: 0
      });
    }

    // Confirmar que realmente quiere borrar (requiere query param confirmation=yes)
    if (req.query.confirmation !== 'yes') {
      return res.status(400).json({
        success: false,
        error: 'Para borrar TODOS los logs, debe incluir ?confirmation=yes',
        warning: `Hay ${totalLogs} logs que serán borrados permanentemente`,
        tip: 'Ejemplo: DELETE /api/webhooks/logs/all?confirmation=yes'
      });
    }

    // BORRAR TODOS LOS LOGS
    const deletedCount = await WebhookLog.destroy({
      where: {},  // Sin condiciones = borrar todo
      truncate: false  // No truncar, solo borrar (mantiene secuencias)
    });

    logger.warn(`[Controller] 🗑️ BORRADOS ${deletedCount} logs de la base de datos`);

    res.json({
      success: true,
      message: `Todos los logs han sido borrados exitosamente`,
      deleted: deletedCount,
      note: 'Los registros de webhooks se mantienen intactos'
    });

  } catch (error) {
    logger.error('[Controller] Error borrando todos los logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Borra todos los webhooks EXCEPTO el último exitoso
 * Mantiene solo el webhook más reciente con status="completed"
 * ADVERTENCIA: Esta operación NO se puede deshacer
 */
async function keepOnlyLastSuccessful(req, res) {
  try {
    logger.warn(`[Controller] ⚠️ SOLICITANDO MANTENER SOLO ÚLTIMO WEBHOOK EXITOSO`);

    // Encontrar el último webhook exitoso
    const lastSuccessful = await Webhook.findOne({
      where: { status: 'completed' },
      order: [['created_at', 'DESC']]
    });

    if (!lastSuccessful) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró ningún webhook completado exitosamente'
      });
    }

    // Contar webhooks que serán borrados
    const totalWebhooks = await Webhook.count();
    const webhooksToDelete = totalWebhooks - 1;

    if (webhooksToDelete === 0) {
      return res.json({
        success: true,
        message: 'Solo hay 1 webhook en la base de datos',
        kept: {
          id: lastSuccessful.id,
          ref_payco: lastSuccessful.ref_payco,
          product: lastSuccessful.product,
          status: lastSuccessful.status
        }
      });
    }

    // Confirmar que realmente quiere borrar (requiere query param confirmation=yes)
    if (req.query.confirmation !== 'yes') {
      return res.status(400).json({
        success: false,
        error: 'Para borrar webhooks, debe incluir ?confirmation=yes',
        warning: `Se borrarán ${webhooksToDelete} webhooks`,
        kept_webhook: {
          id: lastSuccessful.id,
          ref_payco: lastSuccessful.ref_payco,
          invoice_id: lastSuccessful.invoice_id,
          product: lastSuccessful.product,
          amount: lastSuccessful.amount,
          status: lastSuccessful.status,
          created_at: lastSuccessful.created_at
        },
        tip: 'Ejemplo: DELETE /api/webhooks/keep-last?confirmation=yes'
      });
    }

    // BORRAR todos los webhooks EXCEPTO el último exitoso
    // Esto también borrará sus logs en cascada (si está configurado)
    const deletedWebhooks = await Webhook.destroy({
      where: {
        id: { [Op.ne]: lastSuccessful.id }  // ne = not equal
      }
    });

    // Borrar logs huérfanos (por si acaso no hay cascada)
    const deletedLogs = await WebhookLog.destroy({
      where: {
        webhook_id: { [Op.ne]: lastSuccessful.id }
      }
    });

    logger.warn(`[Controller] 🗑️ BORRADOS ${deletedWebhooks} webhooks y ${deletedLogs} logs. Mantenido webhook ${lastSuccessful.id}`);

    res.json({
      success: true,
      message: `Todos los webhooks borrados excepto el último exitoso`,
      deleted_webhooks: deletedWebhooks,
      deleted_logs: deletedLogs,
      kept_webhook: {
        id: lastSuccessful.id,
        ref_payco: lastSuccessful.ref_payco,
        invoice_id: lastSuccessful.invoice_id,
        product: lastSuccessful.product,
        amount: lastSuccessful.amount,
        status: lastSuccessful.status,
        created_at: lastSuccessful.created_at
      }
    });

  } catch (error) {
    logger.error('[Controller] Error manteniendo solo último webhook:', error);
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

/**
 * Actualiza manualmente el estado de un webhook
 */
async function updateWebhookStatus(req, res) {
  try {
    const { id } = req.params;
    const {
      status,
      current_stage,
      last_completed_stage
    } = req.body;

    const webhook = await Webhook.findByPk(id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook no encontrado'
      });
    }

    // Validar status si se proporciona
    const validStatuses = ['pending', 'processing', 'completed', 'error', 'not_processed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status inválido. Debe ser uno de: ${validStatuses.join(', ')}`
      });
    }

    // Construir objeto de actualización
    const updates = {
      updated_at: new Date()
    };

    if (status !== undefined) {
      updates.status = status;
    }

    if (current_stage !== undefined) {
      updates.current_stage = current_stage;
    }

    if (last_completed_stage !== undefined) {
      updates.last_completed_stage = last_completed_stage;
    }

    // Actualizar webhook
    await webhook.update(updates);

    // Registrar en logs
    await WebhookLog.create({
      webhook_id: id,
      stage: 'manual_update',
      status: 'success',
      details: `Actualización manual: ${JSON.stringify(updates)}`
    });

    logger.info(`[Controller] Webhook ${id} actualizado manualmente:`, updates);

    res.json({
      success: true,
      message: 'Webhook actualizado correctamente',
      webhook: {
        id: webhook.id,
        ref_payco: webhook.ref_payco,
        status: webhook.status,
        current_stage: webhook.current_stage,
        last_completed_stage: webhook.last_completed_stage,
        updated_at: webhook.updated_at
      }
    });

  } catch (error) {
    logger.error('[Controller] Error actualizando webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Lista los webhooks más recientes con sus logs
 * Query params: ?limit=10 (default: todos)
 * Requiere: Authorization: Bearer <token>
 */
async function getRecentWebhooks(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;

    // Query options
    const queryOptions = {
      include: [
        {
          model: WebhookLog,
          as: 'logs',
          attributes: ['id', 'stage', 'status', 'details', 'request_payload', 'response_data', 'error_message', 'created_at'],
          required: false // LEFT JOIN para incluir webhooks sin logs
        }
      ],
      order: [
        ['created_at', 'DESC'],
        [{ model: WebhookLog, as: 'logs' }, 'created_at', 'ASC']
      ],
      attributes: [
        'id',
        'ref_payco',
        'transaction_id',
        'invoice_id',
        'customer_email',
        'customer_name',
        'product',
        'amount',
        'currency',
        'response',
        'status',
        'current_stage',
        'last_completed_stage',
        'created_at',
        'updated_at'
      ]
    };

    // Si hay limit, agregarlo
    if (limit) {
      queryOptions.limit = limit;
    }

    logger.info(`[Controller] Buscando webhooks con limit: ${limit || 'all'}`);
    const webhooks = await Webhook.findAll(queryOptions);
    logger.info(`[Controller] Encontrados ${webhooks.length} webhooks`);

    // Formatear respuesta
    const formattedWebhooks = webhooks.map(webhook => {
      const webhookData = webhook.toJSON();

      // Asegurar que logs existe (puede ser undefined si no hay logs)
      const logs = webhookData.logs || [];

      // Agrupar logs por estado
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

      return {
        id: webhookData.id,
        ref_payco: webhookData.ref_payco,
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
          by_status: {
            success: logsByStatus.success,
            error: logsByStatus.error,
            info: logsByStatus.info
          },
          all: logs
        }
      };
    });

    res.json({
      success: true,
      count: formattedWebhooks.length,
      limit: limit || 'all',
      webhooks: formattedWebhooks
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo webhooks recientes:', error);
    logger.error('[Controller] Stack trace:', error.stack);
    logger.error('[Controller] Error message:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo webhooks',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  receiveWebhook,
  reprocessWebhook,
  cleanDuplicateLogs,
  deleteAllLogs,
  keepOnlyLastSuccessful,
  getWebhook,
  listWebhooks,
  getWebhookLogs,
  getWebhookStats,
  getIncompleteWebhooks,
  getWebhooksByStage,
  updateWebhookStatus,
  getRecentWebhooks
};
