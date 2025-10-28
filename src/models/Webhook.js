const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Webhook = sequelize.define('Webhook', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ref_payco: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    field: 'ref_payco'
  },
  transaction_id: {
    type: DataTypes.STRING(255),
    field: 'transaction_id'
  },
  invoice_id: {
    type: DataTypes.STRING(255),
    field: 'invoice_id'
  },
  customer_email: {
    type: DataTypes.STRING(255),
    field: 'customer_email'
  },
  customer_name: {
    type: DataTypes.STRING(255),
    field: 'customer_name'
  },
  customer_city: {
    type: DataTypes.STRING(255),
    field: 'customer_city'
  },
  customer_address: {
    type: DataTypes.TEXT,
    field: 'customer_address'
  },
  product: {
    type: DataTypes.STRING(255)
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2)
  },
  currency: {
    type: DataTypes.STRING(10)
  },
  response: {
    type: DataTypes.STRING(50)
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending'
  },
  current_stage: {
    type: DataTypes.STRING(100),
    field: 'current_stage',
    allowNull: true,
    comment: 'Stage actual en procesamiento'
  },
  last_completed_stage: {
    type: DataTypes.STRING(100),
    field: 'last_completed_stage',
    allowNull: true,
    comment: 'Último stage completado con éxito'
  },
  processing_context: {
    type: DataTypes.JSONB,
    field: 'processing_context',
    defaultValue: {},
    comment: 'Stores cached data from each completed stage to avoid re-executing API calls'
  },
  completed_stages: {
    type: DataTypes.JSONB,
    field: 'completed_stages',
    defaultValue: [],
    comment: 'Array of stage names that completed successfully (checkpoint list)'
  },
  failed_stage: {
    type: DataTypes.STRING(100),
    field: 'failed_stage',
    allowNull: true,
    comment: 'The exact stage where processing failed'
  },
  retry_count: {
    type: DataTypes.INTEGER,
    field: 'retry_count',
    defaultValue: 0,
    comment: 'Number of times this webhook has been retried'
  },
  last_retry_at: {
    type: DataTypes.DATE,
    field: 'last_retry_at',
    allowNull: true,
    comment: 'Timestamp of the last retry attempt'
  },
  is_retriable: {
    type: DataTypes.BOOLEAN,
    field: 'is_retriable',
    defaultValue: true,
    comment: 'Whether this webhook can be retried (false for fatal errors)'
  },
  raw_data: {
    type: DataTypes.JSONB,
    field: 'raw_data'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'webhooks',
  timestamps: false,
  indexes: [
    { fields: ['ref_payco'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
    { fields: ['customer_email'] },
    { fields: ['current_stage'] },
    { fields: ['last_completed_stage'] },
    { fields: ['failed_stage'] },
    { fields: ['is_retriable'] },
    { fields: ['retry_count'] }
  ]
});

module.exports = Webhook;
