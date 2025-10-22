const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');
const { getProductBase } = require('../utils/productFilter');
const { obtenerConfiguracionMemberships } = require('../utils/promotions');
const { addDays, formatForFR360, isValidDate } = require('../utils/dateHelpers');
const { Membership } = require('../models');
const FeatureFlag = require('../models/FeatureFlag');
const notificationService = require('./notificationService');

// Etiquetas para aplicar según membershipPlanId
const ETIQUETAS_POR_PLAN = {
  1: 1176,  // Élite 12 meses
  3: 1175,  // Élite 9 meses
  4: 1174   // Élite 6 meses
};

const ETIQUETA_NUEVA_PLATAFORMA = 1172;

/**
 * Crea membresías para un usuario
 * @param {Object} params - Parámetros del usuario
 * @returns {string|null} - URL de activación o null si no se crearon membresías
 */
async function createMemberships(params) {
  const {
    contactId,
    identityDocument,
    email,
    givenName,
    familyName,
    phone,
    product,
    accessDate,
    webhookId,
    startTimestamp // Timestamp de inicio del paso para calcular duración
  } = params;

  // Leer configuración dinámica desde BD (con fallback a .env)
  const membershipsEnabled = await FeatureFlag.isEnabled('MEMBERSHIPS_ENABLED', config.frapp.modoProduccion);
  const modoActual = membershipsEnabled ? 'PRODUCCIÓN' : 'TESTING';

  logger.info(`[Membership] Iniciando creación de membresías (Modo: ${modoActual})`);
  logger.info(`[Membership] Producto: ${product}`);

  // 1. Validar que el producto sea permitido
  const productoBase = getProductBase(product);

  if (!productoBase) {
    const mensaje = `Producto no soportado para membresías: ${product}. Solo se permiten: Élite 6 o 9 meses (Cuota 1 o base)`;
    logger.info(`[Membership] ${mensaje}`);

    await notificationService.notifyFrapp('Producto no soportado', {
      'Producto recibido': product,
      'Email': email,
      'Modo': modoActual
    });

    return null;
  }

  // 2. Obtener configuración de memberships a aplicar
  const membershipsConfig = obtenerConfiguracionMemberships(productoBase);

  if (!membershipsConfig || membershipsConfig.length === 0) {
    logger.info(`[Membership] No hay configuración para: ${productoBase}`);
    return null;
  }

  logger.info(`[Membership] Aplicando ${membershipsConfig.length} membership(s) para ${productoBase}`);

  // 3. Preparar fechas base
  let fechaInicioBase = accessDate ? new Date(accessDate) : new Date();
  const ahora = new Date();

  if (!isValidDate(fechaInicioBase) || fechaInicioBase < ahora) {
    fechaInicioBase = new Date();
  }

  // 4. Preparar datos del usuario
  const datosUsuario = {
    email,
    givenName,
    familyName,
    phone: phone ? phone.toString() : '',
    identityType: 'CC',
    identityDocument: identityDocument ? identityDocument.toString() : ''
  };

  // 5. Variable para guardar activationUrl (solo del primer membership)
  let activationUrl = null;
  const membershipsCreadas = [];

  // 6. Procesar cada membership
  for (let i = 0; i < membershipsConfig.length; i++) {
    const configMembership = membershipsConfig[i];
    const esPrimero = (i === 0);

    logger.info(`[Membership] Procesando ${i + 1}/${membershipsConfig.length}: ${configMembership.nombre} (planId: ${configMembership.membershipPlanId})`);

    // Calcular fechas según configuración
    let membershipStartDate, membershipExpiryDate, membershipDurationDays;

    if (configMembership.usarFechaInicio) {
      // Usar fechainicio y duración en días
      membershipStartDate = formatForFR360(fechaInicioBase);
      membershipDurationDays = configMembership.membershipDurationDays;

      const fechaFin = addDays(fechaInicioBase, membershipDurationDays);
      membershipExpiryDate = formatForFR360(fechaFin);

      logger.info(`[Membership] Start: ${membershipStartDate} | Duration: ${membershipDurationDays} días | Expiry: ${membershipExpiryDate}`);
    } else {
      // Usar fecha de hoy como inicio y fecha fija como fin
      membershipStartDate = formatForFR360(new Date());
      membershipExpiryDate = formatForFR360(configMembership.fechaFinFija);

      const fechaFin = configMembership.fechaFinFija;
      const fechaInicio = new Date(membershipStartDate);
      membershipDurationDays = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24));

      logger.info(`[Membership] Start: ${membershipStartDate} | Fecha fin fija: ${membershipExpiryDate} | Duration calculada: ${membershipDurationDays} días`);
    }

    // 7. Preparar payload para API
    const payload = {
      ...datosUsuario,
      membershipPlanId: configMembership.membershipPlanId,
      membershipStartDate
    };

    // Si usa fechainicio + duración: pasar membershipDurationDays
    if (configMembership.usarFechaInicio) {
      payload.membershipDurationDays = membershipDurationDays;
    }
    // Si tiene fecha fija de fin: pasar membershipEndDate en vez de duration
    else {
      payload.membershipEndDate = membershipExpiryDate;
    }

    // Si no es el primero, indicar que cree membership en usuario existente
    if (!esPrimero) {
      payload.createMembershipIfUserExists = true;
      payload.allowDuplicateMemberships = false;
    }

    // 8. Registrar en BD antes de llamar API
    const membershipRecord = {
      webhook_id: webhookId,
      contact_id: contactId,
      membership_plan_id: configMembership.membershipPlanId,
      product: product,
      start_date: new Date(membershipStartDate),
      expiry_date: new Date(membershipExpiryDate)
    };

    // 9. Llamar API o simular según modo
    if (!membershipsEnabled) {
      // MODO TESTING: Solo simular
      logger.info(`[Membership] 🟡 MODO TESTING: Simulando petición a API`);
      logger.info(`[Membership] Payload que se enviaría:`, JSON.stringify(payload, null, 2));

      const activationUrlSimulada = `https://admin-appfr.vercel.app/activar?token=SIMULATED_TOKEN_${Date.now()}`;

      if (esPrimero) {
        activationUrl = activationUrlSimulada;
        membershipRecord.activation_url = activationUrlSimulada;
      }

      membershipsCreadas.push({
        nombre: configMembership.nombre,
        planId: configMembership.membershipPlanId,
        inicio: membershipStartDate,
        fin: membershipExpiryDate,
        duracion: configMembership.usarFechaInicio ? membershipDurationDays : null,
        usaDuracion: configMembership.usarFechaInicio,
        simulado: true
      });

    } else {
      // MODO PRODUCCIÓN: Llamar API real
      logger.info(`[Membership] 🟢 MODO PRODUCCIÓN: Enviando a API`);
      logger.info(`[Membership] Payload enviado:`);
      console.log('========== PAYLOAD COMPLETO ==========');
      console.log(JSON.stringify(payload, null, 2));
      console.log('======================================');

      try {
        const response = await axios.post(config.frapp.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.frapp.apiKey
          },
          timeout: 15000
        });

        if (response.status >= 200 && response.status < 300) {
          logger.info(`[Membership] API respondió con status: ${response.status}`);

          console.log('========== RESPONSE COMPLETO ==========');
          console.log('Status:', response.status);
          console.log('Data:', JSON.stringify(response.data, null, 2));
          console.log('=======================================');

          // Verificar si la API retornó success: false (usuario ya existe)
          if (response.data && response.data.success === false) {
            const errorMsg = response.data.error || '';

            // Si el error es "usuario ya existe", reintentar con createMembershipIfUserExists: true
            if (errorMsg.includes('usuario ya existe') || errorMsg.includes('createMembershipIfUserExists')) {
              logger.info(`[Membership] 🔄 Usuario ya existe, reintentando con createMembershipIfUserExists: true`);

              // Modificar payload para crear solo la membresía
              const retryPayload = {
                ...payload,
                createMembershipIfUserExists: true,
                allowDuplicateMemberships: !esPrimero // Solo permitir duplicados en 2da+ membresía
              };

              console.log('========== RETRY PAYLOAD ==========');
              console.log(JSON.stringify(retryPayload, null, 2));
              console.log('===================================');

              // Reintentar
              const retryResponse = await axios.post(config.frapp.apiUrl, retryPayload, {
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': config.frapp.apiKey
                },
                timeout: 15000
              });

              console.log('========== RETRY RESPONSE ==========');
              console.log('Status:', retryResponse.status);
              console.log('Data:', JSON.stringify(retryResponse.data, null, 2));
              console.log('====================================');

              // Capturar activationUrl del retry (check both formats)
              const retryUrlOld = retryResponse.data?.activationUrl;
              const retryUrlNew = retryResponse.data?.data?.activation?.activationUrl;
              const retryFoundUrl = retryUrlNew || retryUrlOld;

              if (retryFoundUrl) {
                activationUrl = retryFoundUrl;
                membershipRecord.activation_url = activationUrl;
                logger.info(`[Membership] ✅ activationUrl capturada (después de retry): ${activationUrl}`);
              } else {
                logger.warn(`[Membership] ⚠️ Retry NO retornó activationUrl`);
                logger.warn(`[Membership] Retry response structure:`, JSON.stringify(retryResponse.data, null, 2));
              }

              membershipsCreadas.push({
                nombre: configMembership.nombre,
                planId: configMembership.membershipPlanId,
                inicio: membershipStartDate,
                fin: membershipExpiryDate,
                duracion: configMembership.usarFechaInicio ? membershipDurationDays : null,
                usaDuracion: configMembership.usarFechaInicio,
                simulado: false,
                responseData: retryResponse.data
              });

              logger.info(`[Membership] ✅ Membresía creada exitosamente (usuario existente)`);

            } else {
              // Otro tipo de error
              throw new Error(`API retornó success: false - ${errorMsg}`);
            }

          } else if (response.data && response.data.success === true) {
            // Respuesta exitosa normal
            logger.info(`[Membership] ✅ API respondió exitosamente`);

            // Capturar activationUrl si viene en la respuesta
            // La estructura puede ser:
            // - response.data.activationUrl (formato antiguo)
            // - response.data.data.activation.activationUrl (formato nuevo)
            const urlFromOldFormat = response.data.activationUrl;
            const urlFromNewFormat = response.data.data?.activation?.activationUrl;
            const foundUrl = urlFromNewFormat || urlFromOldFormat;

            if (foundUrl) {
              activationUrl = foundUrl;
              membershipRecord.activation_url = activationUrl;
              logger.info(`[Membership] ✅ activationUrl capturada: ${activationUrl}`);
            } else if (esPrimero) {
              logger.warn(`[Membership] ⚠️ Primera membresía NO retornó activationUrl`);
              logger.warn(`[Membership] Response structure:`, JSON.stringify(response.data, null, 2));
            }

            membershipsCreadas.push({
              nombre: configMembership.nombre,
              planId: configMembership.membershipPlanId,
              inicio: membershipStartDate,
              fin: membershipExpiryDate,
              duracion: configMembership.usarFechaInicio ? membershipDurationDays : null,
              usaDuracion: configMembership.usarFechaInicio,
              simulado: false,
              responseData: response.data
            });

          } else {
            // Respuesta sin campo 'success' (formato inesperado)
            logger.warn(`[Membership] ⚠️ Respuesta sin campo 'success', asumiendo éxito por status 200`);

            membershipsCreadas.push({
              nombre: configMembership.nombre,
              planId: configMembership.membershipPlanId,
              inicio: membershipStartDate,
              fin: membershipExpiryDate,
              duracion: configMembership.usarFechaInicio ? membershipDurationDays : null,
              usaDuracion: configMembership.usarFechaInicio,
              simulado: false,
              responseData: response.data
            });
          }

        } else {
          throw new Error(`API respondió con código ${response.status}`);
        }

      } catch (error) {
        logger.error(`[Membership] Error llamando API:`, error);
        throw new Error(`Error creando membership ${configMembership.nombre}: ${error.message}`);
      }
    }

    // 10. Guardar en BD
    if (webhookId) {
      await Membership.create(membershipRecord);
      logger.info(`[Membership] Membership guardada en BD`);
    }

    // Pequeña pausa entre memberships
    if (i < membershipsConfig.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 11. Preparar etiquetas a aplicar
  const etiquetas = [ETIQUETA_NUEVA_PLATAFORMA];

  // Agregar etiqueta según el primer membershipPlanId
  const primerPlanId = membershipsConfig[0].membershipPlanId;
  if (ETIQUETAS_POR_PLAN[primerPlanId]) {
    etiquetas.push(ETIQUETAS_POR_PLAN[primerPlanId]);
  }

  logger.info(`[Membership] Etiquetas a aplicar: ${etiquetas.join(', ')}`);

  // 12. Notificar resultado usando notifyStep (PASO 3)
  const resumenMensaje = membershipsCreadas.map((m, idx) => {
    let detalle = `${idx + 1}. ${m.nombre} (Plan ID: ${m.planId})\n`;
    detalle += `   • Inicia: ${m.inicio}\n`;

    if (m.usaDuracion) {
      detalle += `   • Duración: ${m.duracion} días`;
    } else {
      detalle += `   • Fecha fin fija: ${m.fin}`;
    }

    return detalle;
  }).join('\n\n');

  const tituloModo = membershipsEnabled
    ? '✅ MEMBRESÍAS CREADAS EN PRODUCCIÓN'
    : '🟡 SIMULACIÓN: MEMBRESÍAS QUE SE CREARÍAN';

  // Calcular duración del paso
  const paso3Duration = startTimestamp ? Date.now() - startTimestamp : null;

  await notificationService.notifyStep(3, 'CREACIÓN DE MEMBRESÍAS (FRAPP)', {
    'Producto': product,
    'Email': email,
    'Cliente': `${givenName} ${familyName}`,
    'ID': identityDocument,
    'Teléfono': phone,
    'Modo': modoActual,
    'Membresías': `\n${resumenMensaje}`,
    'Activation URL': activationUrl || 'N/A',
    'Resultado': tituloModo
  }, paso3Duration);

  logger.info(`[Membership] Proceso completado. Activation URL: ${activationUrl || 'N/A'}`);

  // 13. Retornar datos completos (activationUrl, etiquetas, memberships)
  return {
    activationUrl,
    etiquetas,
    membershipsCreadas
  };
}

module.exports = {
  createMemberships
};
