/**
 * Servicio para actualización de carteras (acuerdos) en Strapi
 * Implementa la lógica de LOGICA_ACTUALIZACION_ACUERDOS.md
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');

const TOLERANCIA = 1000; // 1000 COP de tolerancia para redondeos

/**
 * Extrae solo la fecha (YYYY-MM-DD) de un ISO string, preservando la zona horaria
 * @param {string} isoString - Fecha en formato ISO (ej: "2025-10-24T19:13:33.085-05:00")
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function extractDateOnly(isoString) {
  if (!isoString) return null;
  // Simplemente tomar los primeros 10 caracteres (YYYY-MM-DD)
  // Esto preserva la fecha sin conversión de zona horaria
  return isoString.split('T')[0];
}

/**
 * Normaliza un string para comparación
 * @param {string} str - String a normalizar
 * @returns {string} String normalizado
 */
function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Consulta todas las cuotas de un acuerdo en Strapi
 * @param {string} nroAcuerdo - Número del acuerdo
 * @returns {Promise<Array>} Array de cuotas
 */
async function fetchCuotasAcuerdo(nroAcuerdo) {
  try {
    const url = `${config.strapi.apiUrl}/api/carteras?filters[nro_acuerdo][$eq]=${nroAcuerdo}&pagination[pageSize]=100&populate=*`;

    logger.info(`[StrapiCartera] Consultando cuotas del acuerdo: ${nroAcuerdo}`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${config.strapi.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data.data) {
      logger.info(`[StrapiCartera] ${response.data.data.length} cuotas encontradas para acuerdo ${nroAcuerdo}`);
      return response.data.data.map(cuota => ({
        id: cuota.id,
        documentId: cuota.documentId,
        nro_acuerdo: cuota.nro_acuerdo || cuota.attributes?.nro_acuerdo,
        cuota_nro: cuota.cuota_nro || cuota.attributes?.cuota_nro,
        nro_cuotas: cuota.nro_cuotas || cuota.attributes?.nro_cuotas,
        valor_cuota: cuota.valor_cuota || cuota.attributes?.valor_cuota,
        fecha_limite: cuota.fecha_limite || cuota.attributes?.fecha_limite,
        producto: cuota.producto?.nombre || cuota.attributes?.producto?.data?.nombre || cuota.attributes?.producto?.data?.attributes?.nombre,
        estado_pago: cuota.estado_pago || cuota.attributes?.estado_pago || 'al_dia',
        fecha_de_pago: cuota.fecha_de_pago || cuota.attributes?.fecha_de_pago,
        valor_pagado: cuota.valor_pagado || cuota.attributes?.valor_pagado || 0
      }));
    }

    return [];
  } catch (error) {
    logger.error(`[StrapiCartera] Error consultando cuotas del acuerdo ${nroAcuerdo}:`, error.message);
    return [];
  }
}

/**
 * Consulta todos los pagos (facturaciones) de un acuerdo en Strapi
 * @param {string} nroAcuerdo - Número del acuerdo
 * @returns {Promise<Array>} Array de pagos
 */
async function fetchPagosAcuerdo(nroAcuerdo) {
  try {
    const url = `${config.strapi.apiUrl}/api/facturaciones?filters[acuerdo][$eq]=${nroAcuerdo}&pagination[pageSize]=500&populate=*`;

    logger.info(`[StrapiCartera] Consultando pagos del acuerdo: ${nroAcuerdo}`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${config.strapi.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data.data) {
      logger.info(`[StrapiCartera] ${response.data.data.length} pagos encontrados para acuerdo ${nroAcuerdo}`);

      return response.data.data.map(pago => {
        const attrs = pago.attributes || pago;

        // Extraer producto (puede ser relación o string)
        let productoNombre = '';
        if (attrs.producto?.data?.attributes?.nombre) {
          productoNombre = attrs.producto.data.attributes.nombre;
        } else if (attrs.producto?.data?.nombre) {
          productoNombre = attrs.producto.data.nombre;
        } else if (typeof attrs.producto === 'string') {
          productoNombre = attrs.producto;
        }

        return {
          id: pago.id,
          producto: productoNombre,
          valor_neto: attrs.valor_neto || 0,
          fecha: attrs.fecha || attrs.createdAt,
          acuerdo: attrs.acuerdo
        };
      });
    }

    return [];
  } catch (error) {
    logger.error(`[StrapiCartera] Error consultando pagos del acuerdo ${nroAcuerdo}:`, error.message);
    return [];
  }
}

/**
 * Encuentra pagos relacionados con una cuota específica
 * @param {Array} pagos - Array de pagos del acuerdo
 * @param {string} productoBase - Nombre base del producto
 * @param {number} cuotaNro - Número de la cuota
 * @param {number} totalCuotas - Total de cuotas del acuerdo
 * @returns {Array} Pagos relacionados con esta cuota
 */
function findPagosParaCuota(pagos, productoBase, cuotaNro, totalCuotas) {
  const targets = [];

  // Si es la última cuota, incluir "Paz y salvo"
  if (cuotaNro === totalCuotas) {
    targets.push(`${productoBase} - Paz y salvo`);
    targets.push(`${productoBase} - paz y salvo`);
  }

  // Siempre incluir la cuota normal y la de mora
  targets.push(`${productoBase} - Cuota ${cuotaNro}`);
  targets.push(`${productoBase} - Cuota ${cuotaNro} (Mora)`);
  targets.push(`${productoBase} - Cuota ${cuotaNro} (mora)`);

  const wanted = new Set(targets.map(normalize));

  const matches = pagos.filter(pago => {
    const productoNormalizado = normalize(pago.producto);
    return wanted.has(productoNormalizado);
  });

  // Ordenar por fecha ascendente (más antigua primero)
  matches.sort((a, b) => {
    const dateA = new Date(a.fecha);
    const dateB = new Date(b.fecha);
    return dateA - dateB;
  });

  return matches;
}

/**
 * Actualiza una cuota en Strapi
 * @param {string} documentId - ID del documento en Strapi
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<boolean>} true si se actualizó exitosamente
 */
async function actualizarCuota(documentId, data) {
  try {
    const url = `${config.strapi.apiUrl}/api/carteras/${documentId}`;

    await axios.put(url, { data }, {
      headers: {
        'Authorization': `Bearer ${config.strapi.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    logger.info(`[StrapiCartera] Cuota ${documentId} actualizada: ${data.estado_pago} (${data.valor_pagado} COP)`);
    return true;
  } catch (error) {
    logger.error(`[StrapiCartera] Error actualizando cuota ${documentId}:`, error.message);
    return false;
  }
}

/**
 * Actualiza todas las cuotas de un acuerdo basándose en los pagos realizados
 * Incluye el pago actual que está a punto de registrarse
 *
 * @param {string} nroAcuerdo - Número del acuerdo
 * @param {Object} pagoNuevo - Pago actual que se va a registrar
 * @param {string} pagoNuevo.producto - Nombre del producto (ej: "Élite - 6 meses - Cuota 1")
 * @param {number} pagoNuevo.valor_neto - Valor neto del pago
 * @param {string} pagoNuevo.fecha - Fecha del pago (ISO string)
 * @returns {Promise<Object>} { todas_pagadas, cuotas_actualizadas, detalles }
 */
async function actualizarCarterasPorAcuerdo(nroAcuerdo, pagoNuevo) {
  try {
    logger.info(`[StrapiCartera] ===== INICIO ACTUALIZACIÓN CARTERAS =====`);
    logger.info(`[StrapiCartera] Acuerdo: ${nroAcuerdo}`);
    logger.info(`[StrapiCartera] Pago nuevo: ${pagoNuevo.producto} → $${pagoNuevo.valor_neto}`);

    // 1. Obtener todas las cuotas del acuerdo
    const cuotas = await fetchCuotasAcuerdo(nroAcuerdo);

    if (cuotas.length === 0) {
      logger.warn(`[StrapiCartera] No se encontraron cuotas para el acuerdo ${nroAcuerdo}`);
      return {
        todas_pagadas: false,
        cuotas_actualizadas: 0,
        detalles: []
      };
    }

    logger.info(`[StrapiCartera] ${cuotas.length} cuotas encontradas`);

    // 2. Obtener todos los pagos previos del acuerdo
    const pagosPrevios = await fetchPagosAcuerdo(nroAcuerdo);
    logger.info(`[StrapiCartera] ${pagosPrevios.length} pagos previos encontrados`);

    // 3. Agregar el pago actual a la lista (simularlo como si ya estuviera guardado)
    const todosPagos = [...pagosPrevios, pagoNuevo];
    logger.info(`[StrapiCartera] Total de pagos a considerar: ${todosPagos.length} (${pagosPrevios.length} previos + 1 nuevo)`);

    // 4. Para cada cuota, calcular su estado
    const detalles = [];
    let cuotasActualizadas = 0;

    for (const cuota of cuotas) {
      const productoBase = cuota.producto;
      const cuotaNro = cuota.cuota_nro;
      const totalCuotas = cuota.nro_cuotas;
      const valorCuota = cuota.valor_cuota;

      logger.info(`[StrapiCartera] --- Procesando Cuota ${cuotaNro}/${totalCuotas} ---`);
      logger.info(`[StrapiCartera] Producto: ${productoBase}, Valor: $${valorCuota}`);

      // Buscar pagos relacionados con esta cuota
      const pagosRelacionados = findPagosParaCuota(todosPagos, productoBase, cuotaNro, totalCuotas);

      logger.info(`[StrapiCartera] ${pagosRelacionados.length} pagos relacionados encontrados`);

      if (pagosRelacionados.length === 0) {
        // No hay pagos para esta cuota
        logger.info(`[StrapiCartera] Sin pagos → Estado: al_dia`);
        detalles.push({
          cuota_nro: cuotaNro,
          estado_pago: 'al_dia',
          valor_pagado: 0,
          fecha_de_pago: null
        });
        continue;
      }

      // Caso especial: "Paz y salvo" marca la última cuota como pagada
      const pagosPazYSalvo = pagosRelacionados.filter(p =>
        normalize(p.producto).includes('paz y salvo')
      );

      if (pagosPazYSalvo.length > 0 && cuotaNro === totalCuotas) {
        const paz = pagosPazYSalvo[pagosPazYSalvo.length - 1]; // Último paz y salvo
        const fechaISO = extractDateOnly(paz.fecha);

        logger.info(`[StrapiCartera] ✅ PAZ Y SALVO encontrado → Cuota marcada como PAGADA`);

        const updateData = {
          estado_pago: 'pagado',
          fecha_de_pago: fechaISO,
          valor_pagado: paz.valor_neto
        };

        await actualizarCuota(cuota.documentId, updateData);
        cuotasActualizadas++;

        detalles.push({
          cuota_nro: cuotaNro,
          ...updateData
        });
        continue;
      }

      // Caso normal: Sumar todos los pagos relacionados
      let sumaPagos = 0;
      let ultimaFecha = null;

      for (const pago of pagosRelacionados) {
        sumaPagos += Number(pago.valor_neto || 0);
        const fechaPago = new Date(pago.fecha);
        if (!ultimaFecha || fechaPago > new Date(ultimaFecha)) {
          ultimaFecha = pago.fecha;
        }
      }

      logger.info(`[StrapiCartera] Suma de pagos: $${sumaPagos}`);

      // Determinar estado (con tolerancia)
      const pagadoCompleto = valorCuota ? (sumaPagos + TOLERANCIA >= valorCuota) : sumaPagos > 0;
      const estadoPago = pagadoCompleto ? 'pagado' : 'en_mora';
      const fechaISO = ultimaFecha ? extractDateOnly(ultimaFecha) : null;

      logger.info(`[StrapiCartera] Estado calculado: ${estadoPago}`);

      const updateData = {
        estado_pago: estadoPago,
        fecha_de_pago: fechaISO,
        valor_pagado: sumaPagos
      };

      await actualizarCuota(cuota.documentId, updateData);
      cuotasActualizadas++;

      detalles.push({
        cuota_nro: cuotaNro,
        ...updateData
      });
    }

    // 5. Verificar si TODAS las cuotas quedaron pagadas
    const todasPagadas = detalles.every(d => d.estado_pago === 'pagado');

    logger.info(`[StrapiCartera] ===== FIN ACTUALIZACIÓN CARTERAS =====`);
    logger.info(`[StrapiCartera] Cuotas actualizadas: ${cuotasActualizadas}/${cuotas.length}`);
    logger.info(`[StrapiCartera] Todas pagadas: ${todasPagadas ? 'SÍ ✅' : 'NO ❌'}`);

    return {
      todas_pagadas: todasPagadas,
      cuotas_actualizadas: cuotasActualizadas,
      detalles
    };

  } catch (error) {
    logger.error(`[StrapiCartera] Error en actualizarCarterasPorAcuerdo:`, error);
    return {
      todas_pagadas: false,
      cuotas_actualizadas: 0,
      detalles: [],
      error: error.message
    };
  }
}

module.exports = {
  actualizarCarterasPorAcuerdo,
  fetchCuotasAcuerdo,
  fetchPagosAcuerdo
};
