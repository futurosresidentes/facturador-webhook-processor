const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');
const { getProductBase } = require('../utils/productFilter');
const { obtenerConfiguracionMemberships } = require('../utils/promotions');
const { addDays, formatForFR360, isValidDate } = require('../utils/dateHelpers');
const { Membership } = require('../models');
const notificationService = require('./notificationService');

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
    webhookId
  } = params;

  const modoActual = config.frapp.modoProduccion ? 'PRODUCCIÓN' : 'TESTING';

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
      membershipExpiryDate = configMembership.membershipExpiryDate;

      const fechaFin = new Date(membershipExpiryDate);
      const fechaInicio = new Date(membershipStartDate);
      membershipDurationDays = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24));

      logger.info(`[Membership] Start: ${membershipStartDate} | Expiry (fija): ${membershipExpiryDate} | Duration: ${membershipDurationDays} días`);
    }

    // 7. Preparar payload para API
    const payload = {
      ...datosUsuario,
      membershipPlanId: configMembership.membershipPlanId,
      membershipStartDate,
      membershipExpiryDate,
      membershipDurationDays
    };

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
    if (!config.frapp.modoProduccion) {
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
        duracion: membershipDurationDays,
        simulado: true
      });

    } else {
      // MODO PRODUCCIÓN: Llamar API real
      logger.info(`[Membership] 🟢 MODO PRODUCCIÓN: Enviando a API`);

      try {
        const response = await axios.post(config.frapp.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.frapp.apiKey
          },
          timeout: 15000
        });

        if (response.status >= 200 && response.status < 300) {
          logger.info(`[Membership] API respondió exitosamente: ${response.status}`);

          if (esPrimero && response.data && response.data.activationUrl) {
            activationUrl = response.data.activationUrl;
            membershipRecord.activation_url = activationUrl;
          }

          membershipsCreadas.push({
            nombre: configMembership.nombre,
            planId: configMembership.membershipPlanId,
            inicio: membershipStartDate,
            fin: membershipExpiryDate,
            duracion: membershipDurationDays,
            simulado: false,
            responseData: response.data
          });

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

  // 11. Notificar resultado
  const resumenMensaje = membershipsCreadas.map((m, idx) =>
    `${idx + 1}. ${m.nombre} (Plan ID: ${m.planId})\n   • Inicia: ${m.inicio}\n   • ${m.duracion ? `Duración: ${m.duracion} días` : `Fin: ${m.fin}`}`
  ).join('\n\n');

  const notificationData = {
    'Cliente': `${givenName} ${familyName}`,
    'Email': email,
    'ID': identityDocument,
    'Teléfono': phone,
    'Producto comprado': product,
    'Modo': modoActual,
    'Membresías': `\n${resumenMensaje}`,
    'Activation URL': activationUrl || 'N/A'
  };

  if (!config.frapp.modoProduccion) {
    await notificationService.notifyFrapp('🟡 SIMULACIÓN: MEMBRESÍAS QUE SE CREARÍAN', notificationData);
  } else {
    await notificationService.notifyFrapp('✅ MEMBRESÍAS CREADAS EN PRODUCCIÓN', notificationData);
  }

  logger.info(`[Membership] Proceso completado. Activation URL: ${activationUrl || 'N/A'}`);

  return activationUrl;
}

module.exports = {
  createMemberships
};
