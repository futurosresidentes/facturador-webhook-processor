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
 * Reintentar webhook usando checkpoints (no repite stages completados)
 * POST /api/webhooks/:id/retry
 * Body: {
 *   force_restart: false,
 *   skip_stages: [],
 *   max_retries: 3
 * }
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
 * Edita un webhook por ID
 * Permite actualizar cualquier campo del webhook
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
 * Query params:
 *   ?id=88 - Busca webhook específico con logs
 *   ?limit=10 - Limita cantidad (default: todos)
 *   ?status=pending - Filtra por status
 *   ?current_stage=worldoffice_dian - Filtra por stage
 *   ?incomplete=true - Solo incompletos
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
 * Obtiene logs estructurados de un webhook con resumen y timeline
 * GET /api/webhooks/:id/logs/structured
 */
async function getStructuredLogs(req, res) {
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

    // Calcular resumen
    const logs = webhook.logs || [];
    const startLog = logs.find(l => l.stage === 'started');
    const endLog = logs.find(l => l.stage === 'completed');

    const totalDuration = startLog && endLog
      ? new Date(endLog.created_at) - new Date(startLog.created_at)
      : null;

    const statusCounts = {
      success: logs.filter(l => l.status === 'success').length,
      error: logs.filter(l => l.status === 'error').length,
      warning: logs.filter(l => l.status === 'warning').length,
      processing: logs.filter(l => l.status === 'processing').length
    };

    // Agrupar logs por stage (timeline)
    const stageMap = new Map();
    logs.forEach(log => {
      if (!stageMap.has(log.stage)) {
        stageMap.set(log.stage, []);
      }
      stageMap.get(log.stage).push(log);
    });

    // Crear timeline con duración de cada stage
    const timeline = [];
    const uniqueStages = ['started', 'invoice_extraction', 'fr360_query', 'callbell_notification',
                          'membership_creation', 'crm_management', 'worldoffice_customer',
                          'worldoffice_invoice_creation', 'worldoffice_invoice_accounting',
                          'worldoffice_dian_emission', 'strapi_facturacion_creation', 'completed'];

    uniqueStages.forEach(stage => {
      const stageLogs = stageMap.get(stage) || [];
      if (stageLogs.length > 0) {
        const firstLog = stageLogs[0];
        const lastLog = stageLogs[stageLogs.length - 1];
        const duration = new Date(lastLog.created_at) - new Date(firstLog.created_at);

        timeline.push({
          stage,
          status: lastLog.status,
          duration_ms: duration,
          timestamp: firstLog.created_at,
          details: lastLog.details,
          has_error: stageLogs.some(l => l.status === 'error')
        });
      }
    });

    // Respuesta estructurada
    res.json({
      success: true,
      webhook: {
        id: webhook.id,
        ref_payco: webhook.ref_payco,
        status: webhook.status,
        product: webhook.product,
        amount: webhook.amount,
        customer_email: webhook.customer_email
      },
      summary: {
        total_logs: logs.length,
        total_steps: timeline.length,
        duration_ms: totalDuration,
        duration_seconds: totalDuration ? (totalDuration / 1000).toFixed(2) : null,
        status_breakdown: statusCounts,
        completed: webhook.status === 'completed',
        has_errors: statusCounts.error > 0
      },
      timeline,
      raw_logs: req.query.include_raw === 'true' ? logs : undefined
    });

  } catch (error) {
    logger.error('[Controller] Error obteniendo logs estructurados:', error);
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
  retryWebhook,
  cleanDuplicateLogs,
  deleteAllLogs,
  keepOnlyLastSuccessful,
  editWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  getWebhookLogs,
  getStructuredLogs,
  getWebhookStats,
  getIncompleteWebhooks,
  getWebhooksByStage,
  updateWebhookStatus,
  getRecentWebhooks
};
