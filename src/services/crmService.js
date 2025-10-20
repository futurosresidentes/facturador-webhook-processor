const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');
const { Contact } = require('../models');

/**
 * Busca un contacto en ActiveCampaign por email
 * @param {string} email - Email del contacto
 * @returns {Object|null} - Contacto encontrado o null
 */
async function findContactByEmail(email) {
  const url = `${config.activeCampaign.baseUrl}/contacts?email=${encodeURIComponent(email)}`;
  const maxRetries = config.activeCampaign.maxRetries;
  const retryDelay = config.activeCampaign.retryDelay;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[CRM] Buscando contacto - Intento ${attempt}/${maxRetries}`);

      const response = await axios.get(url, {
        headers: {
          'Api-Token': config.activeCampaign.apiToken,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status >= 200 && response.status < 300) {
        const result = response.data;

        if (result.contacts && result.contacts.length > 0) {
          logger.info(`[CRM] Contacto encontrado: ${result.contacts[0].id}`);
          return result.contacts[0];
        } else {
          logger.info(`[CRM] Contacto no encontrado en CRM`);
          return null;
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
      }

    } catch (error) {
      lastError = error;
      logger.warn(`[CRM] Error buscando contacto en intento ${attempt}/${maxRetries}: ${error.message}`);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`[CRM] Falló búsqueda después de ${maxRetries} intentos: ${lastError.message}`);
}

/**
 * Crea un nuevo contacto en ActiveCampaign
 * @param {Object} paymentLinkData - Datos del payment link
 * @returns {Object} - Contacto creado
 */
async function createContact(paymentLinkData) {
  const url = `${config.activeCampaign.baseUrl}/contacts`;

  const contactData = {
    contact: {
      email: paymentLinkData.email,
      firstName: paymentLinkData.givenName || '',
      lastName: paymentLinkData.familyName || '',
      phone: paymentLinkData.phone || '',
      fieldValues: []
    }
  };

  // Agregar campo personalizado para documento de identidad si existe
  if (paymentLinkData.identityDocument) {
    contactData.contact.fieldValues.push({
      field: '1', // ID del campo personalizado (ajustar según tu AC)
      value: paymentLinkData.identityDocument
    });
  }

  try {
    logger.info(`[CRM] Creando nuevo contacto: ${paymentLinkData.email}`);

    const response = await axios.post(url, contactData, {
      headers: {
        'Api-Token': config.activeCampaign.apiToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status >= 200 && response.status < 300) {
      logger.info(`[CRM] Contacto creado exitosamente: ${response.data.contact.id}`);
      return response.data.contact;
    } else {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }

  } catch (error) {
    logger.error(`[CRM] Error creando contacto:`, error);
    throw new Error(`[CRM] Error creando contacto: ${error.message}`);
  }
}

/**
 * Busca o crea un contacto en el CRM y en la base de datos local
 * @param {Object} paymentLinkData - Datos del payment link de FR360
 * @returns {Object} - Contacto con CRM ID
 */
async function findOrCreateContact(paymentLinkData) {
  const email = paymentLinkData.email;

  if (!email) {
    throw new Error('[CRM] El email es requerido');
  }

  try {
    // 1. Buscar en base de datos local primero
    let localContact = await Contact.findOne({ where: { email } });

    if (localContact) {
      logger.info(`[CRM] Contacto encontrado en BD local: ${localContact.crm_id}`);
      return localContact;
    }

    // 2. Buscar en ActiveCampaign
    let crmContact = await findContactByEmail(email);

    // 3. Si no existe, crear en ActiveCampaign
    if (!crmContact) {
      logger.info(`[CRM] Contacto no existe, creando nuevo...`);
      crmContact = await createContact(paymentLinkData);
    }

    // 4. Guardar en base de datos local
    localContact = await Contact.create({
      crm_id: crmContact.id,
      email: email,
      name: `${paymentLinkData.givenName || ''} ${paymentLinkData.familyName || ''}`.trim(),
      phone: paymentLinkData.phone,
      identity_document: paymentLinkData.identityDocument
    });

    logger.info(`[CRM] Contacto guardado en BD local: ${localContact.id}`);

    return localContact;

  } catch (error) {
    logger.error(`[CRM] Error en findOrCreateContact:`, error);
    throw error;
  }
}

module.exports = {
  findContactByEmail,
  createContact,
  findOrCreateContact
};
