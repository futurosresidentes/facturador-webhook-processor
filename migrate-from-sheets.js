/**
 * Script para migrar webhooks de Google Sheets a PostgreSQL
 *
 * Este script:
 * 1. Lee los webhooks del Google Sheets actual
 * 2. Los inserta en PostgreSQL
 * 3. Mantiene compatibilidad con los datos existentes
 *
 * IMPORTANTE: Ejecutar DESPUÉS de configurar DATABASE_URL en .env
 */

require('dotenv').config();
const { Webhook } = require('./src/models');
const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');

// ============================================
// CONFIGURACIÓN DE GOOGLE SHEETS
// ============================================

// Datos de ejemplo de tu Google Sheet
// Reemplazar con datos reales obtenidos del Apps Script
const webhooksFromSheets = [
  {
    fecha_registro: '19/10/2025 19:51',
    x_cust_id_cliente: '554149',
    x_ref_payco: '314525019',
    x_id_factura: '554149685168e-1729364726170',
    x_id_invoice: '554149685168e-1729364726170',
    x_description: 'Élite - 12 meses - Cuota 1',
    x_amount: '424265',
    x_amount_country: '424265',
    x_amount_ok: '424265',
    x_tax: '0',
    x_amount_base: '424265',
    x_currency_code: 'COP',
    x_bank_name: 'NA',
    x_cardnumber: '******',
    x_quotas: '0',
    x_respuesta: 'Aceptada',
    x_response: 'Aceptada',
    x_approval_code: '',
    x_transaction_id: '',
    x_customer_email: 'test@example.com',
    x_customer_name: 'Cliente',
    x_customer_lastname: 'Prueba',
    estado_procesamiento: 'Pendiente'
  }
  // ... más webhooks aquí
];

/**
 * Convierte fecha de formato DD/MM/YYYY HH:mm a Date
 */
function parseFechaRegistro(fechaStr) {
  if (!fechaStr) return new Date();

  try {
    // Formato: "19/10/2025 19:51"
    const [fecha, hora] = fechaStr.split(' ');
    const [dia, mes, anio] = fecha.split('/');
    const [horas, minutos] = (hora || '00:00').split(':');

    return new Date(anio, mes - 1, dia, horas, minutos);
  } catch (error) {
    logger.warn(`Error parseando fecha: ${fechaStr}`, error);
    return new Date();
  }
}

/**
 * Mapea un registro de Sheets a formato de PostgreSQL
 */
function mapSheetToWebhook(sheetRow) {
  return {
    ref_payco: sheetRow.x_ref_payco,
    transaction_id: sheetRow.x_transaction_id || '',
    invoice_id: sheetRow.x_id_invoice,
    customer_email: sheetRow.x_customer_email,
    customer_name: `${sheetRow.x_customer_name || ''} ${sheetRow.x_customer_lastname || ''}`.trim(),
    product: sheetRow.x_description,
    amount: parseFloat(sheetRow.x_amount) || 0,
    currency: sheetRow.x_currency_code,
    response: sheetRow.x_response,
    status: mapEstadoToStatus(sheetRow.estado_procesamiento),
    raw_data: sheetRow, // Guardar todos los datos originales
    created_at: parseFechaRegistro(sheetRow.fecha_registro),
    updated_at: new Date()
  };
}

/**
 * Mapea estado de Sheets a status de PostgreSQL
 */
function mapEstadoToStatus(estado) {
  const estadoLower = (estado || '').toLowerCase();

  if (estadoLower.includes('completado')) return 'completed';
  if (estadoLower.includes('procesando')) return 'processing';
  if (estadoLower.includes('error')) return 'error';
  if (estadoLower.includes('pendiente')) return 'pending';

  return 'pending';
}

/**
 * Migra webhooks de Sheets a PostgreSQL
 */
