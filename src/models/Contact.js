const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  crm_id: {
    type: DataTypes.STRING(100),
    unique: true,
    field: 'crm_id'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255)
  },
  phone: {
    type: DataTypes.STRING(50)
  },
  identity_document: {
    type: DataTypes.STRING(50),
    field: 'identity_document'
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
  tableName: 'contacts',
  timestamps: false,
  indexes: [
    { fields: ['email'] },
    { fields: ['crm_id'] }
  ]
});

module.exports = Contact;
