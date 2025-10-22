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
const FeatureFlag = require('../models/FeatureFlag');
const { getColombiaDateString } = require('../utils/dateUtils');

// Configuración de axios para World Office
const woClient = axios.create({
  baseURL: config.worldOffice?.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': config.worldOffice?.apiToken
  }
});

// ==================== CONSTANTES DE FACTURACIÓN ====================

// ISBNs de los 24 libros FR
const ISBNS = [
  "978-628-95885-0-7",
  "978-628-95885-2-1",
  "978-628-95885-3-8",
  "978-628-95885-1-4",
  "978-628-95885-4-5",
  "978-628-95885-6-9",
  "978-628-95885-7-6",
  "978-628-95885-5-2",
  "978-628-96023-3-3",
  "978-628-96023-0-2",
  "978-628-96023-1-9",
  "978-628-96023-2-6",
  "978-628-96023-4-0",
  "978-628-96023-5-7",
  "978-628-96023-7-1",
  "978-628-96023-6-4",
  "978-628-96166-1-3",
  "978-628-96023-9-5",
  "978-628-96023-8-8",
  "978-628-96166-0-6",
  "978-628-96166-5-1",
  "978-628-96166-2-0",
  "978-628-96166-3-7",
  "978-628-96166-4-4"
];

// Precio por libro
const PRECIO_POR_LIBRO = 200000;

// Tope exento de IVA (24 libros)
const TOPE_EXENTO_IVA = 4800000;

// ID de inventario para MIR (cuando excede tope)
const ID_INVENTARIO_MIR = 1001;

// Mapeo de productos a IDs de inventario en World Office
const PRODUCT_INVENTORY_MAP = {
  'iaura': { id: 1004, hasIVA: true, centroCosto: 1 },
  'sculapp': { id: 1008, hasIVA: true, centroCosto: 2 },
  'asesoria': { id: 1003, hasIVA: true, centroCosto: 1 },
  'publicidad': { id: 1062, hasIVA: true, centroCosto: 2 },
  'simulacion': { id: 1054, hasIVA: true, centroCosto: 1 },
  'acceso vip': { id: 1057, hasIVA: true, centroCosto: 1 },
  'ingles': { id: 1059, hasIVA: true, centroCosto: 1 },
  'vip - rmastery': { id: 1067, hasIVA: true, centroCosto: 1 },
  'default': { id: 1010, hasIVA: false, centroCosto: 1 } // FR Libros
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Helper: Sistema de reintentos para operaciones de World Office
 * @param {Function} operation - Función async que retorna una promesa
 * @param {string} operationName - Nombre de la operación para logging
 * @param {number} maxRetries - Número máximo de reintentos
 * @param {number} retryDelay - Delay en ms entre reintentos
 * @returns {Promise<any>} Resultado de la operación
 */
async function retryOperation(operation, operationName, maxRetries = config.worldOffice.maxRetries, retryDelay = config.worldOffice.retryDelay) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[WorldOffice] ${operationName} - Intento ${attempt}/${maxRetries}`);
      const result = await operation();

      if (attempt > 1) {
        logger.info(`[WorldOffice] ✅ ${operationName} exitoso después de ${attempt} intentos`);
      }

      return result;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;

      // Detectar errores NO recuperables (no tiene sentido reintentar)
      const isNonRecoverableError =
        error.response?.status === 404 ||  // Not found - definitivo
        error.response?.status === 400 ||  // Bad request - payload inválido
        error.response?.status === 401 ||  // Unauthorized - credenciales inválidas
        error.response?.status === 403;    // Forbidden - sin permisos

      // Log del error
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        logger.warn(`[WorldOffice] ⏱️ Timeout en ${operationName} - Intento ${attempt}/${maxRetries}`);
      } else if (error.response) {
        logger.warn(`[WorldOffice] ❌ Error ${error.response.status} en ${operationName} - Intento ${attempt}/${maxRetries}`);

        // Si es 404, mostrar mensaje específico
        if (error.response.status === 404) {
          logger.info(`[WorldOffice] 🔍 Recurso no encontrado (404) - No se reintentará`);
        }
      } else {
        logger.warn(`[WorldOffice] ❌ Error en ${operationName}: ${error.message} - Intento ${attempt}/${maxRetries}`);
      }

      // Si es un error NO recuperable, lanzarlo inmediatamente sin reintentar
      if (isNonRecoverableError) {
        logger.info(`[WorldOffice] ⚠️ Error no recuperable detectado - Finalizando reintentos`);
        throw error;
      }

      // Si no es el último intento, esperar antes de reintentar
      if (!isLastAttempt) {
        logger.info(`[WorldOffice] ⏳ Esperando ${retryDelay}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  logger.error(`[WorldOffice] ❌ ${operationName} falló después de ${maxRetries} intentos`);
  throw lastError;
}

