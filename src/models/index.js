const Webhook = require('./Webhook');
const WebhookLog = require('./WebhookLog');
const Contact = require('./Contact');
const Membership = require('./Membership');

// Define relationships
Webhook.hasMany(WebhookLog, { foreignKey: 'webhook_id', as: 'logs' });
WebhookLog.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });

Webhook.hasMany(Membership, { foreignKey: 'webhook_id', as: 'memberships' });
Membership.belongsTo(Webhook, { foreignKey: 'webhook_id', as: 'webhook' });

Contact.hasMany(Membership, { foreignKey: 'contact_id', as: 'memberships' });
Membership.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

module.exports = {
  Webhook,
  WebhookLog,
  Contact,
  Membership
};
