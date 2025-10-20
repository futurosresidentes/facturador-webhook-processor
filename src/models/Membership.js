const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Membership = sequelize.define('Membership', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  webhook_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'webhooks',
      key: 'id'
    },
    field: 'webhook_id'
  },
  contact_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'contacts',
      key: 'id'
    },
    field: 'contact_id'
  },
  membership_plan_id: {
    type: DataTypes.INTEGER,
    field: 'membership_plan_id'
  },
  product: {
    type: DataTypes.STRING(255)
  },
  activation_url: {
    type: DataTypes.TEXT,
    field: 'activation_url'
  },
  start_date: {
    type: DataTypes.DATE,
    field: 'start_date'
  },
  expiry_date: {
    type: DataTypes.DATE,
    field: 'expiry_date'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'memberships',
  timestamps: false,
  indexes: [
    { fields: ['webhook_id'] },
    { fields: ['contact_id'] },
    { fields: ['membership_plan_id'] }
  ]
});

module.exports = Membership;
