/**
 * CRM Service V2 - Estrategia Create-First
 * Intenta crear primero, si existe entonces actualiza
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../config/logger');
const { retryOperation } = require('../utils/retryHelper');

/**
 * Normaliza el teléfono agregando +57 si es necesario
 * @param {string} telefono - Número de teléfono
 * @returns {string} - Teléfono normalizado
 */
function normalizePhone(telefono) {
  if (!telefono) return '';

  const cleanPhone = telefono.trim();

  // Si ya tiene +57 o +, retornar tal cual
  if (cleanPhone.startsWith('+')) {
    return cleanPhone;
  }

  // Si es un número de 10 dígitos que empieza con 3 (celular colombiano)
  if (/^3\d{9}$/.test(cleanPhone)) {
    return '+57' + cleanPhone;
  }

  return cleanPhone;
}

/**
 * Intenta crear un contacto en ActiveCampaign
 * @param {Object} data - Datos del contacto
 * @param {string} data.correo - Email
 * @param {string} data.nombres - Nombre
 * @param {string} data.apellidos - Apellido
 * @param {string} data.telefono - Teléfono
 * @param {string} data.cedula - Cédula
 * @param {string} data.ciudad - Ciudad (opcional, puede ser null)
 * @param {string} data.direccion - Dirección (opcional, puede ser null)
 * @returns {Promise<Object>} - Contacto creado o información de duplicado
 */
async function createContact(data) {
  const url = `${config.activeCampaign.baseUrl}/contacts`;

  const operation = async () => {
    const fieldValues = [];

    // Campo 2: Cédula (siempre presente)
    if (data.cedula) {
      fieldValues.push({
        field: '2',
        value: data.cedula
      });
    }

    // Campo 5: Ciudad (solo si no es null)
    if (data.ciudad) {
      fieldValues.push({
        field: '5',
        value: data.ciudad
      });
    }

    // Campo 6: Dirección (solo si no es null)
    if (data.direccion) {
      fieldValues.push({
        field: '6',
        value: data.direccion
      });
    }

    const contactData = {
      contact: {
        email: data.correo,
        firstName: data.nombres || '',
        lastName: data.apellidos || '',
        phone: normalizePhone(data.telefono),
        fieldValues
      }
    };

    logger.info(`[CRM] Intentando crear contacto: ${data.correo}`);

    const response = await axios.post(url, contactData, {
      headers: {
        'Api-Token': config.activeCampaign.apiToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // No lanzar error en 4xx
    });

    // Si fue creado exitosamente
    if (response.status >= 200 && response.status < 300) {
      logger.info(`[CRM] Contacto creado exitosamente: ${response.data.contact.id}`);
      return {
        created: true,
        contact: response.data.contact
      };
    }

    // Si es un error de duplicado
    if (response.status === 422 || response.status === 400) {
      const errors = response.data.errors || [];
      const isDuplicate = errors.some(err =>
        err.code === 'duplicate' ||
        err.title?.toLowerCase().includes('correo') ||
        err.title?.toLowerCase().includes('email')
      );

      if (isDuplicate) {
        logger.info(`[CRM] Contacto duplicado detectado: ${data.correo}`);
        return {
          created: false,
          duplicate: true,
          email: data.correo
        };
      }
    }

    // Cualquier otro error
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
  };

  return await retryOperation(operation, {
    maxRetries: 5,
    delayMs: 1000,
    operationName: `CRM Create Contact (${data.correo})`
  });
}

/**
 * Busca un contacto por email
 * @param {string} email - Email del contacto
 * @returns {Promise<Object|null>} - Contacto encontrado o null
 */
async function findContactByEmail(email) {
  const url = `${config.activeCampaign.baseUrl}/contacts?email=${encodeURIComponent(email)}`;

  const operation = async () => {
    logger.info(`[CRM] Buscando contacto por email: ${email}`);

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
        logger.info(`[CRM] Contacto no encontrado`);
        return null;
      }
    }

    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
  };

  return await retryOperation(operation, {
    maxRetries: 5,
    delayMs: 1000,
    operationName: `CRM Find Contact (${email})`
  });
}

/**
 * Actualiza un contacto existente
 * @param {string} contactId - ID del contacto en ActiveCampaign
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} - Contacto actualizado
 */
async function updateContact(contactId, data) {
  const url = `${config.activeCampaign.baseUrl}/contacts/${contactId}`;

  const operation = async () => {
    const fieldValues = [];

    // Campo 2: Cédula
    if (data.cedula) {
      fieldValues.push({
        field: '2',
        value: data.cedula
      });
    }

    // Campo 5: Ciudad (solo si no es null)
    if (data.ciudad) {
      fieldValues.push({
        field: '5',
        value: data.ciudad
      });
    }

    // Campo 6: Dirección (solo si no es null)
    if (data.direccion) {
      fieldValues.push({
        field: '6',
        value: data.direccion
      });
    }

    const contactData = {
      contact: {
        firstName: data.nombres || '',
        lastName: data.apellidos || '',
        phone: normalizePhone(data.telefono),
        fieldValues
      }
    };

    logger.info(`[CRM] Actualizando contacto ${contactId}`);

    const response = await axios.put(url, contactData, {
      headers: {
        'Api-Token': config.activeCampaign.apiToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status >= 200 && response.status < 300) {
      logger.info(`[CRM] Contacto actualizado exitosamente: ${contactId}`);
      return response.data.contact;
    }

    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
  };

  return await retryOperation(operation, {
    maxRetries: 5,
    delayMs: 1000,
    operationName: `CRM Update Contact (${contactId})`
  });
}

/**
 * Estrategia Create-First: Intenta crear, si falla por duplicado entonces actualiza
 * @param {Object} paymentData - Datos del payment link de FR360
 * @param {Object} webhookData - Datos del webhook de ePayco (ciudad, dirección)
 * @returns {Promise<Object>} - Contacto final (creado o actualizado)
 */
async function createOrUpdateContact(paymentData, webhookData) {
  const data = {
    correo: paymentData.email || paymentData.correo,
    nombres: paymentData.givenName || paymentData.nombres,
    apellidos: paymentData.familyName || paymentData.apellidos,
    telefono: paymentData.phone || paymentData.telefono,
    cedula: paymentData.identityDocument || paymentData.cedula,
    ciudad: webhookData.customer_city, // puede ser null
    direccion: webhookData.customer_address // puede ser null
  };

  logger.info(`[CRM] Iniciando create-or-update para: ${data.correo}`);

  // 1. Intentar crear primero
  const createResult = await createContact(data);

  // Si se creó exitosamente, retornar
  if (createResult.created) {
    return {
      action: 'created',
      contact: createResult.contact
    };
  }

  // 2. Si es duplicado, buscar y actualizar
  if (createResult.duplicate) {
    logger.info(`[CRM] Contacto duplicado, buscando para actualizar...`);

    const existingContact = await findContactByEmail(data.correo);

    if (!existingContact) {
      throw new Error(`[CRM] Contacto reportado como duplicado pero no encontrado: ${data.correo}`);
    }

    // Actualizar el contacto existente
    const updatedContact = await updateContact(existingContact.id, data);

    return {
      action: 'updated',
      contact: updatedContact
    };
  }

  throw new Error(`[CRM] Resultado inesperado en createOrUpdateContact`);
}

module.exports = {
  createContact,
  findContactByEmail,
  updateContact,
  createOrUpdateContact,
  normalizePhone
};
