/**
 * World Office Service
 * Maneja todas las operaciones con el facturador World Office:
 * - Gestión de clientes
 * - Creación de facturas
 * - Contabilización
 * - Emisión electrónica ante la DIAN
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

// Configuración de axios para World Office
const woClient = axios.create({
  baseURL: config.worldOffice?.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.worldOffice?.apiToken}`
  }
});

/**
 * PASO 6: Buscar o actualizar cliente en World Office
 * @param {Object} customerData - Datos del cliente
 * @param {string} customerData.identityDocument - Cédula del cliente
 * @param {string} customerData.givenName - Nombre
 * @param {string} customerData.familyName - Apellido
 * @param {string} customerData.email - Email
 * @param {string} customerData.phone - Teléfono
 * @returns {Promise<Object>} customerId y customerData
 */
async function findOrUpdateCustomer(customerData) {
  try {
    logger.info(`[WorldOffice] Buscando cliente con cédula: ${customerData.identityDocument}`);

    // TODO: Implementar búsqueda de cliente
    // const searchResponse = await woClient.get(`/customers/search`, {
    //   params: { document: customerData.identityDocument }
    // });

    // TODO: Si existe, comparar datos y actualizar si es necesario
    // if (searchResponse.data.exists) {
    //   const existingCustomer = searchResponse.data.customer;
    //   const needsUpdate = compareCustomerData(existingCustomer, customerData);
    //
    //   if (needsUpdate) {
    //     logger.info(`[WorldOffice] Actualizando cliente ${existingCustomer.id}`);
    //     await woClient.put(`/customers/${existingCustomer.id}`, customerData);
    //   }
    //
    //   return {
    //     customerId: existingCustomer.id,
    //     customerData: existingCustomer,
    //     action: needsUpdate ? 'updated' : 'found'
    //   };
    // }

    // TODO: Si no existe, crear cliente nuevo
    // logger.info(`[WorldOffice] Creando nuevo cliente`);
    // const createResponse = await woClient.post('/customers', customerData);

    // MOCK - Remover cuando implementes la API real
    logger.warn('[WorldOffice] MODO MOCK - Cliente simulado');
    return {
      customerId: 'MOCK_CUSTOMER_' + Date.now(),
      customerData: {
        id: 'MOCK_CUSTOMER_' + Date.now(),
        document: customerData.identityDocument,
        name: `${customerData.givenName} ${customerData.familyName}`,
        email: customerData.email,
        phone: customerData.phone
      },
      action: 'created_mock'
    };

  } catch (error) {
    logger.error('[WorldOffice] Error en findOrUpdateCustomer:', error);
    throw new Error(`Error gestionando cliente en World Office: ${error.message}`);
  }
}

/**
 * PASO 7: Crear factura de venta en World Office
 * @param {Object} invoiceData - Datos de la factura
 * @param {string} invoiceData.customerId - ID del cliente
 * @param {Array} invoiceData.items - Productos/servicios
 * @param {number} invoiceData.total - Total de la factura
 * @returns {Promise<Object>} invoiceNumber e invoiceId
 */
async function createInvoice(invoiceData) {
  try {
    logger.info(`[WorldOffice] Creando factura para cliente: ${invoiceData.customerId}`);

    // TODO: Implementar creación de factura
    // const response = await woClient.post('/invoices', {
    //   customerId: invoiceData.customerId,
    //   items: invoiceData.items,
    //   total: invoiceData.total,
    //   date: new Date().toISOString()
    // });

    // MOCK - Remover cuando implementes la API real
    logger.warn('[WorldOffice] MODO MOCK - Factura simulada');
    return {
      invoiceId: 'INV_MOCK_' + Date.now(),
      invoiceNumber: 'FV-' + String(Date.now()).slice(-6),
      customerId: invoiceData.customerId,
      total: invoiceData.total,
      status: 'created'
    };

  } catch (error) {
    logger.error('[WorldOffice] Error en createInvoice:', error);
    throw new Error(`Error creando factura en World Office: ${error.message}`);
  }
}

/**
 * PASO 8: Contabilizar factura
 * @param {string} invoiceId - ID de la factura
 * @returns {Promise<Object>} accountingStatus
 */
async function accountInvoice(invoiceId) {
  try {
    logger.info(`[WorldOffice] Contabilizando factura: ${invoiceId}`);

    // TODO: Implementar contabilización
    // const response = await woClient.post(`/invoices/${invoiceId}/account`, {
    //   accountDate: new Date().toISOString()
    // });

    // MOCK - Remover cuando implementes la API real
    logger.warn('[WorldOffice] MODO MOCK - Contabilización simulada');
    return {
      invoiceId,
      accountingStatus: 'accounted',
      accountingDate: new Date().toISOString(),
      accountingNumber: 'CONT-' + String(Date.now()).slice(-6)
    };

  } catch (error) {
    logger.error('[WorldOffice] Error en accountInvoice:', error);
    throw new Error(`Error contabilizando factura en World Office: ${error.message}`);
  }
}

/**
 * PASO 9: Emitir factura electrónica ante la DIAN
 * @param {string} invoiceId - ID de la factura
 * @returns {Promise<Object>} cufe, dianStatus, pdfUrl
 */
async function emitDianInvoice(invoiceId) {
  try {
    logger.info(`[WorldOffice] Emitiendo factura electrónica: ${invoiceId}`);

    // TODO: Implementar emisión ante la DIAN
    // const response = await woClient.post(`/invoices/${invoiceId}/emit-dian`, {
    //   emitDate: new Date().toISOString()
    // });

    // MOCK - Remover cuando implementes la API real
    logger.warn('[WorldOffice] MODO MOCK - Emisión DIAN simulada');
    return {
      invoiceId,
      cufe: 'CUFE' + Date.now() + 'ABCDEF1234567890',
      dianStatus: 'accepted',
      dianResponse: 'Documento aceptado por la DIAN',
      pdfUrl: `https://facturador.ejemplo.com/invoices/${invoiceId}/pdf`,
      xmlUrl: `https://facturador.ejemplo.com/invoices/${invoiceId}/xml`,
      emittedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error('[WorldOffice] Error en emitDianInvoice:', error);
    throw new Error(`Error emitiendo factura ante la DIAN: ${error.message}`);
  }
}

/**
 * Helper: Comparar datos del cliente para detectar cambios
 * @private
 */
function compareCustomerData(existing, newData) {
  return (
    existing.name !== `${newData.givenName} ${newData.familyName}` ||
    existing.email !== newData.email ||
    existing.phone !== newData.phone
  );
}

module.exports = {
  findOrUpdateCustomer,
  createInvoice,
  accountInvoice,
  emitDianInvoice
};
