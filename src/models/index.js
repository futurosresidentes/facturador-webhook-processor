const Webhook = require('./Webhook');
const WebhookLog = require('./WebhookLog');
// const Contact = require('./Contact'); // DESHABILITADO: tabla no existe en Supabase
// const Membership = require('./Membership'); // DESHABILITADO: tabla no existe en Supabase
const FeatureFlag = require('./FeatureFlag');

// Define relationships
Webhook.hasMany(WebhookLog, { foreignKey: 'webhook_id', as: 'logs' });
WebhookLog.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });

// DESHABILITADO: tablas contacts y memberships no existen en Supabase
// Estos datos se manejan vía APIs externas (Frapp CRM)
// Webhook.hasMany(Membership, { foreignKey: 'webhook_id', as: 'memberships' });
// Membership.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });
// Contact.hasMany(Membership, { foreignKey: 'contact_id', as: 'memberships' });
// Membership.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

module.exports = {
  Webhook,
  WebhookLog,
  // Contact, // DESHABILITADO
  // Membership, // DESHABILITADO
  FeatureFlag
};
