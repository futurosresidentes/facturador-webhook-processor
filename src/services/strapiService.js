/**
 * Strapi Service
 * Maneja el guardado de ventas en Strapi Facturación
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// Configuración de axios para Strapi
const strapiClient = axios.create({
  baseURL: config.strapi?.apiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.strapi?.apiToken}`
  }
});

/**
 * PASO 10: Guardar venta en Strapi Facturación
 * @param {Object} saleData - Datos de la venta
 * @param {string} saleData.invoiceId - ID de la factura en World Office
 * @param {string} saleData.invoiceNumber - Número de factura
 * @param {string} saleData.cufe - CUFE de la factura electrónica
 * @param {string} saleData.customerId - ID del cliente
 * @param {string} saleData.customerDocument - Cédula del cliente
 * @param {string} saleData.customerName - Nombre del cliente
 * @param {string} saleData.customerEmail - Email del cliente
 * @param {Array} saleData.items - Items de la factura
 * @param {number} saleData.total - Total de la venta
 * @param {string} saleData.pdfUrl - URL del PDF
 * @param {string} saleData.xmlUrl - URL del XML
 * @param {string} saleData.webhookId - ID del webhook
 * @returns {Promise<Object>} strapiSaleId
 */
async function saveSale(saleData) {
  try {
    logger.info(`[Strapi] Guardando venta en Strapi: ${saleData.invoiceNumber}`);

    // TODO: Implementar guardado en Strapi
    // const response = await strapiClient.post('/api/sales', {
    //   data: {
    //     invoiceId: saleData.invoiceId,
    //     invoiceNumber: saleData.invoiceNumber,
    //     cufe: saleData.cufe,
    //     customer: {
    //       id: saleData.customerId,
    //       document: saleData.customerDocument,
    //       name: saleData.customerName,
    //       email: saleData.customerEmail
    //     },
    //     items: saleData.items,
    //     total: saleData.total,
    //     pdfUrl: saleData.pdfUrl,
    //     xmlUrl: saleData.xmlUrl,
    //     webhookId: saleData.webhookId,
    //     saleDate: new Date().toISOString(),
    //     status: 'completed'
    //   }
    // });

    // MOCK - Remover cuando implementes la API real
    logger.warn('[Strapi] MODO MOCK - Venta simulada en Strapi');
    return {
      strapiSaleId: 'STRAPI_SALE_' + Date.now(),
      invoiceNumber: saleData.invoiceNumber,
      cufe: saleData.cufe,
      saved: true,
      savedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[Strapi] Error en saveSale:', error);
    throw new Error(`Error guardando venta en Strapi: ${error.message}`);
  }
}

/**
 * Obtener una venta por CUFE
 * @param {string} cufe - CUFE de la factura
 * @returns {Promise<Object>} Datos de la venta
 */
async function getSaleByCufe(cufe) {
  try {
    logger.info(`[Strapi] Buscando venta por CUFE: ${cufe}`);

    // TODO: Implementar búsqueda por CUFE
    // const response = await strapiClient.get('/api/sales', {
    //   params: {
    //     filters: {
    //       cufe: {
    //         $eq: cufe
    //       }
    //     }
    //   }
    // });

    // MOCK
    return null;

  } catch (error) {
    logger.error('[Strapi] Error en getSaleByCufe:', error);
    throw new Error(`Error buscando venta en Strapi: ${error.message}`);
  }
}

module.exports = {
  saveSale,
  getSaleByCufe
};
