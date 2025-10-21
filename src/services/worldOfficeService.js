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
const cityCache = require('./worldOfficeCityCache');

// Configuración de axios para World Office
const woClient = axios.create({
  baseURL: config.worldOffice?.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': config.worldOffice?.apiToken
  }
});

// Configuración de axios para Strapi
const strapiClient = axios.create({
  baseURL: config.strapi?.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.strapi?.apiToken}`
  }
});

/**
 * Helper: Separar nombres en primer y segundo nombre
 * @param {string} fullName - Nombre completo
 * @returns {Object} { primerNombre, segundoNombre }
 */
function splitNames(fullName) {
  if (!fullName) return { primerNombre: '', segundoNombre: '' };

  const parts = fullName.trim().split(/\s+/);
  return {
    primerNombre: parts[0] || '',
    segundoNombre: parts.slice(1).join(' ') || ''
  };
}

/**
 * Helper: Buscar comercial en Strapi y luego en World Office
 * @param {string} comercialName - Nombre del comercial
 * @returns {Promise<number>} ID del comercial en WO (o 2259 por defecto)
 */
async function findComercialWOId(comercialName) {
  try {
    if (!comercialName) {
      logger.info('[WorldOffice] No se proporcionó comercial, usando ID por defecto: 2259');
      return 2259;
    }

    // Paso 1: Buscar en Strapi para obtener la cédula
    logger.info(`[WorldOffice] Buscando comercial en Strapi: "${comercialName}"`);
    const strapiResponse = await strapiClient.get('/api/comerciales', {
      params: {
        'filters[nombre][$eq]': comercialName
      }
    });

    if (!strapiResponse.data?.data || strapiResponse.data.data.length === 0) {
      logger.warn(`[WorldOffice] Comercial "${comercialName}" no encontrado en Strapi. Usando ID por defecto: 2259`);
      return 2259;
    }

    const comercialData = strapiResponse.data.data[0];
    const cedulaComercial = comercialData.numero_documento;

    logger.info(`[WorldOffice] Comercial encontrado en Strapi - Cédula: ${cedulaComercial}`);

    // Paso 2: Buscar en World Office por cédula
    logger.info(`[WorldOffice] Buscando comercial en WO con cédula: ${cedulaComercial}`);
    try {
      const woResponse = await woClient.get(`/api/v1/terceros/identificacion/${cedulaComercial}`);

      logger.info(`[WorldOffice] Respuesta WO status: ${woResponse.data?.status}`);
      logger.info(`[WorldOffice] Respuesta WO data.id: ${woResponse.data?.data?.id}`);

      if (woResponse.data?.status === 'OK' && woResponse.data?.data?.id) {
        const idWOComercial = woResponse.data.data.id;
        logger.info(`[WorldOffice] ✅ Comercial encontrado en WO - ID: ${idWOComercial}`);
        return idWOComercial;
      } else {
        logger.warn(`[WorldOffice] Respuesta de WO no tiene el formato esperado. Status: ${woResponse.data?.status}, ID: ${woResponse.data?.data?.id}`);
        return 2259;
      }
    } catch (woError) {
      if (woError.response?.data?.status === 'NOT_FOUND') {
        logger.warn(`[WorldOffice] Comercial con cédula ${cedulaComercial} no encontrado en WO (NOT_FOUND). Usando ID por defecto: 2259`);
      } else {
        logger.error(`[WorldOffice] Error buscando comercial en WO - Status: ${woError.response?.status}, Message: ${woError.message}`);
      }
      return 2259;
    }

  } catch (error) {
    logger.error('[WorldOffice] Error en findComercialWOId:', error.message);
    return 2259; // Siempre retornar el ID por defecto en caso de error
  }
}

/**
 * PASO 6: Buscar o actualizar cliente en World Office
 * @param {Object} customerData - Datos del cliente
 * @param {string} customerData.identityDocument - Cédula del cliente
 * @param {string} customerData.givenName - Nombre
 * @param {string} customerData.familyName - Apellido
 * @param {string} customerData.email - Email
 * @param {string} customerData.phone - Teléfono
 * @param {string} customerData.city - Nombre de la ciudad (opcional)
 * @param {string} customerData.address - Dirección (opcional)
 * @param {string} customerData.comercial - Nombre del comercial (opcional)
 * @returns {Promise<Object>} customerId, customerData, comercialWOId
 */
async function findOrUpdateCustomer(customerData) {
  try {
    logger.info(`[WorldOffice] Buscando cliente con cédula: ${customerData.identityDocument}`);

    // PASO 1: Obtener el ID de la ciudad
    let cityId = null;
    let cityName = customerData.city;

    if (customerData.city && customerData.city !== 'N/A') {
      const cityFound = await cityCache.findCityByName(customerData.city);
      if (cityFound) {
        cityId = cityFound.id;
        cityName = cityFound.nombre;
        logger.info(`[WorldOffice] Ciudad encontrada: "${customerData.city}" → ID ${cityId} (${cityName})`);
      } else {
        logger.warn(`[WorldOffice] Ciudad no encontrada en caché: "${customerData.city}". Usando Medellín por defecto.`);
        cityId = 1; // Medellín por defecto
        cityName = 'Medellín';
      }
    } else {
      // Si no hay ciudad o es "N/A", usar Medellín por defecto
      logger.info(`[WorldOffice] Ciudad no proporcionada (N/A). Usando Medellín por defecto.`);
      cityId = 1; // Medellín por defecto
      cityName = 'Medellín';
    }

    // PASO 2: Buscar cliente en World Office por cédula
    let idWO = null;
    let action = null;

    try {
      const searchResponse = await woClient.get(`/api/v1/terceros/identificacion/${customerData.identityDocument}`);

      if (searchResponse.data?.status === 'OK' && searchResponse.data?.data?.id) {
        idWO = searchResponse.data.data.id;
        action = 'found';
        logger.info(`[WorldOffice] Cliente encontrado - ID: ${idWO}`);
      }
    } catch (searchError) {
      if (searchError.response?.data?.status === 'NOT_FOUND') {
        logger.info('[WorldOffice] Cliente no encontrado, se procederá a crear uno nuevo');
      } else {
        throw searchError; // Re-lanzar si es un error diferente
      }
    }

    // PASO 3: Si no existe, crear cliente nuevo
    if (!idWO) {
      logger.info('[WorldOffice] Creando nuevo cliente en World Office');

      // Separar nombres y apellidos
      const nombres = splitNames(customerData.givenName);
      const apellidos = splitNames(customerData.familyName);

      const payload = {
        idTerceroTipoIdentificacion: 3, // 3 = Cédula de Ciudadanía
        identificacion: customerData.identityDocument,
        primerNombre: nombres.primerNombre,
        segundoNombre: nombres.segundoNombre,
        primerApellido: apellidos.primerNombre,
        segundoApellido: apellidos.segundoNombre,
        idCiudad: cityId,
        direccion: customerData.address || 'N/A',
        telefono: customerData.phone || '',
        email: customerData.email,
        idClasificacionImpuestos: 1,
        idTerceroTipoContribuyente: 6,
        plazoDias: 1,
        idTerceroTipos: [4], // 4 = Cliente
        responsabilidadFiscal: [5, 7]
      };

      logger.info('[WorldOffice] Payload de creación:', JSON.stringify(payload, null, 2));

      const createResponse = await woClient.post('/api/v1/terceros/crearTercero', payload);

      if (createResponse.data?.data?.id) {
        idWO = createResponse.data.data.id;
        action = 'created';
        logger.info(`[WorldOffice] Cliente creado exitosamente - ID: ${idWO}`);
      } else {
        throw new Error('No se recibió ID del cliente creado');
      }
    }

    // PASO 4: Buscar ID del comercial en World Office
    const comercialWOId = await findComercialWOId(customerData.comercial);

    // Retornar datos completos
    return {
      customerId: idWO,
      customerData: {
        id: idWO,
        document: customerData.identityDocument,
        name: `${customerData.givenName} ${customerData.familyName}`,
        email: customerData.email,
        phone: customerData.phone,
        cityId: cityId,
        cityName: cityName,
        address: customerData.address
      },
      comercialWOId: comercialWOId,
      action: action
    };

  } catch (error) {
    logger.error('[WorldOffice] Error en findOrUpdateCustomer:', error.message);
    if (error.response) {
      logger.error('[WorldOffice] Respuesta de error:', JSON.stringify(error.response.data, null, 2));
    }
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
  emitDianInvoice,
  // Exportar funciones del caché de ciudades para uso directo
  cityCache: {
    findCityByName: cityCache.findCityByName,
    findCityById: cityCache.findCityById,
    getCacheInfo: cityCache.getCacheInfo,
    refreshCache: cityCache.refreshCache
  }
};
