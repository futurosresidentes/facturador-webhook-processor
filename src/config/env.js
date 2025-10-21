require('dotenv').config();

module.exports = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,

  // Database
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // FR360
  fr360: {
    apiUrl: process.env.FR360_API_URL,
    bearerToken: process.env.FR360_BEARER_TOKEN,
    maxRetries: parseInt(process.env.FR360_MAX_RETRIES || '5'),
    retryDelay: parseInt(process.env.FR360_RETRY_DELAY || '1000')
  },

  // ActiveCampaign
  activeCampaign: {
    baseUrl: process.env.AC_BASE_URL,
    apiToken: process.env.AC_API_TOKEN,
    maxRetries: parseInt(process.env.AC_MAX_RETRIES || '5'),
    retryDelay: parseInt(process.env.AC_RETRY_DELAY || '1000')
  },

  // Frapp
  frapp: {
    apiUrl: process.env.FRAPP_API_URL,
    apiKey: process.env.FRAPP_API_KEY,
    crmAccount: process.env.FRAPP_CRM_ACCOUNT,
    crmApiToken: process.env.FRAPP_CRM_API_TOKEN,
    modoProduccion: process.env.FRAPP_MODO_PRODUCCION === 'true',
    maxIntentos: parseInt(process.env.FRAPP_MAX_INTENTOS || '5'),
    delayMs: parseInt(process.env.FRAPP_DELAY_MS || '1000')
  },

  // Google Chat
  googleChat: {
    successWebhook: process.env.GCHAT_SUCCESS_WEBHOOK,
    errorWebhook: process.env.GCHAT_ERROR_WEBHOOK,
    crmErrorWebhook: process.env.GCHAT_CRM_ERROR_WEBHOOK,
    frappWebhook: process.env.GCHAT_FRAPP_WEBHOOK
  },

  // ePayco
  epayco: {
    publicKey: process.env.EPAYCO_PUBLIC_KEY,
    privateKey: process.env.EPAYCO_PRIVATE_KEY,
    testMode: process.env.EPAYCO_TEST_MODE === 'true'
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change_this_secret_in_production'
  },

  // API Security
  api: {
    bearerToken: process.env.API_BEARER_TOKEN
  },

  // World Office (Facturador)
  worldOffice: {
    apiUrl: process.env.WORLDOFFICE_API_URL,
    apiToken: process.env.WORLDOFFICE_API_TOKEN,
    username: process.env.WORLDOFFICE_USERNAME,
    password: process.env.WORLDOFFICE_PASSWORD,
    modoProduccion: process.env.WORLDOFFICE_MODO_PRODUCCION === 'true',
    emitirDian: process.env.WORLDOFFICE_EMITIR_DIAN === 'true'
  },

  // Strapi Facturación
  strapi: {
    apiUrl: process.env.STRAPI_API_URL,
    apiToken: process.env.STRAPI_API_TOKEN
  },

  // Callbell (WhatsApp notifications)
  callbell: {
    apiUrl: process.env.CALLBELL_API_URL,
    apiKey: process.env.CALLBELL_API_KEY
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    maxSize: process.env.LOG_MAX_SIZE || '20m'
  }
};
