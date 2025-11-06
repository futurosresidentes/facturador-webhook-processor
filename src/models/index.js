const Webhook = require('./Webhook');
const WebhookLog = require('./WebhookLog');
const Membership = require('./Membership');
// const Contact = require('./Contact'); // DESHABILITADO: tabla no existe en Supabase
const FeatureFlag = require('./FeatureFlag');

// Define relationships
Webhook.hasMany(WebhookLog, { foreignKey: 'webhook_id', as: 'logs' });
WebhookLog.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });

// Relationship con Membership (para auditoría local)
Webhook.hasMany(Membership, { foreignKey: 'webhook_id', as: 'memberships' });
Membership.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });

// DESHABILITADO: Contact no existe en Supabase, datos vienen de Frapp CRM
// Contact.hasMany(Membership, { foreignKey: 'contact_id', as: 'memberships' });
// Membership.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

module.exports = {
  Webhook,
  WebhookLog,
  Membership,
  // Contact, // DESHABILITADO
  FeatureFlag
};
