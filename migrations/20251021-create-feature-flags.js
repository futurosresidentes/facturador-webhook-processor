/**
 * Migration: Crear tabla de feature flags (switches de configuración)
 * Permite activar/desactivar funcionalidades sin deployar
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Crear tabla feature_flags
    await queryInterface.createTable('feature_flags', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
        comment: 'Identificador único del switch'
      },
      value: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'true = activado, false = desactivado'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Descripción de qué hace este switch'
      },
      updated_by: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Quién realizó el último cambio'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Crear índice único en key
    await queryInterface.addIndex('feature_flags', ['key'], {
      unique: true,
      name: 'feature_flags_key_unique'
    });

    // Insertar switches iniciales
    await queryInterface.bulkInsert('feature_flags', [
      {
        key: 'MEMBERSHIPS_ENABLED',
        value: false,
        description: 'Controla si se crean membresías en Frapp. false = MODO TESTING (simula), true = MODO PRODUCCIÓN (crea real)',
        updated_by: 'migration',
        updated_at: new Date()
      },
      {
        key: 'WORLDOFFICE_INVOICE_ENABLED',
        value: false,
        description: 'Controla si se crean facturas en World Office. false = MODO TESTING (simula), true = MODO PRODUCCIÓN (crea real)',
        updated_by: 'migration',
        updated_at: new Date()
      },
      {
        key: 'WORLDOFFICE_DIAN_ENABLED',
        value: false,
        description: 'Controla si se emiten facturas ante la DIAN. false = DESACTIVADO (skip), true = ACTIVADO (emite)',
        updated_by: 'migration',
        updated_at: new Date()
      }
    ]);

    console.log('✅ Tabla feature_flags creada con switches iniciales');
    console.log('   • MEMBERSHIPS_ENABLED: false (TESTING)');
    console.log('   • WORLDOFFICE_INVOICE_ENABLED: false (TESTING)');
    console.log('   • WORLDOFFICE_DIAN_ENABLED: false (DESACTIVADO)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('feature_flags');
  }
};
