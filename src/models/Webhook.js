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
    { fields: ['customer_email'] }
  ]
});

module.exports = Webhook;