/**
 * Helper: Quitar acentos de un string
 * @param {string} str - String con acentos
 * @returns {string} String sin acentos
 */
function quitarAcentos(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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
 * Helper: Obtener ISBNs según el producto y valor
 * @param {string} producto - Nombre del producto
 * @param {number} valor - Valor de la factura
 * @returns {string} ISBNs formateados
 */
function getISBNs(producto, valor) {
  const cantidadLibros = Math.ceil(valor / PRECIO_POR_LIBRO);

  // Normalizar producto
  const productoNorm = quitarAcentos(producto.toLowerCase())
    .replace(/cuota/gi, 'parte')
    .replace(/\s*\(mora\)/g, '')
    .replace(/extraordinaria/gi, 'autorizada');

  // Extraer número de parte/cuota
  const parteMatch = productoNorm.match(/parte (\d+)/);

  if (parteMatch) {
    // Es una cuota específica (Parte 1, 2, 3...)
    const parteNumero = parseInt(parteMatch[1], 10);
    const primerLibro = (parteNumero - 1) * cantidadLibros;
    const isbnsSeleccionados = ISBNS.slice(primerLibro, primerLibro + cantidadLibros);
    return "ISBNS: " + isbnsSeleccionados.join(", ");

  } else if (productoNorm.includes("autorizada")) {
    // Cuota extraordinaria/autorizada → últimos libros
    const isbnsSeleccionados = ISBNS.slice(-cantidadLibros);
    return "ISBNS: " + isbnsSeleccionados.join(", ");

  } else {
    // Pago completo → todos los ISBNs
    return "ISBNS: " + ISBNS.join(", ");
  }
}

/**
 * Helper: Determinar ID de inventario según el producto
 * @param {string} producto - Nombre del producto
 * @returns {Object} { id, hasIVA, centroCosto, productoNorm }
 */
function getInventoryId(producto) {
  const productoNorm = quitarAcentos(producto.toLowerCase())
    .replace(/cuota/gi, 'parte')
    .replace(/\s*\(mora\)/g, '')
    .replace(/extraordinaria/gi, 'autorizada');

  // Buscar coincidencia en el mapeo
  for (const [key, config] of Object.entries(PRODUCT_INVENTORY_MAP)) {
    if (key !== 'default' && productoNorm.includes(key)) {
      return { ...config, productoNorm };
    }
  }

  // Si no coincide con ninguno, retornar default (FR Libros)
  return { ...PRODUCT_INVENTORY_MAP.default, productoNorm };
}

/**
 * Helper: Buscar comercial en Strapi y luego en World Office
 * @param {string} comercialName - Nombre del comercial
 * @returns {Promise<number>} ID del comercial en WO (o 2259 por defecto)
 */
/**
 * Mapeo fijo de comerciales a sus IDs en World Office
 */
const COMERCIALES_MAP = {
  'Santiago Flórez Rojo': 1016,
  'Lorena Blandón Carmona': 1024,
  'Giancarlo Aguilar Fonnegra': 1013,
  'Ángela Yirley Silva David': 1006
};

const DEFAULT_COMERCIAL_ID = 2259;

async function findComercialWOId(comercialName) {
  try {
    if (!comercialName) {
      logger.info('[WorldOffice] No se proporcionó comercial, usando ID por defecto: 2259');
      return DEFAULT_COMERCIAL_ID;
    }

    // Buscar en el mapeo fijo
    const comercialId = COMERCIALES_MAP[comercialName];

    if (comercialId) {
      logger.info(`[WorldOffice] ✅ Comercial "${comercialName}" → ID WO: ${comercialId}`);
      return comercialId;
    } else {
      logger.info(`[WorldOffice] Comercial "${comercialName}" no está en el mapeo. Usando ID por defecto: ${DEFAULT_COMERCIAL_ID}`);
      return DEFAULT_COMERCIAL_ID;
    }

  } catch (error) {
    logger.error('[WorldOffice] Error en findComercialWOId:', error.message);
    return DEFAULT_COMERCIAL_ID;
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

    // PASO 2: Buscar cliente en World Office por cédula (con reintentos)
    let idWO = null;
    let action = null;

    try {
      const searchResponse = await retryOperation(
        () => woClient.get(`/api/v1/terceros/identificacion/${customerData.identityDocument}`),
        `Búsqueda de cliente (${customerData.identityDocument})`
      );

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

      const createResponse = await retryOperation(
        () => woClient.post('/api/v1/terceros/crearTercero', payload),
        `Creación de cliente (${customerData.identityDocument})`
      );

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
 * PASO 6A: Crear factura de venta en World Office
 * @param {Object} invoiceData - Datos de la factura
 * @param {number} invoiceData.customerId - ID del cliente en WO
 * @param {number} invoiceData.comercialWOId - ID del comercial en WO
 * @param {string} invoiceData.product - Nombre del producto
 * @param {number} invoiceData.amount - Monto total
 * @returns {Promise<Object>} { documentoId, numeroFactura, payload, renglones }
 */
async function createInvoice(invoiceData) {
  try {
    const { customerId, comercialWOId, product, amount } = invoiceData;

    // Leer configuración dinámica desde BD (con fallback a .env)
    const invoiceEnabled = await FeatureFlag.isEnabled('WORLDOFFICE_INVOICE_ENABLED', config.worldOffice.modoProduccion);
    const modoActual = invoiceEnabled ? 'PRODUCCIÓN' : 'TESTING';
    logger.info(`[WorldOffice] Creando factura - Modo: ${modoActual}`);
    logger.info(`[WorldOffice] Cliente: ${customerId}, Comercial: ${comercialWOId}, Producto: ${product}, Monto: $${amount}`);

    // MODO TESTING: Simular
    if (!invoiceEnabled) {
      logger.info('[WorldOffice] 🟡 MODO TESTING - Factura simulada');

      const inventoryConfig = getInventoryId(product);
      const renglones = [];

      if (amount <= TOPE_EXENTO_IVA) {
        const valorUnitario = inventoryConfig.hasIVA ? amount / 1.19 : amount;
        const conceptoRenglon = inventoryConfig.id === 1010 ? getISBNs(product, amount) : "";

        renglones.push({
          idInventario: inventoryConfig.id,
          cantidad: 1,
          valorUnitario,
          valorTotal: valorUnitario,
          iva: inventoryConfig.hasIVA ? valorUnitario * 0.19 : 0,
          idCentroCosto: inventoryConfig.centroCosto,
          idBodega: 1,
          concepto: conceptoRenglon
        });
      } else {
        renglones.push({
          idInventario: 1010,
          cantidad: 1,
          valorUnitario: TOPE_EXENTO_IVA,
          valorTotal: TOPE_EXENTO_IVA,
          iva: 0,
          idCentroCosto: 1,
          idBodega: 1,
          concepto: getISBNs(product, TOPE_EXENTO_IVA)
        });
        renglones.push({
          idInventario: ID_INVENTARIO_MIR,
          cantidad: 1,
          valorUnitario: (amount - TOPE_EXENTO_IVA) / 1.19,
          valorTotal: (amount - TOPE_EXENTO_IVA) / 1.19,
          iva: ((amount - TOPE_EXENTO_IVA) / 1.19) * 0.19,
          idCentroCosto: 1,
          idBodega: 1,
          concepto: ""
        });
      }

      return {
        documentoId: 'DOC_SIMULATED_' + Date.now(),
        numeroFactura: 'FV-SIM-' + Date.now(),
        monto: amount,
        renglones,
        simulado: true
      };
    }

    // MODO PRODUCCIÓN: Crear factura real
    logger.info('[WorldOffice] 🟢 MODO PRODUCCIÓN - Creando factura real');

    const inventoryConfig = getInventoryId(product);
    const fecha = getColombiaDateString(); // Fecha en zona horaria de Colombia (UTC-5)

    const payload = {
      fecha,
      prefijo: 16,
      concepto: inventoryConfig.productoNorm,
      documentoTipo: "FV",
      idEmpresa: 1,
      idTerceroExterno: customerId,
      idTerceroInterno: comercialWOId,
      idFormaPago: 1001,
      idMoneda: 31,
      trm: 1,
      porcentajeDescuento: false,
      porcentajeTodosRenglones: false,
      valDescuento: 0,
      reglones: []
    };

    // Construir renglones según el monto
    const renglonesConIva = [];

    if (amount <= TOPE_EXENTO_IVA) {
      // 1 solo producto
      const valorUnitario = inventoryConfig.hasIVA ? amount / 1.19 : amount;
      const ivaCalculado = inventoryConfig.hasIVA ? valorUnitario * 0.19 : 0;
      const conceptoRenglon = inventoryConfig.id === 1010 ? getISBNs(product, amount) : "";

      payload.reglones.push({
        idInventario: inventoryConfig.id,
        unidadMedida: "und",
        cantidad: 1,
        valorUnitario,
        valorTotal: valorUnitario,
        idBodega: 1,
        idCentroCosto: inventoryConfig.centroCosto,
        concepto: conceptoRenglon,
        porDescuento: 0,
        obsequio: false,
        valorTotalRenglon: 0
      });

      // Agregar versión con IVA para el retorno
      renglonesConIva.push({
        ...payload.reglones[0],
        iva: ivaCalculado
      });
    } else {
      // 2 productos (libros + MIR)
      const conceptoLibros = getISBNs(product, TOPE_EXENTO_IVA);
      const valorMIR = (amount - TOPE_EXENTO_IVA) / 1.19;
      const ivaMIR = valorMIR * 0.19;

      payload.reglones.push({
        idInventario: 1010,
        unidadMedida: "und",
        cantidad: 1,
        valorUnitario: TOPE_EXENTO_IVA,
        valorTotal: TOPE_EXENTO_IVA,
        idBodega: 1,
        idCentroCosto: 1,
        concepto: conceptoLibros,
        porDescuento: 0,
        obsequio: false,
        valorTotalRenglon: 0
      });

      payload.reglones.push({
        idInventario: ID_INVENTARIO_MIR,
        unidadMedida: "und",
        cantidad: 1,
        valorUnitario: valorMIR,
        valorTotal: valorMIR,
        idBodega: 1,
        idCentroCosto: 1,
        concepto: "",
        porDescuento: 0,
        obsequio: false,
        valorTotalRenglon: 0
      });

      // Agregar versiones con IVA para el retorno
      renglonesConIva.push({
        ...payload.reglones[0],
        iva: 0
      });
      renglonesConIva.push({
        ...payload.reglones[1],
        iva: ivaMIR
      });
    }

    logger.info('[WorldOffice] Payload de factura:', JSON.stringify(payload, null, 2));

    const response = await retryOperation(
      () => woClient.post('/api/v1/documentos/crearDocumentoVenta', payload),
      `Creación de factura (Cliente: ${customerId}, Monto: $${amount})`
    );

    if (response.status === 201 && response.data?.data?.id) {
      const documentoId = response.data.data.id;
      logger.info(`[WorldOffice] ✅ Factura creada - Documento ID: ${documentoId}`);

      return {
        documentoId,
        numeroFactura: response.data.data.numero || 'FV-' + documentoId,
        monto: amount,
        payload,
        renglones: renglonesConIva, // Retornar renglones con campo IVA
        simulado: false
      };
    }

    throw new Error('No se recibió ID del documento creado');

  } catch (error) {
    logger.error('[WorldOffice] Error en createInvoice:', error.message);
    if (error.response) {
      logger.error('[WorldOffice] Respuesta de error:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Error creando factura en World Office: ${error.message}`);
  }
}

/**
 * PASO 6B: Contabilizar factura
 * @param {string} documentoId - ID del documento
 * @returns {Promise<Object>} accountingStatus
 */
async function accountInvoice(documentoId) {
  try {
    // Leer configuración dinámica desde BD (con fallback a .env)
    const invoiceEnabled = await FeatureFlag.isEnabled('WORLDOFFICE_INVOICE_ENABLED', config.worldOffice.modoProduccion);
    const modoActual = invoiceEnabled ? 'PRODUCCIÓN' : 'TESTING';
    logger.info(`[WorldOffice] Contabilizando documento ${documentoId} - Modo: ${modoActual}`);

    // MODO TESTING: Simular
    if (!invoiceEnabled) {
      logger.info('[WorldOffice] 🟡 MODO TESTING - Contabilización simulada');
      return {
        documentoId,
        status: 'OK',
        accountingDate: new Date().toISOString(),
        simulado: true
      };
    }

    // MODO PRODUCCIÓN: Contabilizar real (con reintentos)
    logger.info('[WorldOffice] 🟢 MODO PRODUCCIÓN - Contabilizando documento');

    const response = await retryOperation(
      () => woClient.post(`/api/v1/documentos/contabilizarDocumento/${documentoId}`, {}),
      `Contabilización de documento (${documentoId})`
    );

    if (response.data?.status === 'OK') {
      logger.info(`[WorldOffice] ✅ Documento contabilizado - ID: ${documentoId}`);
      return {
        documentoId,
        status: 'OK',
        accountingDate: new Date().toISOString(),
        simulado: false
      };
    }

    throw new Error('Respuesta de contabilización no esperada');

  } catch (error) {
    logger.error('[WorldOffice] Error en accountInvoice:', error.message);
    if (error.response) {
      logger.error('[WorldOffice] Respuesta de error:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Error contabilizando documento en World Office: ${error.message}`);
  }
}

/**
 * PASO 6C: Emitir factura electrónica ante la DIAN
 * @param {string} documentoId - ID del documento
 * @returns {Promise<Object>} cufe, dianStatus
 */
async function emitDianInvoice(documentoId) {
  try {
    // Leer configuración dinámica desde BD (con fallback a .env)
    const dianEnabled = await FeatureFlag.isEnabled('WORLDOFFICE_DIAN_ENABLED', config.worldOffice.emitirDian);
    const invoiceEnabled = await FeatureFlag.isEnabled('WORLDOFFICE_INVOICE_ENABLED', config.worldOffice.modoProduccion);

    // Si la emisión DIAN está desactivada, skip
    if (!dianEnabled) {
      logger.info('[WorldOffice] 🔴 Emisión DIAN desactivada (WORLDOFFICE_DIAN_ENABLED=false)');
      return {
        documentoId,
        dianStatus: 'skipped',
        message: 'Emisión DIAN desactivada por configuración',
        skipped: true
      };
    }

    const modoActual = invoiceEnabled ? 'PRODUCCIÓN' : 'TESTING';
    logger.info(`[WorldOffice] Emitiendo factura electrónica - Documento: ${documentoId} - Modo: ${modoActual}`);

    // MODO TESTING: Simular
    if (!invoiceEnabled) {
      logger.info('[WorldOffice] 🟡 MODO TESTING - Emisión DIAN simulada');
      return {
        documentoId,
        cufe: 'CUFE_SIMULATED_' + Date.now(),
        dianStatus: 'ACCEPTED',
        emittedAt: new Date().toISOString(),
        simulado: true
      };
    }

    // MODO PRODUCCIÓN: Emitir real (con reintentos)
    logger.info('[WorldOffice] 🟢 MODO PRODUCCIÓN - Emitiendo ante DIAN');

    try {
      const response = await retryOperation(
        () => woClient.post(`/api/v1/documentos/facturaElectronica/${documentoId}`, {}),
        `Emisión DIAN (${documentoId})`
      );

      if (response.data?.status === 'ACCEPTED') {
        logger.info(`[WorldOffice] ✅ Factura electrónica emitida - Documento: ${documentoId}`);
        return {
          documentoId,
          cufe: response.data.cufe || 'CUFE-' + documentoId,
          dianStatus: 'ACCEPTED',
          emittedAt: new Date().toISOString(),
          simulado: false
        };
      }

      throw new Error('DIAN no aceptó la factura: ' + response.data?.message);

    } catch (error) {
      // Error 409 = Ya fue emitida → NO es error fatal
      if (error.response?.status === 409) {
        logger.warn('[WorldOffice] ⚠️ Factura ya emitida previamente (409) - Continuando...');
        return {
          documentoId,
          dianStatus: 'already_emitted',
          warning: true,
          message: 'Factura ya fue emitida anteriormente'
        };
      }

      // Otro error → lanzar
      throw error;
    }

  } catch (error) {
    logger.error('[WorldOffice] Error en emitDianInvoice:', error.message);
    if (error.response) {
      logger.error('[WorldOffice] Respuesta de error:', JSON.stringify(error.response.data, null, 2));
    }
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
