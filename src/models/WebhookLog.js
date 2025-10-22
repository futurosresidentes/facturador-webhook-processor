const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WebhookLog = sequelize.define('WebhookLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  webhook_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'webhooks',
      key: 'id'
    },
    field: 'webhook_id'
  },
  stage: {
    type: DataTypes.STRING(100)
  },
  status: {
    type: DataTypes.STRING(50)
  },
  details: {
    type: DataTypes.TEXT
  },
  request_payload: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'request_payload'
  },
  response_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'response_data'
  },
  error_message: {
    type: DataTypes.TEXT,
    field: 'error_message'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'webhook_processing_logs',
  timestamps: false,
  indexes: [
    { fields: ['webhook_id'] },
    { fields: ['stage'] },
    { fields: ['status'] }
  ]
});

module.exports = WebhookLog;