async function migrateWebhooks() {
  try {
    logger.info('\n====================================');
    logger.info('MIGRACIÓN DE GOOGLE SHEETS A POSTGRESQL');
    logger.info('====================================\n');

    // 1. Verificar conexión a BD
    logger.info('Verificando conexión a base de datos...');
    await sequelize.authenticate();
    logger.info('✅ Conexión exitosa\n');

    // 2. Sincronizar modelos (crear tablas si no existen)
    logger.info('Sincronizando modelos...');
    await sequelize.sync();
    logger.info('✅ Modelos sincronizados\n');

    // 3. Contar webhooks existentes
    const existingCount = await Webhook.count();
    logger.info(`Webhooks existentes en PostgreSQL: ${existingCount}`);
    logger.info(`Webhooks a migrar desde Sheets: ${webhooksFromSheets.length}\n`);

    // 4. Migrar cada webhook
    let insertados = 0;
    let actualizados = 0;
    let errores = 0;

    for (const sheetRow of webhooksFromSheets) {
      try {
        const webhookData = mapSheetToWebhook(sheetRow);

        // Buscar si ya existe (por ref_payco)
        const existing = await Webhook.findOne({
          where: { ref_payco: webhookData.ref_payco }
        });

        if (existing) {
          // Actualizar
          await existing.update(webhookData);
          actualizados++;
          logger.info(`⟳ Actualizado: ${webhookData.ref_payco}`);
        } else {
          // Insertar nuevo
          await Webhook.create(webhookData);
          insertados++;
          logger.info(`✓ Insertado: ${webhookData.ref_payco}`);
        }

      } catch (error) {
        errores++;
        logger.error(`✗ Error con webhook ${sheetRow.x_ref_payco}:`, error.message);
      }
    }

    // 5. Resumen
    logger.info('\n====================================');
    logger.info('RESUMEN DE MIGRACIÓN');
    logger.info('====================================');
    logger.info(`Total procesados: ${webhooksFromSheets.length}`);
    logger.info(`Insertados: ${insertados}`);
    logger.info(`Actualizados: ${actualizados}`);
    logger.info(`Errores: ${errores}`);
    logger.info('====================================\n');

    if (errores === 0) {
      logger.info('✅ Migración completada exitosamente!');
    } else {
      logger.warn('⚠️ Migración completada con algunos errores');
    }

  } catch (error) {
    logger.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// ============================================
// FUNCIÓN PARA OBTENER DATOS DE SHEETS
// ============================================

/**
 * Esta función debe ejecutarse en Google Apps Script
 * para exportar los datos del Sheets
 */
function generateExportFromSheets() {
  const comment = `
/**
 * EJECUTAR ESTA FUNCIÓN EN GOOGLE APPS SCRIPT
 * para exportar webhooks del Sheets
 */
function exportWebhooksToJSON() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Webhooks_Recibidos');

  if (!sheet) {
    Logger.log('❌ Hoja no encontrada');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('❌ No hay datos');
    return;
  }

  // Obtener encabezados
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Obtener datos
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Convertir a objetos
  const webhooks = data.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  // Mostrar JSON
  Logger.log('====================================');
  Logger.log('COPIAR ESTE JSON A migrate-from-sheets.js');
  Logger.log('====================================');
  Logger.log(JSON.stringify(webhooks, null, 2));
}
  `;

  console.log(comment);
}

// ============================================
// EJECUTAR SI SE LLAMA DIRECTAMENTE
// ============================================

if (require.main === module) {
  logger.info('Iniciando migración...\n');
  logger.info('PASO 1: Exportar datos desde Google Sheets');
  logger.info('========================================');
  logger.info('1. Abre tu Google Apps Script');
  logger.info('2. Copia y pega esta función en el editor:\n');

  generateExportFromSheets();

  logger.info('\n3. Ejecuta la función exportWebhooksToJSON()');
  logger.info('4. Copia el JSON del log');
  logger.info('5. Pégalo en la variable webhooksFromSheets de este archivo');
  logger.info('6. Vuelve a ejecutar: node migrate-from-sheets.js\n');

  // Si ya hay datos en webhooksFromSheets, ejecutar migración
  if (webhooksFromSheets.length > 1 ||
      (webhooksFromSheets.length === 1 && webhooksFromSheets[0].x_ref_payco !== '314525019')) {
    logger.info('Datos encontrados. Iniciando migración...\n');
    migrateWebhooks()
      .then(() => {
        logger.info('Proceso completado');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Error fatal:', error);
        process.exit(1);
      });
  } else {
    logger.info('⚠️ No hay datos reales para migrar. Primero exporta desde Sheets.');
  }
}

module.exports = { migrateWebhooks, mapSheetToWebhook };
  `;
